-- TC 점심 설치 SQL (자동 생성: npm run setup-sql, 직접 고치지 말고 migrations를 고치세요)
-- Supabase SQL Editor에 전체를 붙여넣고 Run 하세요. 한 번만 실행합니다.
-- 기존 프로젝트(예: TC Tennis)에 같이 설치해도 됩니다: 모든 것이 lunch / lunch_private 스키마 안에 만들어지고
-- public 스키마의 테이블과 권한은 건드리지 않습니다.
-- 실행 후 Data API 설정의 Exposed schemas 에 lunch 를 추가해야 앱이 접속됩니다.
-- 실행 전에 맨 아래 초대 코드를 원하는 값으로 바꾸세요.

-- ===== 20261025000001_schema.sql =====
-- TC 점심: 테이블, 권한(RLS), 공휴일
-- 다른 앱(테니스 등)과 같은 Supabase 프로젝트에 같이 설치할 수 있도록 전부 lunch / lunch_private 스키마 안에 만든다.
-- public 스키마나 다른 앱의 테이블·권한은 건드리지 않는다.
-- 쓰기는 전부 아래 RPC 함수(security definer)로만 한다. 테이블에는 읽기 정책만 있다.

create schema if not exists lunch;
create schema if not exists lunch_private;
revoke all on schema lunch_private from public, anon, authenticated;
grant usage on schema lunch to anon, authenticated, service_role;

-- 외부에 노출되면 안 되는 값: 초대 코드, 관리자 토큰, 푸시 키, 크론 비밀값, 프로젝트 URL
create table lunch_private.secrets (
  key text primary key,
  value text not null
);
-- 밖에서는 아예 접근할 수 없는 스키마지만, 대시보드 경고가 뜨지 않도록 RLS도 켜 둔다 (정책 없음 = 소유자 함수만 접근)
alter table lunch_private.secrets enable row level security;
insert into lunch_private.secrets (key, value) values
  ('invite_code', ''),
  ('admin_token', encode(extensions.gen_random_bytes(24), 'hex')),
  ('cron_secret', encode(extensions.gen_random_bytes(24), 'hex'));

create table lunch.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  login_id text not null unique check (login_id ~ '^[a-z0-9._-]{3,30}$'),
  name text not null check (char_length(name) between 1 and 30),
  is_admin boolean not null default false,
  is_cook boolean not null default false,
  is_member boolean not null default true,       -- 점심을 신청하는 직원인지
  status text not null default 'pending' check (status in ('pending', 'active', 'inactive')),
  must_change_pw boolean not null default false,
  created_at timestamptz not null default now()
);

create table lunch.settings (
  key text primary key,
  value text not null
);
insert into lunch.settings (key, value) values
  ('deadline_days', '7'),           -- 식사일 며칠 전까지 신청/취소 가능한지 (그날 23:59 KST까지)
  ('noshow_threshold', '3'),        -- 최근 90일 노쇼 몇 회부터 관리자에게 알릴지
  ('attendance_close_hour', '15'),  -- 식사 당일 몇 시에 출석 체크를 마감하고 노쇼를 확정할지
  ('reminder_hour', '9'),           -- 마감 전날 리마인드 시각
  ('max_guests', '20');

create table lunch.day_overrides (
  date date primary key,
  closed boolean not null,          -- true: 휴무, false: (주말이라도) 운영
  note text
);

create table lunch.menus (
  date date primary key,
  title text not null,
  description text,
  updated_by uuid references lunch.profiles (id),
  updated_at timestamptz not null default now()
);

create table lunch.signups (
  id bigint generated always as identity primary key,
  user_id uuid not null references lunch.profiles (id) on delete cascade,
  date date not null,
  guests int not null default 0 check (guests >= 0),
  guest_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);
create index signups_date on lunch.signups (date);

create table lunch.attendance (
  user_id uuid not null references lunch.profiles (id) on delete cascade,
  date date not null,
  checked_by uuid references lunch.profiles (id),
  checked_at timestamptz not null default now(),
  primary key (user_id, date)
);

create table lunch.budgets (
  id bigint generated always as identity primary key,
  start_date date not null,
  end_date date not null,
  amount bigint not null check (amount >= 0),
  note text,
  check (start_date <= end_date)
);

create table lunch.expenses (
  id bigint generated always as identity primary key,
  date date not null,
  amount bigint not null check (amount > 0),
  memo text,
  created_by uuid references lunch.profiles (id),
  created_at timestamptz not null default now()
);

create table lunch.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references lunch.profiles (id) on delete cascade,
  dedupe_key text unique,
  title text not null,
  body text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  pushed_at timestamptz
);
create index notifications_user on lunch.notifications (user_id, id desc);
create index notifications_unpushed on lunch.notifications (id) where pushed_at is null;

create table lunch.push_subs (
  endpoint text primary key,
  user_id uuid not null references lunch.profiles (id) on delete cascade,
  p256dh text not null,
  auth text not null
);

create table lunch.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references lunch.profiles (id),
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

