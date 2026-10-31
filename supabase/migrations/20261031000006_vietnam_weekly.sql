-- 2026-10-31: Thanh Cong Lunch Request 개편
--  · 시간대: 베트남(Asia/Ho_Chi_Minh)
--  · 마감: 매주 금요일 17:00에 다음 주(월~일) 신청 마감
--  · 손님: 내 신청과 따로 "손님만 추가" (누구나, 내 신청은 그대로)
--  · 요리사 시트(모두 볼 수 있음), 월별 식사 횟수표, 1인 예산 VND 150,000
--  · 알림은 종류(kind)와 값(params)으로 저장해서 앱이 언어별로 보여준다
--  · 한국 공휴일 → 베트남 공휴일
-- 이미 setup.sql을 실행한 프로젝트에서는 이 파일만 SQL Editor에서 한 번 실행하면 된다. 여러 번 실행해도 된다.

-- ---------- 설정 ----------
insert into lunch.settings (key, value) values
  ('timezone', 'Asia/Ho_Chi_Minh'),
  ('deadline_weekday', '5'),     -- 1=월 ... 5=금: 이 요일에 다음 주 신청 마감
  ('deadline_hour', '17'),       -- 마감 시각
  ('meal_price', '150000'),      -- 1인 1식 예산 (VND)
  ('currency', 'VND')
on conflict (key) do nothing;

-- ---------- 시각 (베트남) ----------
create or replace function lunch_private.local_now() returns timestamp
language sql stable security definer set search_path = lunch as $$
  select lunch_private.now() at time zone coalesce((select value from settings where key = 'timezone'), 'Asia/Ho_Chi_Minh');
$$;

-- 예전 이름(kst_*)을 그대로 쓰는 함수가 많아서 이름은 두고 시간대만 바꾼다
create or replace function lunch_private.kst_today() returns date
language sql stable as $$ select lunch_private.local_now()::date; $$;

create or replace function lunch_private.kst_hour() returns int
language sql stable as $$ select extract(hour from lunch_private.local_now())::int; $$;

-- 식사일 d가 속한 주(월요일 시작)의 바로 전 주 마감 요일·시각
create or replace function lunch_private.deadline_at(d date) returns timestamp
language sql stable as $$
  select (d - (extract(isodow from d)::int - 1) - 7 + (lunch_private.setting_int('deadline_weekday') - 1))::timestamp
    + make_interval(hours => lunch_private.setting_int('deadline_hour'));
$$;

create or replace function lunch_private.deadline_of(d date) returns date
language sql stable as $$ select lunch_private.deadline_at(d)::date; $$;

create or replace function lunch_private.phase_of(d date) returns text
language sql stable as $$
  select case
    when d < lunch_private.kst_today() then 'past'
    when d = lunch_private.kst_today() then 'today'
    when lunch_private.local_now() < lunch_private.deadline_at(d) then 'open'
    else 'confirmed' end;
$$;

