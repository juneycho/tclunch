-- TC 점심: 규칙(마감, 본인 신청, 출석/노쇼, 메뉴, 예산)과 화면용 RPC
-- 모든 날짜/시각은 한국 시간 기준.

-- 테스트에서 시각을 바꿀 수 있게 app.now 설정을 먼저 본다 (API로는 설정할 수 없음)
create or replace function private.now() returns timestamptz
language sql stable as $$
  select coalesce(nullif(current_setting('app.now', true), '')::timestamptz, now());
$$;

create or replace function private.kst_today() returns date
language sql stable as $$ select (private.now() at time zone 'Asia/Seoul')::date; $$;

create or replace function private.kst_hour() returns int
language sql stable as $$ select extract(hour from private.now() at time zone 'Asia/Seoul')::int; $$;

create or replace function private.setting_int(k text) returns int
language sql stable security definer set search_path = public as $$
  select value::int from settings where key = k;
$$;

create or replace function private.fmt_day(d date) returns text
language sql immutable as $$
  select extract(month from d)::int || '/' || extract(day from d)::int || '(' ||
    (array['일','월','화','수','목','금','토'])[extract(dow from d)::int + 1] || ')';
$$;

create or replace function private.is_meal_day(d date) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select not closed from day_overrides where date = d), extract(isodow from d) < 6);
$$;

-- 신청/취소 마감일: 식사일 deadline_days일 전 (그날 23:59까지 가능)
create or replace function private.deadline_of(d date) returns date
language sql stable as $$ select d - private.setting_int('deadline_days'); $$;

-- open: 신청 가능 · confirmed: 마감되어 인원 확정 · today: 오늘 · past: 지난 날
create or replace function private.phase_of(d date) returns text
language sql stable as $$
  select case
    when d < private.kst_today() then 'past'
    when d = private.kst_today() then 'today'
    when private.kst_today() <= private.deadline_of(d) then 'open'
    else 'confirmed' end;
$$;

-- 출석 체크가 마감되어 노쇼가 확정된 날인지
create or replace function private.attendance_closed(d date) returns boolean
language sql stable as $$
  select d < private.kst_today()
    or (d = private.kst_today() and private.kst_hour() >= private.setting_int('attendance_close_hour'));
$$;

create or replace function private.last_closed_day() returns date
language sql stable as $$
  select case when private.kst_hour() >= private.setting_int('attendance_close_hour')
    then private.kst_today() else private.kst_today() - 1 end;
$$;

create or replace function private.require_user() returns public.profiles
language plpgsql stable security definer set search_path = public as $$
declare p profiles;
begin
  select * into p from profiles where id = auth.uid();
  if p.id is null then raise exception '로그인이 필요해요.'; end if;
  if p.status = 'pending' then raise exception '아직 관리자 승인 전이에요.'; end if;
  if p.status <> 'active' then raise exception '비활성화된 계정이에요.'; end if;
  return p;
end;
$$;

create or replace function private.require_admin() returns public.profiles
language plpgsql stable security definer set search_path = public as $$
declare p profiles := private.require_user();
begin
  if not p.is_admin then raise exception '관리자만 할 수 있어요.'; end if;
  return p;
end;
$$;

create or replace function private.require_cook() returns public.profiles
language plpgsql stable security definer set search_path = public as $$
declare p profiles := private.require_user();
begin
  if not (p.is_cook or p.is_admin) then raise exception '요리사나 관리자만 할 수 있어요.'; end if;
  return p;
end;
$$;

create or replace function private.audit(actor uuid, act text, detail jsonb) returns void
language sql security definer set search_path = public as $$
  insert into audit_log (actor_id, action, detail) values (actor, act, detail);
$$;

create or replace function private.notify(uid uuid, k text, t text, b text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into notifications (user_id, dedupe_key, title, body) values (uid, k, t, b)
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

create or replace function private.day_view(d date, uid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'date', d,
    'mealDay', private.is_meal_day(d),
    'note', (select note from day_overrides where date = d),
    'phase', private.phase_of(d),
    'deadline', private.deadline_of(d),
    'members', (select count(*) from signups where date = d),
    'guests', (select coalesce(sum(guests), 0) from signups where date = d),
    'total', (select count(*) + coalesce(sum(guests), 0) from signups where date = d),
    'mine', (select jsonb_build_object('guests', guests, 'guestNote', guest_note) from signups where date = d and user_id = uid),
    'menu', (select jsonb_build_object('title', title, 'description', description) from menus where date = d)
  );
$$;

-- ---------- 화면용 조회 ----------
create or replace function public.get_me() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', id, 'loginId', login_id, 'name', name, 'isAdmin', is_admin, 'isCook', is_cook,
    'isMember', is_member, 'status', status, 'mustChangePw', must_change_pw)
  from profiles where id = auth.uid();