-- 대한민국 공휴일(대체공휴일 포함). 관리자 화면에서 고칠 수 있다.
insert into lunch.day_overrides (date, closed, note) values
  ('2026-01-01', true, '신정'),
  ('2026-02-16', true, '설날 연휴'), ('2026-02-17', true, '설날'), ('2026-02-18', true, '설날 연휴'),
  ('2026-03-02', true, '삼일절 대체공휴일'),
  ('2026-05-05', true, '어린이날'),
  ('2026-05-25', true, '부처님오신날 대체공휴일'),
  ('2026-06-03', true, '지방선거일'),
  ('2026-08-17', true, '광복절 대체공휴일'),
  ('2026-09-24', true, '추석 연휴'), ('2026-09-25', true, '추석'), ('2026-09-26', true, '추석 연휴'),
  ('2026-10-05', true, '개천절 대체공휴일'),
  ('2026-10-09', true, '한글날'),
  ('2026-12-25', true, '성탄절'),
  ('2027-01-01', true, '신정'),
  ('2027-02-08', true, '설날 연휴'), ('2027-02-09', true, '설날 대체공휴일'),
  ('2027-03-01', true, '삼일절'),
  ('2027-05-05', true, '어린이날'),
  ('2027-05-13', true, '부처님오신날'),
  ('2027-08-16', true, '광복절 대체공휴일'),
  ('2027-09-14', true, '추석 연휴'), ('2027-09-15', true, '추석'), ('2027-09-16', true, '추석 연휴'),
  ('2027-10-04', true, '개천절 대체공휴일'),
  ('2027-10-11', true, '한글날 대체공휴일'),
  ('2027-12-27', true, '성탄절 대체공휴일');

-- ---------- 권한 ----------
create or replace function lunch.is_active_user() returns boolean
language sql stable security definer set search_path = lunch as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'active');
$$;

create or replace function lunch.is_admin_user() returns boolean
language sql stable security definer set search_path = lunch as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'active' and is_admin);
$$;

alter table lunch.profiles enable row level security;
alter table lunch.settings enable row level security;
alter table lunch.day_overrides enable row level security;
alter table lunch.menus enable row level security;
alter table lunch.signups enable row level security;
alter table lunch.attendance enable row level security;
alter table lunch.budgets enable row level security;
alter table lunch.expenses enable row level security;
alter table lunch.notifications enable row level security;
alter table lunch.push_subs enable row level security;
alter table lunch.audit_log enable row level security;

-- 본인 프로필은 승인 전에도 볼 수 있어야 "승인 대기" 화면을 띄울 수 있다
create policy "read profiles" on lunch.profiles for select to authenticated
  using (id = auth.uid() or lunch.is_active_user());
create policy "read settings" on lunch.settings for select to authenticated using (lunch.is_active_user());
create policy "read days" on lunch.day_overrides for select to authenticated using (lunch.is_active_user());
create policy "read menus" on lunch.menus for select to authenticated using (lunch.is_active_user());
create policy "read signups" on lunch.signups for select to authenticated using (lunch.is_active_user());
create policy "read attendance" on lunch.attendance for select to authenticated using (lunch.is_active_user());
create policy "read budgets" on lunch.budgets for select to authenticated using (lunch.is_active_user());
create policy "read expenses" on lunch.expenses for select to authenticated using (lunch.is_active_user());
create policy "read own notifications" on lunch.notifications for select to authenticated using (user_id = auth.uid());
create policy "read own push subs" on lunch.push_subs for select to authenticated using (user_id = auth.uid());
create policy "admin reads audit" on lunch.audit_log for select to authenticated using (lunch.is_admin_user());

revoke insert, update, delete, truncate on all tables in schema lunch from anon, authenticated;
revoke all on all tables in schema lunch from anon;
grant usage on schema lunch to authenticated;
grant select on all tables in schema lunch to authenticated;

-- ---------- 가입: auth.users에 사용자가 생기면 profiles를 만든다 ----------
-- 직원이 직접 가입할 때는 초대 코드가 맞아야 하고(승인 대기 상태),
-- 관리자 기능(Edge Function)으로 만들 때는 서버만 아는 admin_token이 있어야 한다(바로 사용 가능).
-- 초대 코드로 맨 처음 가입한 사람은 관리자가 된다. 초대 코드는 배포할 때 GitHub 비밀값으로 넣는다.
-- BEFORE 트리거에서 검사하고 비밀값을 메타데이터에서 지운 뒤, AFTER 트리거에서 프로필을 만든다.
-- 설치 SQL의 예시 값을 그대로 두면 가입이 막히도록 빈 값으로 본다
create or replace function lunch_private.invite_code() returns text
language sql stable security definer set search_path = lunch_private as $$
  select case when value = '여기에-초대코드' then '' else value end from lunch_private.secrets where key = 'invite_code';
$$;

create or replace function lunch_private.check_new_user() returns trigger
language plpgsql security definer set search_path = lunch, lunch_private as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  code text := lunch_private.invite_code();
  by_admin boolean := coalesce(meta ->> 'admin_token', '') = (select value from lunch_private.secrets where key = 'admin_token');
  login text := lower(meta ->> 'login_id');
begin
  -- 같은 프로젝트의 다른 앱 가입은 그대로 통과시킨다
  if coalesce(meta ->> 'app', '') <> 'tc-lunch' then return new; end if;
  if not by_admin and (code = '' or coalesce(meta ->> 'invite_code', '') <> code) then
    raise exception '초대 코드가 맞지 않아요. 관리자에게 물어봐 주세요.';
  end if;
  if login is null or login !~ '^[a-z0-9._-]{3,30}$' then
    raise exception '아이디는 영문/숫자 3~30자로 만들어 주세요.';
  end if;
  if coalesce(trim(meta ->> 'name'), '') = '' then
    raise exception '이름을 입력해 주세요.';
  end if;
  -- tcl_by_admin은 항상 여기서 덮어쓰므로 가입자가 임의로 넣을 수 없다
  new.raw_user_meta_data := (meta - 'admin_token' - 'invite_code') || jsonb_build_object('tcl_by_admin', by_admin);
  return new;