-- ---------- 손님 (내 신청과 따로) ----------
create table if not exists lunch.guest_entries (
  id bigint generated always as identity primary key,
  date date not null,
  host_id uuid not null references lunch.profiles (id) on delete cascade,
  count int not null check (count between 1 and 100),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists guest_entries_date on lunch.guest_entries (date);
alter table lunch.guest_entries enable row level security;
drop policy if exists "read guests" on lunch.guest_entries;
create policy "read guests" on lunch.guest_entries for select to authenticated using (lunch.is_active_user());
revoke insert, update, delete, truncate on lunch.guest_entries from anon, authenticated;
grant select on lunch.guest_entries to authenticated;

-- 예전에 내 신청에 붙여 넣었던 손님은 따로 떼어 둔다
insert into lunch.guest_entries (date, host_id, count, note)
select date, user_id, guests, guest_note from lunch.signups where guests > 0;
update lunch.signups set guests = 0, guest_note = null where guests > 0;

create or replace function lunch_private.guest_count(d date) returns int
language sql stable security definer set search_path = lunch as $$
  select (select coalesce(sum(guests), 0) from signups where date = d)::int
       + (select coalesce(sum(count), 0) from guest_entries where date = d)::int;
$$;

create or replace function lunch.add_guests(p_date date, p_count int, p_note text default null) returns jsonb
language plpgsql security definer set search_path = lunch as $$
declare u profiles := lunch_private.require_user();
begin
  if not lunch_private.is_meal_day(p_date) then raise exception '이날은 점심 운영을 하지 않아요.'; end if;
  if lunch_private.phase_of(p_date) <> 'open' and not u.is_admin then
    raise exception '신청 마감됐어요. (%까지)', lunch_private.fmt_day(lunch_private.deadline_of(p_date));
  end if;
  if p_count is null or p_count < 1 or p_count > lunch_private.setting_int('max_guests') then
    raise exception '손님 수는 1~%명이에요.', lunch_private.setting_int('max_guests');
  end if;
  insert into guest_entries (date, host_id, count, note) values (p_date, u.id, p_count, left(nullif(trim(p_note), ''), 50));
  perform lunch_private.audit(u.id, 'guests.add', jsonb_build_object('date', p_date, 'count', p_count, 'note', p_note));
  return lunch_private.day_view(p_date, u.id);
end;
$$;

create or replace function lunch.delete_guests(p_id bigint) returns void
language plpgsql security definer set search_path = lunch as $$
declare u profiles := lunch_private.require_user(); g guest_entries;
begin
  select * into g from guest_entries where id = p_id;
  if g.id is null then raise exception '없는 손님 신청이에요.'; end if;
  if not u.is_admin then
    if g.host_id <> u.id then raise exception '본인이 추가한 손님만 지울 수 있어요.'; end if;
    if lunch_private.phase_of(g.date) <> 'open' then raise exception '마감 후에는 취소할 수 없어요. 꼭 필요하면 관리자에게 말해 주세요.'; end if;
  end if;
  delete from guest_entries where id = p_id;
  perform lunch_private.audit(u.id, 'guests.delete', to_jsonb(g));
end;
$$;

create or replace function lunch_private.day_view(d date, uid uuid) returns jsonb
language sql stable security definer set search_path = lunch as $$
  select jsonb_build_object(
    'date', d,
    'mealDay', lunch_private.is_meal_day(d),
    'note', (select note from day_overrides where date = d),
    'phase', lunch_private.phase_of(d),
    'deadline', lunch_private.deadline_of(d),
    'members', (select count(*) from signups where date = d),
    'guests', lunch_private.guest_count(d),
    'total', (select count(*) from signups where date = d) + lunch_private.guest_count(d),
    'mine', (select jsonb_build_object('guests', guests) from signups where date = d and user_id = uid),
    'myGuests', (select coalesce(sum(count), 0) from guest_entries where date = d and host_id = uid),
    'menu', (select jsonb_build_object('title', title, 'description', description) from menus where date = d)
  );
$$;

create or replace function lunch.get_day(p_date date) returns jsonb
language plpgsql stable security definer set search_path = lunch as $$
declare u profiles := lunch_private.require_user();
begin
  return lunch_private.day_view(p_date, u.id) || jsonb_build_object(
    'roster', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'guests', s.guests,
        'attended', a.user_id is not null) order by p.name)
      from signups s join profiles p on p.id = s.user_id
      left join attendance a on a.user_id = s.user_id and a.date = s.date
      where s.date = p_date), '[]'::jsonb),
    'guestEntries', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'count', g.count, 'note', g.note, 'hostId', g.host_id, 'host', p.name) order by g.id)
      from guest_entries g join profiles p on p.id = g.host_id where g.date = p_date), '[]'::jsonb),
    'attendanceClosed', lunch_private.attendance_closed(p_date),
    'canSelfCheck', lunch_private.phase_of(p_date) = 'today' and not lunch_private.attendance_closed(p_date)
  );
end;
$$;

-- 내 신청은 언제나 "나 1명". 손님은 add_guests로 따로.
create or replace function lunch.signup_upsert(p_date date, p_guests int default 0, p_guest_note text default null) returns jsonb
language plpgsql security definer set search_path = lunch as $$
declare u profiles := lunch_private.require_user();
begin
  if not u.is_member then raise exception '점심 신청 대상 계정이 아니에요.'; end if;
  if not lunch_private.is_meal_day(p_date) then raise exception '이날은 점심 운영을 하지 않아요.'; end if;
  if lunch_private.phase_of(p_date) <> 'open' then
    raise exception '신청 마감됐어요. (%까지)', lunch_private.fmt_day(lunch_private.deadline_of(p_date));
  end if;
  insert into signups (user_id, date) values (u.id, p_date) on conflict (user_id, date) do nothing;
  return lunch_private.day_view(p_date, u.id);
end;
$$;

-- ---------- 알림: 종류 + 값 ----------
alter table lunch.notifications add column if not exists kind text;
alter table lunch.notifications add column if not exists params jsonb;