$$;

create or replace function public.get_calendar(p_month text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  u profiles := private.require_user();
  first date := coalesce(to_date(p_month || '-01', 'YYYY-MM-DD'), date_trunc('month', private.kst_today())::date);
begin
  return jsonb_build_object(
    'month', to_char(first, 'YYYY-MM'),
    'today', private.kst_today(),
    'days', (select jsonb_agg(private.day_view(d::date, u.id) order by d)
             from generate_series(first, (first + interval '1 month' - interval '1 day')::date, interval '1 day') d)
  );
end;
$$;

create or replace function public.get_day(p_date date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u profiles := private.require_user();
begin
  return private.day_view(p_date, u.id) || jsonb_build_object(
    'roster', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'guests', s.guests, 'guestNote', s.guest_note,
        'attended', a.user_id is not null) order by p.name)
      from signups s join profiles p on p.id = s.user_id
      left join attendance a on a.user_id = s.user_id and a.date = s.date
      where s.date = p_date), '[]'::jsonb),
    'attendanceClosed', private.attendance_closed(p_date),
    'canSelfCheck', private.phase_of(p_date) = 'today' and not private.attendance_closed(p_date)
  );
end;
$$;

create or replace function private.noshow_rows() returns table (
  id uuid, name text, login_id text, status text, no_shows bigint, no_shows_90d bigint, signups bigint)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.login_id, p.status,
    count(*) filter (where s.id is not null and a.user_id is null),
    count(*) filter (where s.id is not null and a.user_id is null and s.date >= private.kst_today() - 90),
    count(s.id)
  from profiles p
  left join signups s on s.user_id = p.id and s.date <= private.last_closed_day()
  left join attendance a on a.user_id = s.user_id and a.date = s.date
  where p.is_member
  group by p.id
  order by 5 desc, p.name;
$$;

create or replace function private.budget_summary() returns jsonb
language sql stable security definer set search_path = public as $$
  with b as (
    select * from budgets where start_date <= private.kst_today() and end_date >= private.kst_today()
    order by start_date desc limit 1
  ), x as (
    select b.*,
      (select coalesce(sum(amount), 0) from expenses e where e.date between b.start_date and b.end_date) as spent,
      (select count(*) + coalesce(sum(s.guests), 0) from signups s
         join attendance a on a.user_id = s.user_id and a.date = s.date
         where s.date between b.start_date and b.end_date) as meals
    from b
  )
  select jsonb_build_object('id', id, 'startDate', start_date, 'endDate', end_date, 'note', note,
    'total', amount, 'spent', spent, 'remaining', amount - spent, 'meals', meals,
    'perMeal', case when meals > 0 then round(spent::numeric / meals) end)
  from x;
$$;

create or replace function public.get_summary() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u profiles := private.require_user(); r record;
begin
  select * into r from private.noshow_rows() n where n.id = u.id;
  return jsonb_build_object(
    'budget', private.budget_summary(),
    'noShows', case when r.id is null then null else jsonb_build_object('total', r.no_shows, 'last90', r.no_shows_90d, 'signups', r.signups) end,
    'noShowThreshold', private.setting_int('noshow_threshold'),
    'deadlineDays', private.setting_int('deadline_days'),
    'attendanceCloseHour', private.setting_int('attendance_close_hour'),
    'unread', (select count(*) from notifications where user_id = u.id and read_at is null)
  );
end;
$$;

create or replace function public.get_my_history() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u profiles := private.require_user();
begin
  return coalesce((select jsonb_agg(x order by x.date desc) from (
    select s.date, s.guests, a.user_id is not null as attended,
      private.phase_of(s.date) as phase, private.attendance_closed(s.date) as closed
    from signups s left join attendance a on a.user_id = s.user_id and a.date = s.date
    where s.user_id = u.id order by s.date desc limit 100) x), '[]'::jsonb);
end;
$$;