end;
$$;

create or replace function lunch_private.handle_new_user() returns trigger
language plpgsql security definer set search_path = lunch, lunch_private as $$
declare
  meta jsonb := new.raw_user_meta_data;
  by_admin boolean := coalesce((meta ->> 'tcl_by_admin')::boolean, false);
  first_user boolean := not exists (select 1 from profiles);
begin
  if coalesce(meta ->> 'app', '') <> 'tc-lunch' then return new; end if;
  insert into profiles (id, login_id, name, status, is_admin, is_cook, is_member, must_change_pw)
  values (
    new.id, lower(meta ->> 'login_id'), left(trim(meta ->> 'name'), 30),
    case when by_admin or first_user then 'active' else 'pending' end,
    first_user,
    by_admin and coalesce((meta ->> 'is_cook')::boolean, false),
    case when by_admin then coalesce((meta ->> 'is_member')::boolean, true) else true end,
    by_admin
  );
  return new;
end;
$$;

create trigger tc_lunch_user_check before insert on auth.users
  for each row execute function lunch_private.check_new_user();
create trigger tc_lunch_user_created after insert on auth.users
  for each row execute function lunch_private.handle_new_user();

-- 가입 화면에서 미리 확인 (Supabase Auth는 트리거 오류 메시지를 그대로 보여주지 않아서)
create or replace function lunch.precheck_signup(p_invite_code text, p_login_id text) returns text
language plpgsql stable security definer set search_path = lunch, lunch_private as $$
declare code text := lunch_private.invite_code();
begin
  if code = '' or coalesce(p_invite_code, '') <> code then return '초대 코드가 맞지 않아요. 관리자에게 물어봐 주세요.'; end if;
  if lower(coalesce(p_login_id, '')) !~ '^[a-z0-9._-]{3,30}$' then return '아이디는 영문 소문자/숫자 3~30자로 만들어 주세요.'; end if;
  if exists (select 1 from profiles where login_id = lower(p_login_id)) then return '이미 있는 아이디예요.'; end if;
  return null;
end;
$$;

-- ===== 20261025000002_logic.sql =====
-- TC 점심: 규칙(마감, 본인 신청, 출석/노쇼, 메뉴, 예산)과 화면용 RPC
-- 모든 날짜/시각은 한국 시간 기준.

-- 테스트에서 시각을 바꿀 수 있게 app.now 설정을 먼저 본다 (API로는 설정할 수 없음)
create or replace function lunch_private.now() returns timestamptz
language sql stable as $$
  select coalesce(nullif(current_setting('app.now', true), '')::timestamptz, now());
$$;

create or replace function lunch_private.kst_today() returns date
language sql stable as $$ select (lunch_private.now() at time zone 'Asia/Seoul')::date; $$;

create or replace function lunch_private.kst_hour() returns int
language sql stable as $$ select extract(hour from lunch_private.now() at time zone 'Asia/Seoul')::int; $$;

create or replace function lunch_private.setting_int(k text) returns int
language sql stable security definer set search_path = lunch as $$
  select value::int from settings where key = k;
$$;

create or replace function lunch_private.fmt_day(d date) returns text
language sql immutable as $$
  select extract(month from d)::int || '/' || extract(day from d)::int || '(' ||
    (array['일','월','화','수','목','금','토'])[extract(dow from d)::int + 1] || ')';
$$;

create or replace function lunch_private.is_meal_day(d date) returns boolean
language sql stable security definer set search_path = lunch as $$
  select coalesce((select not closed from day_overrides where date = d), extract(isodow from d) < 6);
$$;

-- 신청/취소 마감일: 식사일 deadline_days일 전 (그날 23:59까지 가능)
create or replace function lunch_private.deadline_of(d date) returns date
language sql stable as $$ select d - lunch_private.setting_int('deadline_days'); $$;

-- open: 신청 가능 · confirmed: 마감되어 인원 확정 · today: 오늘 · past: 지난 날
create or replace function lunch_private.phase_of(d date) returns text
language sql stable as $$
  select case
    when d < lunch_private.kst_today() then 'past'
    when d = lunch_private.kst_today() then 'today'
    when lunch_private.kst_today() <= lunch_private.deadline_of(d) then 'open'
    else 'confirmed' end;
$$;

-- 출석 체크가 마감되어 노쇼가 확정된 날인지
create or replace function lunch_private.attendance_closed(d date) returns boolean
language sql stable as $$
  select d < lunch_private.kst_today()
    or (d = lunch_private.kst_today() and lunch_private.kst_hour() >= lunch_private.setting_int('attendance_close_hour'));
$$;

create or replace function lunch_private.last_closed_day() returns date
language sql stable as $$
  select case when lunch_private.kst_hour() >= lunch_private.setting_int('attendance_close_hour')
    then lunch_private.kst_today() else lunch_private.kst_today() - 1 end;
$$;