create or replace function lunch_private.notify_k(uid uuid, k text, kd text, prm jsonb, t text, b text default null) returns boolean
language plpgsql security definer set search_path = lunch as $$
declare n int;
begin
  insert into notifications (user_id, dedupe_key, title, body, kind, params) values (uid, k, t, b, kd, prm)
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

create or replace function lunch.set_menu(p_date date, p_title text, p_description text default null) returns void
language plpgsql security definer set search_path = lunch as $$
declare a profiles := lunch_private.require_cook(); existed boolean; s record;
begin
  if coalesce(trim(p_title), '') = '' then raise exception '메뉴를 입력해 주세요.'; end if;
  existed := exists (select 1 from menus where date = p_date);
  insert into menus (date, title, description, updated_by)
  values (p_date, left(trim(p_title), 60), left(nullif(trim(p_description), ''), 300), a.id)
  on conflict (date) do update set title = excluded.title, description = excluded.description,
    updated_by = excluded.updated_by, updated_at = now();
  for s in select user_id from signups where date = p_date loop
    perform lunch_private.notify_k(s.user_id,
      'menu:' || p_date || ':' || s.user_id || ':' || case when existed then extract(epoch from clock_timestamp())::text else 'new' end,
      'menu', jsonb_build_object('date', p_date, 'title', left(trim(p_title), 60), 'changed', existed),
      lunch_private.fmt_day(p_date) || ' 메뉴: ' || left(trim(p_title), 60), nullif(trim(p_description), ''));
  end loop;
end;
$$;

create or replace function lunch_private.run_jobs() returns void
language plpgsql security definer set search_path = lunch as $$
declare
  today date := lunch_private.kst_today();
  thr int := lunch_private.setting_int('noshow_threshold');
  dlw int := lunch_private.setting_int('deadline_weekday');
  next_mon date; d date; u record; hc record; any_new boolean := false;
begin
  -- 1) 마감 전날 리마인드: 내일이 마감 요일이면, 그다음 주에 하루도 신청 안 한 직원에게
  if extract(isodow from today)::int = dlw - 1 and lunch_private.kst_hour() >= lunch_private.setting_int('reminder_hour') then
    next_mon := today + 1 + (8 - dlw);
    if exists (select 1 from generate_series(next_mon, next_mon + 6, interval '1 day') g where lunch_private.is_meal_day(g::date)) then
      for u in select p.id from profiles p where p.status = 'active' and p.is_member
               and not exists (select 1 from signups s where s.user_id = p.id and s.date between next_mon and next_mon + 6) loop
        perform lunch_private.notify_k(u.id, 'remind-week:' || next_mon || ':' || u.id, 'remind',
          jsonb_build_object('week', next_mon, 'hour', lunch_private.setting_int('deadline_hour')),
          '다음 주 점심 신청이 내일 마감돼요', null);
      end loop;
    end if;
  end if;

  -- 2) 인원 확정 → 요리사에게 메뉴 등록 요청
  for i in 1..14 loop
    d := today + i;
    continue when lunch_private.phase_of(d) <> 'confirmed' or not lunch_private.is_meal_day(d);
    select (select count(*) from signups where date = d) as m, lunch_private.guest_count(d) as g into hc;
    for u in select id from profiles where status = 'active' and is_cook loop
      perform lunch_private.notify_k(u.id, 'confirmed:' || d || ':' || u.id, 'confirmed',
        jsonb_build_object('date', d, 'members', hc.m, 'guests', hc.g, 'total', hc.m + hc.g,
          'budget', (hc.m + hc.g) * lunch_private.setting_int('meal_price')),
        lunch_private.fmt_day(d) || ' 인원 확정: ' || (hc.m + hc.g) || '명', null);
    end loop;
  end loop;

  -- 3) 노쇼 확정 알림
  for i in 0..7 loop
    d := today - i;
    continue when not lunch_private.attendance_closed(d);
    for u in select s.user_id from signups s join profiles p on p.id = s.user_id and p.status = 'active'
             left join attendance a on a.user_id = s.user_id and a.date = s.date
             where s.date = d and a.user_id is null loop
      any_new := lunch_private.notify_k(u.user_id, 'noshow:' || d || ':' || u.user_id, 'noshow',
        jsonb_build_object('date', d), lunch_private.fmt_day(d) || ' 점심 노쇼로 기록됐어요', null) or any_new;
    end loop;
  end loop;
  if any_new then
    for u in select n.* from lunch_private.noshow_rows() n where n.status = 'active' and n.no_shows_90d >= thr loop
      for hc in select id from profiles where status = 'active' and is_admin loop
        perform lunch_private.notify_k(hc.id, 'noshow-admin:' || u.id || ':' || u.no_shows_90d || ':' || hc.id, 'noshow-admin',
          jsonb_build_object('name', u.name, 'count', u.no_shows_90d, 'threshold', thr),
          u.name || '님 노쇼 ' || u.no_shows_90d || '회 (최근 90일)', null);
      end loop;
    end loop;
  end if;