create or replace function public.mark_notifications_read() returns void
language sql security definer set search_path = public as $$
  update notifications set read_at = now() where user_id = auth.uid() and read_at is null;
$$;

-- ---------- 신청 (본인만, 마감 전까지) ----------
create or replace function public.signup_upsert(p_date date, p_guests int default 0, p_guest_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u profiles := private.require_user();
begin
  if not u.is_member then raise exception '점심 신청 대상 계정이 아니에요.'; end if;
  if not private.is_meal_day(p_date) then raise exception '이날은 점심 운영을 하지 않아요.'; end if;
  if private.phase_of(p_date) <> 'open' then
    raise exception '신청 마감됐어요. (%까지)', private.fmt_day(private.deadline_of(p_date));
  end if;
  if p_guests is null or p_guests < 0 or p_guests > private.setting_int('max_guests') then
    raise exception '손님 수는 0~%명이에요.', private.setting_int('max_guests');
  end if;
  insert into signups (user_id, date, guests, guest_note)
  values (u.id, p_date, p_guests, case when p_guests > 0 then left(nullif(trim(p_guest_note), ''), 50) end)
  on conflict (user_id, date) do update set guests = excluded.guests, guest_note = excluded.guest_note, updated_at = now();
  return private.day_view(p_date, u.id);
end;
$$;

create or replace function public.signup_cancel(p_date date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u profiles := private.require_user();
begin
  if private.phase_of(p_date) <> 'open' then
    raise exception '마감 후에는 취소할 수 없어요. 꼭 필요하면 관리자에게 말해 주세요.';
  end if;
  delete from signups where user_id = u.id and date = p_date;
  return private.day_view(p_date, u.id);
end;
$$;

-- ---------- 출석 ----------
create or replace function public.self_check(p_date date) returns void
language plpgsql security definer set search_path = public as $$
declare u profiles := private.require_user();
begin
  if private.phase_of(p_date) <> 'today' or private.attendance_closed(p_date) then
    raise exception '출석 체크는 식사 당일 %시 전까지만 할 수 있어요.', private.setting_int('attendance_close_hour');
  end if;
  if not exists (select 1 from signups where user_id = u.id and date = p_date) then
    raise exception '신청하지 않은 날이에요.';
  end if;
  insert into attendance (user_id, date, checked_by) values (u.id, p_date, u.id) on conflict do nothing;
end;
$$;

-- 요리사는 오늘·어제, 관리자는 지난 날도 정정 가능
create or replace function public.set_attendance(p_date date, p_user uuid, p_attended boolean) returns void
language plpgsql security definer set search_path = public as $$
declare a profiles := private.require_cook(); ph text := private.phase_of(p_date);
begin
  if ph in ('open', 'confirmed') then raise exception '아직 식사일이 아니에요.'; end if;
  if not a.is_admin and p_date < private.kst_today() - 1 then
    raise exception '요리사는 오늘과 어제 출석만 체크할 수 있어요. 그 이전은 관리자에게 부탁해 주세요.';
  end if;
  if not exists (select 1 from signups where user_id = p_user and date = p_date) then raise exception '신청자가 아니에요.'; end if;
  if p_attended then
    insert into attendance (user_id, date, checked_by) values (p_user, p_date, a.id) on conflict do nothing;
    delete from notifications where dedupe_key = 'noshow:' || p_date || ':' || p_user;  -- 노쇼 정정
  else
    delete from attendance where user_id = p_user and date = p_date;
  end if;
  perform private.audit(a.id, 'attendance', jsonb_build_object('date', p_date, 'userId', p_user, 'attended', p_attended));
end;
$$;

-- ---------- 메뉴 (요리사) ----------
create or replace function public.set_menu(p_date date, p_title text, p_description text default null) returns void
language plpgsql security definer set search_path = public as $$
declare a profiles := private.require_cook(); existed boolean; s record;
begin
  if coalesce(trim(p_title), '') = '' then raise exception '메뉴를 입력해 주세요.'; end if;
  existed := exists (select 1 from menus where date = p_date);
  insert into menus (date, title, description, updated_by)
  values (p_date, left(trim(p_title), 60), left(nullif(trim(p_description), ''), 300), a.id)
  on conflict (date) do update set title = excluded.title, description = excluded.description,
    updated_by = excluded.updated_by, updated_at = now();
  for s in select user_id from signups where date = p_date loop
    perform private.notify(s.user_id,
      'menu:' || p_date || ':' || s.user_id || ':' || case when existed then extract(epoch from clock_timestamp())::text else 'new' end,
      private.fmt_day(p_date) || ' 메뉴' || case when existed then ' 변경' else '' end || ': ' || left(trim(p_title), 60),
      nullif(trim(p_description), ''));
  end loop;
end;
$$;

create or replace function public.delete_menu(p_date date) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform private.require_cook();
  delete from menus where date = p_date;
end;
$$;

create or replace function public.cook_upcoming() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u profiles := private.require_cook();
begin
  return jsonb_build_object('days', coalesce((
    select jsonb_agg(private.day_view(d::date, u.id) order by d)
    from generate_series(private.kst_today(), private.kst_today() + 14, interval '1 day') d
    where private.is_meal_day(d::date)), '[]'::jsonb));
end;
$$;

-- ---------- 지출 ----------
create or replace function public.add_expense(p_date date, p_amount bigint, p_memo text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare a profiles := private.require_cook(); new_id bigint;
begin
  if p_amount is null or p_amount <= 0 or p_amount > 100000000 then raise exception '금액을 확인해 주세요.'; end if;
  insert into expenses (date, amount, memo, created_by) values (p_date, p_amount, left(nullif(trim(p_memo), ''), 100), a.id)
  returning id into new_id;
  perform private.audit(a.id, 'expense.add', jsonb_build_object('id', new_id, 'date', p_date, 'amount', p_amount, 'memo', p_memo));
  return new_id;
end;
$$;

create or replace function public.delete_expense(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare a profiles := private.require_cook(); e expenses;
begin
  select * into e from expenses where id = p_id;
  if e.id is null then raise exception '없는 지출이에요.'; end if;
  if not a.is_admin and e.created_by is distinct from a.id then raise exception '본인이 입력한 지출만 지울 수 있어요.'; end if;
  delete from expenses where id = p_id;
  perform private.audit(a.id, 'expense.delete', to_jsonb(e));
end;
$$;

-- ---------- 푸시 구독 ----------
create or replace function public.save_push_sub(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public as $$
declare u profiles := private.require_user();
begin
  if p_endpoint is null or p_endpoint !~ '^https://' then raise exception '잘못된 구독 정보예요.'; end if;
  insert into push_subs (endpoint, user_id, p256dh, auth) values (p_endpoint, u.id, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;

-- 본인 비밀번호를 바꾼 뒤 "임시 비밀번호" 표시를 끈다
create or replace function public.clear_must_change_pw() returns void
language sql security definer set search_path = public as $$
  update profiles set must_change_pw = false where id = auth.uid();
$$;

-- ---------- 관리자 ----------
create or replace function public.admin_users() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform private.require_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'loginId', login_id, 'name', name, 'isAdmin', is_admin,
    'isCook', is_cook, 'isMember', is_member, 'status', status) order by status, name) from profiles), '[]'::jsonb);
end;
$$;

create or replace function public.admin_update_user(p_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare a profiles := private.require_admin(); u profiles; n profiles; d date;
begin
  select * into u from profiles where id = p_id;
  if u.id is null then raise exception '없는 사용자예요.'; end if;
  n := u;
  if p ? 'name' then n.name := left(trim(p ->> 'name'), 30); end if;
  if p ? 'status' then n.status := p ->> 'status'; end if;
  if p ? 'isAdmin' then n.is_admin := (p ->> 'isAdmin')::boolean; end if;
  if p ? 'isCook' then n.is_cook := (p ->> 'isCook')::boolean; end if;
  if p ? 'isMember' then n.is_member := (p ->> 'isMember')::boolean; end if;
  if n.status not in ('pending', 'active', 'inactive') then raise exception '상태 값이 잘못됐어요.'; end if;
  if u.id = a.id and (not n.is_admin or n.status <> 'active') then
    raise exception '본인의 관리자 권한은 스스로 해제할 수 없어요.';
  end if;
  update profiles set name = n.name, status = n.status, is_admin = n.is_admin, is_cook = n.is_cook, is_member = n.is_member
  where id = u.id;
  -- 전출 등으로 비활성화하면 아직 마감 전인 신청은 지운다 (마감 후 신청은 요리사 준비에 반영됐으므로 둔다)
  if n.status <> 'active' then
    for d in select date from signups where user_id = u.id and date > private.kst_today() loop
      if private.phase_of(d) = 'open' then delete from signups where user_id = u.id and date = d; end if;
    end loop;
  end if;
  if u.status = 'pending' and n.status = 'active' then
    perform private.notify(u.id, 'approved:' || u.id, '가입이 승인됐어요', '이제 점심 신청을 할 수 있어요.');
  end if;
  perform private.audit(a.id, 'user.update', jsonb_build_object('id', u.id) || p);
end;
$$;

-- 마감 후 예외 처리 (기록이 남는다)
create or replace function public.admin_signup_override(p_date date, p_user uuid, p_guests int default 0, p_remove boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare a profiles := private.require_admin();
begin
  if p_remove then
    delete from signups where user_id = p_user and date = p_date;
    delete from attendance where user_id = p_user and date = p_date;
  else
    if p_guests < 0 or p_guests > private.setting_int('max_guests') then raise exception '손님 수를 확인해 주세요.'; end if;
    insert into signups (user_id, date, guests) values (p_user, p_date, p_guests)
    on conflict (user_id, date) do update set guests = excluded.guests, updated_at = now();
  end if;
  perform private.audit(a.id, 'signup.override', jsonb_build_object('date', p_date, 'userId', p_user, 'guests', p_guests, 'remove', p_remove));
end;
$$;

create or replace function public.admin_set_day(p_date date, p_closed boolean, p_note text default null, p_reset boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare a profiles := private.require_admin();
begin
  if p_reset then delete from day_overrides where date = p_date;
  else
    insert into day_overrides (date, closed, note) values (p_date, p_closed, left(nullif(trim(p_note), ''), 30))
    on conflict (date) do update set closed = excluded.closed, note = excluded.note;
  end if;
  perform private.audit(a.id, 'day.override', jsonb_build_object('date', p_date, 'closed', p_closed, 'note', p_note, 'reset', p_reset));
end;
$$;

create or replace function public.admin_get_settings() returns jsonb
language plpgsql stable security definer set search_path = public, private as $$
begin
  perform private.require_admin();
  return (select jsonb_object_agg(key, value) from settings)
    || jsonb_build_object('invite_code', (select value from private.secrets where key = 'invite_code'));
end;
$$;

create or replace function public.admin_save_settings(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, private as $$
declare a profiles := private.require_admin(); k text; lim int[]; v int;
begin
  foreach k in array array['deadline_days', 'noshow_threshold', 'attendance_close_hour', 'reminder_hour', 'max_guests'] loop
    if p ? k then
      lim := case k when 'deadline_days' then array[1, 30] when 'noshow_threshold' then array[1, 50]
        when 'attendance_close_hour' then array[11, 23] when 'reminder_hour' then array[0, 23] else array[0, 100] end;
      v := (p ->> k)::int;
      if v < lim[1] or v > lim[2] then raise exception '%은(는) %~% 사이여야 해요.', k, lim[1], lim[2]; end if;
      update settings set value = v::text where key = k;
    end if;
  end loop;
  if p ? 'invite_code' then
    if length(coalesce(p ->> 'invite_code', '')) between 1 and 5 then raise exception '초대 코드는 6자 이상으로 해 주세요.'; end if;
    update private.secrets set value = coalesce(trim(p ->> 'invite_code'), '') where key = 'invite_code';
  end if;
  perform private.audit(a.id, 'settings', p - 'invite_code');
  return public.admin_get_settings();
end;
$$;

create or replace function public.admin_noshows() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform private.require_admin();
  return coalesce((select jsonb_agg(to_jsonb(n)) from private.noshow_rows() n), '[]'::jsonb);
end;
$$;

create or replace function public.admin_save_budget(p_start date, p_end date, p_amount bigint, p_note text default null, p_id bigint default null) returns void
language plpgsql security definer set search_path = public as $$
declare a profiles := private.require_admin();
begin
  if p_start is null or p_end is null or p_start > p_end then raise exception '기간을 확인해 주세요.'; end if;
  if p_amount is null or p_amount < 0 then raise exception '예산을 확인해 주세요.'; end if;
  if exists (select 1 from budgets where start_date <= p_end and end_date >= p_start and id is distinct from p_id) then
    raise exception '기간이 겹치는 예산이 이미 있어요.';
  end if;
  if p_id is null then
    insert into budgets (start_date, end_date, amount, note) values (p_start, p_end, p_amount, nullif(trim(p_note), ''));
  else
    update budgets set start_date = p_start, end_date = p_end, amount = p_amount, note = nullif(trim(p_note), '') where id = p_id;
  end if;
  perform private.audit(a.id, 'budget.save', jsonb_build_object('id', p_id, 'start', p_start, 'end', p_end, 'amount', p_amount));
end;
$$;

create or replace function public.admin_delete_budget(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare a profiles := private.require_admin();
begin
  delete from budgets where id = p_id;
  perform private.audit(a.id, 'budget.delete', jsonb_build_object('id', p_id));
end;
$$;

-- ---------- 주기 작업 (pg_cron이 5분마다 실행, 여러 번 돌아도 알림은 한 번) ----------
create or replace function private.run_jobs() returns void
language plpgsql security definer set search_path = public as $$
declare
  today date := private.kst_today();
  dl int := private.setting_int('deadline_days');
  thr int := private.setting_int('noshow_threshold');
  d date; u record; hc record; any_new boolean := false;
begin
  -- 1) 마감 하루 전 리마인드: 내일이 마감인 식사일에 아직 신청 안 한 직원
  if private.kst_hour() >= private.setting_int('reminder_hour') then
    d := today + dl + 1;
    if private.is_meal_day(d) then
      for u in select p.id from profiles p where p.status = 'active' and p.is_member
               and not exists (select 1 from signups s where s.user_id = p.id and s.date = d) loop
        perform private.notify(u.id, 'remind:' || d || ':' || u.id,
          private.fmt_day(d) || ' 점심 신청이 내일 마감돼요', '드실 거면 오늘~내일 중으로 신청해 주세요.');
      end loop;
    end if;
  end if;

  -- 2) 인원 확정 → 요리사에게 메뉴 등록 요청
  for i in 1..dl loop
    d := today + i;
    continue when private.phase_of(d) <> 'confirmed' or not private.is_meal_day(d);
    select count(*) as m, coalesce(sum(guests), 0) as g into hc from signups where date = d;
    for u in select id from profiles where status = 'active' and is_cook loop
      perform private.notify(u.id, 'confirmed:' || d || ':' || u.id,
        private.fmt_day(d) || ' 인원 확정: ' || (hc.m + hc.g) || '명',
        '직원 ' || hc.m || '명 + 손님 ' || hc.g || '명. 메뉴를 등록해 주세요.');
    end loop;
  end loop;

  -- 3) 노쇼 확정 알림 (최근 7일 내 출석 마감된 날)
  for i in 0..7 loop
    d := today - i;
    continue when not private.attendance_closed(d);
    for u in select s.user_id from signups s join profiles p on p.id = s.user_id and p.status = 'active'
             left join attendance a on a.user_id = s.user_id and a.date = s.date
             where s.date = d and a.user_id is null loop
      any_new := private.notify(u.user_id, 'noshow:' || d || ':' || u.user_id,
        private.fmt_day(d) || ' 점심 노쇼로 기록됐어요',
        '신청하고 드시지 않았어요. 착오라면 요리사나 관리자에게 말해 주세요.') or any_new;
    end loop;
  end loop;
  if any_new then
    for u in select n.* from private.noshow_rows() n where n.status = 'active' and n.no_shows_90d >= thr loop
      for hc in select id from profiles where status = 'active' and is_admin loop
        perform private.notify(hc.id, 'noshow-admin:' || u.id || ':' || u.no_shows_90d || ':' || hc.id,
          u.name || '님 노쇼 ' || u.no_shows_90d || '회 (최근 90일)', '기준 ' || thr || '회 이상이에요.');
      end loop;
    end loop;
  end if;
end;
$$;

-- 가입 신청이 들어오면 관리자에게 알림
create or replace function private.on_profile_created() returns trigger
language plpgsql security definer set search_path = public as $$
declare a record;
begin
  if new.status = 'pending' then
    for a in select id from profiles where status = 'active' and is_admin loop
      perform private.notify(a.id, 'pending:' || new.id || ':' || a.id,
        new.name || '님이 가입 승인을 기다려요', '관리자 > 직원에서 승인해 주세요.');
    end loop;
  end if;
  return new;
end;
$$;
create trigger on_profile_created after insert on public.profiles
  for each row execute function private.on_profile_created();

-- ---------- 실행 권한 ----------
revoke all on all functions in schema private from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
grant usage on schema public to anon, authenticated;