create or replace function lunch_private.require_user() returns lunch.profiles
language plpgsql stable security definer set search_path = lunch as $$
declare p profiles;
begin
  select * into p from profiles where id = auth.uid();
  if p.id is null then raise exception '로그인이 필요해요.'; end if;
  if p.status = 'pending' then raise exception '아직 관리자 승인 전이에요.'; end if;
  if p.status <> 'active' then raise exception '비활성화된 계정이에요.'; end if;
  return p;
end;
$$;

create or replace function lunch_private.require_admin() returns lunch.profiles
language plpgsql stable security definer set search_path = lunch as $$
declare p profiles := lunch_private.require_user();
begin
  if not p.is_admin then raise exception '관리자만 할 수 있어요.'; end if;
  return p;
end;
$$;

create or replace function lunch_private.require_cook() returns lunch.profiles
language plpgsql stable security definer set search_path = lunch as $$
declare p profiles := lunch_private.require_user();
begin
  if not (p.is_cook or p.is_admin) then raise exception '요리사나 관리자만 할 수 있어요.'; end if;
  return p;
end;
$$;

create or replace function lunch_private.audit(actor uuid, act text, detail jsonb) returns void
language sql security definer set search_path = lunch as $$
  insert into audit_log (actor_id, action, detail) values (actor, act, detail);
$$;

create or replace function lunch_private.notify(uid uuid, k text, t text, b text default null) returns boolean
language plpgsql security definer set search_path = lunch as $$
declare n int;
begin
  insert into notifications (user_id, dedupe_key, title, body) values (uid, k, t, b)
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count;
  return n > 0;
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
    'guests', (select coalesce(sum(guests), 0) from signups where date = d),
    'total', (select count(*) + coalesce(sum(guests), 0) from signups where date = d),
    'mine', (select jsonb_build_object('guests', guests, 'guestNote', guest_note) from signups where date = d and user_id = uid),
    'menu', (select jsonb_build_object('title', title, 'description', description) from menus where date = d)
  );
$$;

-- ---------- 화면용 조회 ----------
create or replace function lunch.get_me() returns jsonb
language sql stable security definer set search_path = lunch as $$
  select jsonb_build_object('id', id, 'loginId', login_id, 'name', name, 'isAdmin', is_admin, 'isCook', is_cook,
    'isMember', is_member, 'status', status, 'mustChangePw', must_change_pw)
  from profiles where id = auth.uid();
$$;

create or replace function lunch.get_calendar(p_month text default null) returns jsonb
language plpgsql stable security definer set search_path = lunch as $$
declare
  u profiles := lunch_private.require_user();
  first date := coalesce(to_date(p_month || '-01', 'YYYY-MM-DD'), date_trunc('month', lunch_private.kst_today())::date);
begin
  return jsonb_build_object(
    'month', to_char(first, 'YYYY-MM'),
    'today', lunch_private.kst_today(),
    'days', (select jsonb_agg(lunch_private.day_view(d::date, u.id) order by d)
             from generate_series(first, (first + interval '1 month' - interval '1 day')::date, interval '1 day') d)
  );
end;
$$;

create or replace function lunch.get_day(p_date date) returns jsonb
language plpgsql stable security definer set search_path = lunch as $$
declare u profiles := lunch_private.require_user();
begin
  return lunch_private.day_view(p_date, u.id) || jsonb_build_object(
    'roster', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'guests', s.guests, 'guestNote', s.guest_note,
        'attended', a.user_id is not null) order by p.name)
      from signups s join profiles p on p.id = s.user_id
      left join attendance a on a.user_id = s.user_id and a.date = s.date
      where s.date = p_date), '[]'::jsonb),
    'attendanceClosed', lunch_private.attendance_closed(p_date),
    'canSelfCheck', lunch_private.phase_of(p_date) = 'today' and not lunch_private.attendance_closed(p_date)
  );
end;
$$;

create or replace function lunch_private.noshow_rows() returns table (
  id uuid, name text, login_id text, status text, no_shows bigint, no_shows_90d bigint, signups bigint)
language sql stable security definer set search_path = lunch as $$
  select p.id, p.name, p.login_id, p.status,
    count(*) filter (where s.id is not null and a.user_id is null),
    count(*) filter (where s.id is not null and a.user_id is null and s.date >= lunch_private.kst_today() - 90),
    count(s.id)
  from profiles p
  left join signups s on s.user_id = p.id and s.date <= lunch_private.last_closed_day()
  left join attendance a on a.user_id = s.user_id and a.date = s.date
  where p.is_member
  group by p.id
  order by 5 desc, p.name;
$$;