end;
$$;

-- ---------- 예산 (끼니 수에 손님 포함) ----------
create or replace function lunch_private.budget_summary() returns jsonb
language sql stable security definer set search_path = lunch as $$
  with b as (
    select * from budgets where start_date <= lunch_private.kst_today() and end_date >= lunch_private.kst_today()
    order by start_date desc limit 1
  ), x as (
    select b.*,
      (select coalesce(sum(amount), 0) from expenses e where e.date between b.start_date and b.end_date) as spent,
      (select count(*) from signups s join attendance a on a.user_id = s.user_id and a.date = s.date
         where s.date between b.start_date and b.end_date)
      + (select coalesce(sum(count), 0) from guest_entries g where g.date between b.start_date and b.end_date and g.date <= lunch_private.kst_today()) as meals
    from b
  )
  select jsonb_build_object('id', id, 'startDate', start_date, 'endDate', end_date, 'note', note,
    'total', amount, 'spent', spent, 'remaining', amount - spent, 'meals', meals,
    'perMeal', case when meals > 0 then round(spent::numeric / meals) end)
  from x;
$$;

create or replace function lunch.get_summary() returns jsonb
language plpgsql stable security definer set search_path = lunch as $$
declare u profiles := lunch_private.require_user(); r record;
begin
  select * into r from lunch_private.noshow_rows() n where n.id = u.id;
  return jsonb_build_object(
    'budget', lunch_private.budget_summary(),
    'noShows', case when r.id is null then null else jsonb_build_object('total', r.no_shows, 'last90', r.no_shows_90d, 'signups', r.signups) end,
    'noShowThreshold', lunch_private.setting_int('noshow_threshold'),
    'deadlineWeekday', lunch_private.setting_int('deadline_weekday'),
    'deadlineHour', lunch_private.setting_int('deadline_hour'),
    'attendanceCloseHour', lunch_private.setting_int('attendance_close_hour'),
    'mealPrice', lunch_private.setting_int('meal_price'),
    'maxGuests', lunch_private.setting_int('max_guests'),
    'currency', (select value from settings where key = 'currency'),
    'unread', (select count(*) from notifications where user_id = u.id and read_at is null)
  );
end;
$$;

-- ---------- 요리사 시트 (모두 볼 수 있음) ----------
create or replace function lunch.cook_sheet(p_from date default null, p_days int default 21) returns jsonb
language plpgsql stable security definer set search_path = lunch as $$
declare
  u profiles := lunch_private.require_user();
  start_d date := coalesce(p_from, lunch_private.kst_today() - (extract(isodow from lunch_private.kst_today())::int - 1));
  price int := lunch_private.setting_int('meal_price');
begin
  return jsonb_build_object('mealPrice', price, 'days', coalesce((
    select jsonb_agg(lunch_private.day_view(d::date, u.id) || jsonb_build_object(
      'names', (select coalesce(jsonb_agg(p.name order by p.name), '[]'::jsonb) from signups s join profiles p on p.id = s.user_id where s.date = d::date),
      'guestList', (select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'count', g.count, 'note', g.note, 'host', p.name) order by g.id), '[]'::jsonb)
                    from guest_entries g join profiles p on p.id = g.host_id where g.date = d::date),
      'budget', ((select count(*) from signups where date = d::date) + lunch_private.guest_count(d::date)) * price
    ) order by d)
    from generate_series(start_d, start_d + least(greatest(p_days, 1), 62) - 1, interval '1 day') d
    where lunch_private.is_meal_day(d::date)), '[]'::jsonb));
end;
$$;

-- 요리사 화면용 예전 함수도 손님 포함으로 (day_view를 쓰므로 그대로 동작)

-- ---------- 월별 식사 횟수표 ----------
-- 칸: A=먹음(출석) · N=노쇼 · S=신청(아직 확정 전)
create or replace function lunch.monthly_summary(p_month text default null) returns jsonb
language plpgsql stable security definer set search_path = lunch as $$
declare
  u profiles := lunch_private.require_user();
  first date := coalesce(to_date(p_month || '-01', 'YYYY-MM-DD'), date_trunc('month', lunch_private.kst_today())::date);
  last date := (first + interval '1 month' - interval '1 day')::date;