create or replace function lunch_private.budget_summary() returns jsonb
language sql stable security definer set search_path = lunch as $$
  with b as (
    select * from budgets where start_date <= lunch_private.kst_today() and end_date >= lunch_private.kst_today()
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

create or replace function lunch.get_summary() returns jsonb
language plpgsql stable security definer set search_path = lunch as $$
declare u profiles := lunch_private.require_user(); r record;
begin
  select * into r from lunch_private.noshow_rows() n where n.id = u.id;
  return jsonb_build_object(
    'budget', lunch_private.budget_summary(),
    'noShows', case when r.id is null then null else jsonb_build_object('total', r.no_shows, 'last90', r.no_shows_90d, 'signups', r.signups) end,
    'noShowThreshold', lunch_private.setting_int('noshow_threshold'),
    'deadlineDays', lunch_private.setting_int('deadline_days'),
    'attendanceCloseHour', lunch_private.setting_int('attendance_close_hour'),
    'unread', (select count(*) from notifications where user_id = u.id and read_at is null)
  );
end;
$$;

create or replace function lunch.get_my_history() returns jsonb
language plpgsql stable security definer set search_path = lunch as $$
declare u profiles := lunch_private.require_user();
begin
  return coalesce((select jsonb_agg(x order by x.date desc) from (
    select s.date, s.guests, a.user_id is not null as attended,
      lunch_private.phase_of(s.date) as phase, lunch_private.attendance_closed(s.date) as closed
    from signups s left join attendance a on a.user_id = s.user_id and a.date = s.date
    where s.user_id = u.id order by s.date desc limit 100) x), '[]'::jsonb);
end;
$$;

create or replace function lunch.mark_notifications_read() returns void
language sql security definer set search_path = lunch as $$
  update notifications set read_at = now() where user_id = auth.uid() and read_at is null;
$$;

-- ---------- 신청 (본인만, 마감 전까지) ----------
create or replace function lunch.signup_upsert(p_date date, p_guests int default 0, p_guest_note text default null) returns jsonb
language plpgsql security definer set search_path = lunch as $$
declare u profiles := lunch_private.require_user();
begin
  if not u.is_member then raise exception '점심 신청 대상 계정이 아니에요.'; end if;
  if not lunch_private.is_meal_day(p_date) then raise exception '이날은 점심 운영을 하지 않아요.'; end if;
  if lunch_private.phase_of(p_date) <> 'open' then
    raise exception '신청 마감됐어요. (%까지)', lunch_private.fmt_day(lunch_private.deadline_of(p_date));
  end if;
  if p_guests is null or p_guests < 0 or p_guests > lunch_private.setting_int('max_guests') then
    raise exception '손님 수는 0~%명이에요.', lunch_private.setting_int('max_guests');
  end if;
  insert into signups (user_id, date, guests, guest_note)
  values (u.id, p_date, p_guests, case when p_guests > 0 then left(nullif(trim(p_guest_note), ''), 50) end)
  on conflict (user_id, date) do update set guests = excluded.guests, guest_note = excluded.guest_note, updated_at = now();
  return lunch_private.day_view(p_date, u.id);
end;
$$;

create or replace function lunch.signup_cancel(p_date date) returns jsonb
language plpgsql security definer set search_path = lunch as $$
declare u profiles := lunch_private.require_user();
begin
  if lunch_private.phase_of(p_date) <> 'open' then
    raise exception '마감 후에는 취소할 수 없어요. 꼭 필요하면 관리자에게 말해 주세요.';
  end if;
  delete from signups where user_id = u.id and date = p_date;
  return lunch_private.day_view(p_date, u.id);
end;
$$;

-- ---------- 출석 ----------
create or replace function lunch.self_check(p_date date) returns void
language plpgsql security definer set search_path = lunch as $$
declare u profiles := lunch_private.require_user();
begin
  if lunch_private.phase_of(p_date) <> 'today' or lunch_private.attendance_closed(p_date) then
    raise exception '출석 체크는 식사 당일 %시 전까지만 할 수 있어요.', lunch_private.setting_int('attendance_close_hour');
  end if;
  if not exists (select 1 from signups where user_id = u.id and date = p_date) then
    raise exception '신청하지 않은 날이에요.';
  end if;
  insert into attendance (user_id, date, checked_by) values (u.id, p_date, u.id) on conflict do nothing;
end;
$$;

-- 요리사는 오늘·어제, 관리자는 지난 날도 정정 가능
create or replace function lunch.set_attendance(p_date date, p_user uuid, p_attended boolean) returns void
language plpgsql security definer set search_path = lunch as $$
declare a profiles := lunch_private.require_cook(); ph text := lunch_private.phase_of(p_date);
begin
  if ph in ('open', 'confirmed') then raise exception '아직 식사일이 아니에요.'; end if;
  if not a.is_admin and p_date < lunch_private.kst_today() - 1 then
    raise exception '요리사는 오늘과 어제 출석만 체크할 수 있어요. 그 이전은 관리자에게 부탁해 주세요.';
  end if;
  if not exists (select 1 from signups where user_id = p_user and date = p_date) then raise exception '신청자가 아니에요.'; end if;
  if p_attended then
    insert into attendance (user_id, date, checked_by) values (p_user, p_date, a.id) on conflict do nothing;
    delete from notifications where dedupe_key = 'noshow:' || p_date || ':' || p_user;  -- 노쇼 정정
  else
    delete from attendance where user_id = p_user and date = p_date;
  end if;
  perform lunch_private.audit(a.id, 'attendance', jsonb_build_object('date', p_date, 'userId', p_user, 'attended', p_attended));
end;
$$;

-- ---------- 메뉴 (요리사) ----------
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
    perform lunch_private.notify(s.user_id,
      'menu:' || p_date || ':' || s.user_id || ':' || case when existed then extract(epoch from clock_timestamp())::text else 'new' end,
      lunch_private.fmt_day(p_date) || ' 메뉴' || case when existed then ' 변경' else '' end || ': ' || left(trim(p_title), 60),
      nullif(trim(p_description), ''));
  end loop;
end;
$$;

create or replace function lunch.delete_menu(p_date date) returns void
language plpgsql security definer set search_path = lunch as $$
begin
  perform lunch_private.require_cook();
  delete from menus where date = p_date;
end;
$$;

create or replace function lunch.cook_upcoming() returns jsonb
language plpgsql stable security definer set search_path = lunch as $$
declare u profiles := lunch_private.require_cook();
begin
  return jsonb_build_object('days', coalesce((
    select jsonb_agg(lunch_private.day_view(d::date, u.id) order by d)
    from generate_series(lunch_private.kst_today(), lunch_private.kst_today() + 14, interval '1 day') d
    where lunch_private.is_meal_day(d::date)), '[]'::jsonb));
end;
$$;

-- ---------- 지출 ----------
create or replace function lunch.add_expense(p_date date, p_amount bigint, p_memo text default null) returns bigint
language plpgsql security definer set search_path = lunch as $$
declare a profiles := lunch_private.require_cook(); new_id bigint;
begin
  if p_amount is null or p_amount <= 0 or p_amount > 100000000 then raise exception '금액을 확인해 주세요.'; end if;
  insert into expenses (date, amount, memo, created_by) values (p_date, p_amount, left(nullif(trim(p_memo), ''), 100), a.id)
  returning id into new_id;
  perform lunch_private.audit(a.id, 'expense.add', jsonb_build_object('id', new_id, 'date', p_date, 'amount', p_amount, 'memo', p_memo));
  return new_id;
end;
$$;

create or replace function lunch.delete_expense(p_id bigint) returns void
language plpgsql security definer set search_path = lunch as $$
declare a profiles := lunch_private.require_cook(); e expenses;
begin
  select * into e from expenses where id = p_id;
  if e.id is null then raise exception '없는 지출이에요.'; end if;
  if not a.is_admin and e.created_by is distinct from a.id then raise exception '본인이 입력한 지출만 지울 수 있어요.'; end if;
  delete from expenses where id = p_id;
  perform lunch_private.audit(a.id, 'expense.delete', to_jsonb(e));
end;
$$;

-- ---------- 푸시 구독 ----------
create or replace function lunch.save_push_sub(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = lunch as $$
declare u profiles := lunch_private.require_user();
begin
  if p_endpoint is null or p_endpoint !~ '^https://' then raise exception '잘못된 구독 정보예요.'; end if;
  insert into push_subs (endpoint, user_id, p256dh, auth) values (p_endpoint, u.id, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;

-- 본인 비밀번호를 바꾼 뒤 "임시 비밀번호" 표시를 끈다
create or replace function lunch.clear_must_change_pw() returns void
language sql security definer set search_path = lunch as $$
  update profiles set must_change_pw = false where id = auth.uid();
$$;

-- ---------- 관리자 ----------
create or replace function lunch.admin_users() returns jsonb
language plpgsql stable security definer set search_path = lunch as $$
begin
  perform lunch_private.require_admin();
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'loginId', login_id, 'name', name, 'isAdmin', is_admin,
    'isCook', is_cook, 'isMember', is_member, 'status', status) order by status, name) from profiles), '[]'::jsonb);