begin
  return jsonb_build_object(
    'month', to_char(first, 'YYYY-MM'),
    'days', coalesce((select jsonb_agg(d::date order by d) from generate_series(first, last, interval '1 day') d
                      where lunch_private.is_meal_day(d::date)
                         or exists (select 1 from signups s where s.date = d::date)), '[]'::jsonb),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'cells', x.cells, 'meals', x.meals, 'noShows', x.noshows) order by p.name)
      from profiles p
      cross join lateral (
        select coalesce(jsonb_object_agg(s.date, case when a.user_id is not null then 'A'
                 when lunch_private.attendance_closed(s.date) then 'N' else 'S' end), '{}'::jsonb) as cells,
               count(a.user_id) as meals,
               count(*) filter (where a.user_id is null and lunch_private.attendance_closed(s.date)) as noshows,
               count(s.id) as n
        from signups s left join attendance a on a.user_id = s.user_id and a.date = s.date
        where s.user_id = p.id and s.date between first and last
      ) x
      where (p.status = 'active' and p.is_member) or x.n > 0), '[]'::jsonb),
    'guests', coalesce((select jsonb_object_agg(date, c) from (
        select date, sum(count) c from guest_entries where date between first and last group by date) g), '{}'::jsonb)
  );
end;
$$;

-- ---------- 관리자 설정 ----------
create or replace function lunch.admin_save_settings(p jsonb) returns jsonb
language plpgsql security definer set search_path = lunch, lunch_private as $$
declare a profiles := lunch_private.require_admin(); k text; lim int[]; v int;
begin
  foreach k in array array['noshow_threshold', 'attendance_close_hour', 'reminder_hour', 'max_guests',
                           'deadline_weekday', 'deadline_hour', 'meal_price'] loop
    if p ? k then
      lim := case k when 'noshow_threshold' then array[1, 50] when 'attendance_close_hour' then array[11, 23]
        when 'reminder_hour' then array[0, 23] when 'max_guests' then array[1, 100]
        when 'deadline_weekday' then array[1, 7] when 'deadline_hour' then array[0, 23]
        else array[0, 100000000] end;
      v := (p ->> k)::int;
      if v < lim[1] or v > lim[2] then raise exception '%은(는) %~% 사이여야 해요.', k, lim[1], lim[2]; end if;
      update settings set value = v::text where key = k;
    end if;
  end loop;
  perform lunch_private.audit(a.id, 'settings', p);
  return lunch.admin_get_settings();
end;
$$;

-- ---------- 공휴일: 한국 → 베트남 ----------
delete from lunch.day_overrides where closed and note in (
  '신정', '설날 연휴', '설날', '설날 대체공휴일', '삼일절', '삼일절 대체공휴일', '어린이날', '부처님오신날',
  '부처님오신날 대체공휴일', '지방선거일', '광복절 대체공휴일', '추석 연휴', '추석', '개천절 대체공휴일',
  '한글날', '한글날 대체공휴일', '성탄절', '성탄절 대체공휴일');
insert into lunch.day_overrides (date, closed, note) values
  ('2026-01-01', true, 'Tết Dương lịch'),
  ('2026-02-16', true, 'Tết Nguyên Đán'), ('2026-02-17', true, 'Tết Nguyên Đán'), ('2026-02-18', true, 'Tết Nguyên Đán'),
  ('2026-02-19', true, 'Tết Nguyên Đán'), ('2026-02-20', true, 'Tết Nguyên Đán'),
  ('2026-04-27', true, 'Giỗ Tổ Hùng Vương'),
  ('2026-04-30', true, 'Ngày Thống nhất'), ('2026-05-01', true, 'Quốc tế Lao động'),
  ('2026-09-01', true, 'Quốc khánh'), ('2026-09-02', true, 'Quốc khánh'),
  ('2027-01-01', true, 'Tết Dương lịch')
on conflict (date) do nothing;

revoke execute on all functions in schema lunch_private from public, anon, authenticated;
revoke execute on all functions in schema lunch from public, anon;
grant execute on all functions in schema lunch to authenticated;
grant execute on function lunch.login_lookup(text) to anon;
-- 푸시용 서비스 함수는 다시 서비스 키 전용으로
do $$ begin
  revoke execute on function lunch.svc_get_secret(text), lunch.svc_set_secret(text, text),
    lunch.svc_take_push_batch(), lunch.svc_delete_push_sub(text) from authenticated;
exception when undefined_function then null;
end $$;