end;
$$;

create or replace function lunch.admin_update_user(p_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = lunch as $$
declare a profiles := lunch_private.require_admin(); u profiles; n profiles; d date;
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
    for d in select date from signups where user_id = u.id and date > lunch_private.kst_today() loop
      if lunch_private.phase_of(d) = 'open' then delete from signups where user_id = u.id and date = d; end if;
    end loop;
  end if;
  if u.status = 'pending' and n.status = 'active' then
    perform lunch_private.notify(u.id, 'approved:' || u.id, '가입이 승인됐어요', '이제 점심 신청을 할 수 있어요.');
  end if;
  perform lunch_private.audit(a.id, 'user.update', jsonb_build_object('id', u.id) || p);
end;
$$;

-- 마감 후 예외 처리 (기록이 남는다)
create or replace function lunch.admin_signup_override(p_date date, p_user uuid, p_guests int default 0, p_remove boolean default false) returns void
language plpgsql security definer set search_path = lunch as $$
declare a profiles := lunch_private.require_admin();
begin
  if p_remove then
    delete from signups where user_id = p_user and date = p_date;
    delete from attendance where user_id = p_user and date = p_date;
  else
    if p_guests < 0 or p_guests > lunch_private.setting_int('max_guests') then raise exception '손님 수를 확인해 주세요.'; end if;
    insert into signups (user_id, date, guests) values (p_user, p_date, p_guests)
    on conflict (user_id, date) do update set guests = excluded.guests, updated_at = now();
  end if;
  perform lunch_private.audit(a.id, 'signup.override', jsonb_build_object('date', p_date, 'userId', p_user, 'guests', p_guests, 'remove', p_remove));
end;
$$;

create or replace function lunch.admin_set_day(p_date date, p_closed boolean, p_note text default null, p_reset boolean default false) returns void
language plpgsql security definer set search_path = lunch as $$
declare a profiles := lunch_private.require_admin();
begin
  if p_reset then delete from day_overrides where date = p_date;
  else
    insert into day_overrides (date, closed, note) values (p_date, p_closed, left(nullif(trim(p_note), ''), 30))
    on conflict (date) do update set closed = excluded.closed, note = excluded.note;
  end if;
  perform lunch_private.audit(a.id, 'day.override', jsonb_build_object('date', p_date, 'closed', p_closed, 'note', p_note, 'reset', p_reset));
end;
$$;

create or replace function lunch.admin_get_settings() returns jsonb
language plpgsql stable security definer set search_path = lunch, lunch_private as $$
begin
  perform lunch_private.require_admin();
  return (select jsonb_object_agg(key, value) from settings)
    || jsonb_build_object('invite_code', (select value from lunch_private.secrets where key = 'invite_code'));
end;
$$;

create or replace function lunch.admin_save_settings(p jsonb) returns jsonb
language plpgsql security definer set search_path = lunch, lunch_private as $$
declare a profiles := lunch_private.require_admin(); k text; lim int[]; v int;
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
    update lunch_private.secrets set value = coalesce(trim(p ->> 'invite_code'), '') where key = 'invite_code';
  end if;
  perform lunch_private.audit(a.id, 'settings', p - 'invite_code');
  return lunch.admin_get_settings();
end;
$$;

create or replace function lunch.admin_noshows() returns jsonb
language plpgsql stable security definer set search_path = lunch as $$
begin
  perform lunch_private.require_admin();
  return coalesce((select jsonb_agg(to_jsonb(n)) from lunch_private.noshow_rows() n), '[]'::jsonb);
end;
$$;

create or replace function lunch.admin_save_budget(p_start date, p_end date, p_amount bigint, p_note text default null, p_id bigint default null) returns void
language plpgsql security definer set search_path = lunch as $$
declare a profiles := lunch_private.require_admin();
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
  perform lunch_private.audit(a.id, 'budget.save', jsonb_build_object('id', p_id, 'start', p_start, 'end', p_end, 'amount', p_amount));
end;
$$;

create or replace function lunch.admin_delete_budget(p_id bigint) returns void
language plpgsql security definer set search_path = lunch as $$
declare a profiles := lunch_private.require_admin();
begin
  delete from budgets where id = p_id;
  perform lunch_private.audit(a.id, 'budget.delete', jsonb_build_object('id', p_id));
end;
$$;

-- 비밀번호 초기화: 임시 비밀번호를 만들어 돌려주고, 다음 로그인 때 바꾸게 한다
create or replace function lunch.admin_reset_password(p_id uuid) returns text
language plpgsql security definer set search_path = lunch, extensions as $$
declare
  a profiles := lunch_private.require_admin();
  chars text := 'abcdefghjkmnpqrstuvwxyz23456789';
  pw text := '';
begin
  if not exists (select 1 from profiles where id = p_id) then raise exception '없는 사용자예요.'; end if;
  for i in 1..10 loop
    pw := pw || substr(chars, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % length(chars)), 1);
  end loop;
  update auth.users set encrypted_password = extensions.crypt(pw, extensions.gen_salt('bf')), updated_at = now() where id = p_id;
  update profiles set must_change_pw = true where id = p_id;
  perform lunch_private.audit(a.id, 'user.reset_password', jsonb_build_object('id', p_id));
  return pw;
end;
$$;

-- ---------- 주기 작업 (pg_cron이 5분마다 실행, 여러 번 돌아도 알림은 한 번) ----------
create or replace function lunch_private.run_jobs() returns void
language plpgsql security definer set search_path = lunch as $$
declare
  today date := lunch_private.kst_today();
  dl int := lunch_private.setting_int('deadline_days');
  thr int := lunch_private.setting_int('noshow_threshold');
  d date; u record; hc record; any_new boolean := false;
begin
  -- 1) 마감 하루 전 리마인드: 내일이 마감인 식사일에 아직 신청 안 한 직원
  if lunch_private.kst_hour() >= lunch_private.setting_int('reminder_hour') then
    d := today + dl + 1;
    if lunch_private.is_meal_day(d) then
      for u in select p.id from profiles p where p.status = 'active' and p.is_member
               and not exists (select 1 from signups s where s.user_id = p.id and s.date = d) loop
        perform lunch_private.notify(u.id, 'remind:' || d || ':' || u.id,
          lunch_private.fmt_day(d) || ' 점심 신청이 내일 마감돼요', '드실 거면 오늘~내일 중으로 신청해 주세요.');
      end loop;
    end if;
  end if;

  -- 2) 인원 확정 → 요리사에게 메뉴 등록 요청
  for i in 1..dl loop
    d := today + i;
    continue when lunch_private.phase_of(d) <> 'confirmed' or not lunch_private.is_meal_day(d);
    select count(*) as m, coalesce(sum(guests), 0) as g into hc from signups where date = d;
    for u in select id from profiles where status = 'active' and is_cook loop
      perform lunch_private.notify(u.id, 'confirmed:' || d || ':' || u.id,
        lunch_private.fmt_day(d) || ' 인원 확정: ' || (hc.m + hc.g) || '명',
        '직원 ' || hc.m || '명 + 손님 ' || hc.g || '명. 메뉴를 등록해 주세요.');
    end loop;
  end loop;

  -- 3) 노쇼 확정 알림 (최근 7일 내 출석 마감된 날)
  for i in 0..7 loop
    d := today - i;
    continue when not lunch_private.attendance_closed(d);
    for u in select s.user_id from signups s join profiles p on p.id = s.user_id and p.status = 'active'
             left join attendance a on a.user_id = s.user_id and a.date = s.date
             where s.date = d and a.user_id is null loop
      any_new := lunch_private.notify(u.user_id, 'noshow:' || d || ':' || u.user_id,
        lunch_private.fmt_day(d) || ' 점심 노쇼로 기록됐어요',
        '신청하고 드시지 않았어요. 착오라면 요리사나 관리자에게 말해 주세요.') or any_new;
    end loop;
  end loop;
  if any_new then
    for u in select n.* from lunch_private.noshow_rows() n where n.status = 'active' and n.no_shows_90d >= thr loop
      for hc in select id from profiles where status = 'active' and is_admin loop
        perform lunch_private.notify(hc.id, 'noshow-admin:' || u.id || ':' || u.no_shows_90d || ':' || hc.id,
          u.name || '님 노쇼 ' || u.no_shows_90d || '회 (최근 90일)', '기준 ' || thr || '회 이상이에요.');
      end loop;
    end loop;
  end if;
end;
$$;

-- 가입 신청이 들어오면 관리자에게 알림
create or replace function lunch_private.on_profile_created() returns trigger
language plpgsql security definer set search_path = lunch as $$
declare a record;
begin
  if new.status = 'pending' then
    for a in select id from profiles where status = 'active' and is_admin loop
      perform lunch_private.notify(a.id, 'pending:' || new.id || ':' || a.id,
        new.name || '님이 가입 승인을 기다려요', '관리자 > 직원에서 승인해 주세요.');
    end loop;
  end if;
  return new;
end;
$$;
create trigger on_profile_created after insert on lunch.profiles
  for each row execute function lunch_private.on_profile_created();

-- ---------- 실행 권한 ----------
revoke all on all functions in schema lunch_private from public, anon, authenticated;
revoke execute on all functions in schema lunch from public, anon;
grant execute on all functions in schema lunch to authenticated;
grant usage on schema lunch to anon, authenticated;
grant execute on function lunch.precheck_signup(text, text) to anon;

-- ===== 20261025000003_cron.sql =====
-- TC 점심: 주기 작업(pg_cron)과 휴대폰 푸시 발송(pg_net → Edge Function)
-- 로컬 테스트에서는 이 파일을 건너뛴다.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Edge Function(service_role)만 쓰는 함수들
create or replace function lunch.svc_get_secret(k text) returns text
language sql stable security definer set search_path = lunch_private as $$
  select value from lunch_private.secrets where key = k;
$$;

create or replace function lunch.svc_set_secret(k text, v text) returns void
language sql security definer set search_path = lunch_private as $$
  insert into lunch_private.secrets (key, value) values (k, v) on conflict (key) do update set value = excluded.value;
$$;

-- 아직 안 보낸 알림을 가져가면서 보낸 것으로 표시한다
create or replace function lunch.svc_take_push_batch() returns jsonb
language plpgsql security definer set search_path = lunch as $$
declare out jsonb;
begin
  with batch as (
    update notifications set pushed_at = now()
    where id in (select id from notifications where pushed_at is null order by id limit 200 for update skip locked)
    returning id, user_id, title, body, created_at
  )
  select coalesce(jsonb_agg(jsonb_build_object('title', b.title, 'body', b.body,
    'subs', (select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'keys',
      jsonb_build_object('p256dh', s.p256dh, 'auth', s.auth))), '[]'::jsonb) from push_subs s where s.user_id = b.user_id))), '[]'::jsonb)
  into out
  from batch b where b.created_at > now() - interval '1 day';   -- 오래된 알림은 푸시하지 않고 넘긴다
  return out;
end;
$$;

create or replace function lunch.svc_delete_push_sub(p_endpoint text) returns void
language sql security definer set search_path = lunch as $$
  delete from push_subs where endpoint = p_endpoint;
$$;

revoke execute on function lunch.svc_get_secret(text), lunch.svc_set_secret(text, text),
  lunch.svc_take_push_batch(), lunch.svc_delete_push_sub(text) from public, anon, authenticated;
grant execute on function lunch.svc_get_secret(text), lunch.svc_set_secret(text, text),
  lunch.svc_take_push_batch(), lunch.svc_delete_push_sub(text) to service_role;

-- 보낼 알림이 있으면 push-dispatch 함수를 깨운다 (project_url은 배포 워크플로가 넣는다)
create or replace function lunch_private.dispatch_push() returns void
language plpgsql security definer set search_path = lunch, lunch_private as $$
declare url text := (select value from lunch_private.secrets where key = 'project_url');
begin
  if url is null or not exists (select 1 from notifications where pushed_at is null) then return; end if;
  perform net.http_post(
    url := url || '/functions/v1/push-dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select value from lunch_private.secrets where key = 'cron_secret')),
    body := '{}'::jsonb
  );
end;
$$;

select cron.schedule('tc-lunch-jobs', '*/5 * * * *', 'select lunch_private.run_jobs()');
select cron.schedule('tc-lunch-push', '* * * * *', 'select lunch_private.dispatch_push()');

-- ===== 초대 코드 (직원 가입용, 6자 이상) =====
-- 이 코드로 맨 처음 가입하는 사람이 관리자가 됩니다. 나중에 앱 관리자 > 설정에서 바꿀 수 있어요.
update lunch_private.secrets set value = '여기에-초대코드' where key = 'invite_code';
