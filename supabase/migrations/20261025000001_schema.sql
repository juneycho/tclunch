-- TC 점심: 테이블, 권한(RLS), 공휴일
-- 쓰기는 전부 아래 RPC 함수(security definer)로만 한다. 테이블에는 읽기 정책만 있다.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- 외부에 노출되면 안 되는 값: 초대 코드, 관리자 토큰, 푸시 키, 크론 비밀값, 프로젝트 URL
create table private.secrets (
  key text primary key,
  value text not null
);
insert into private.secrets (key, value) values
  ('invite_code', ''),
  ('admin_token', encode(extensions.gen_random_bytes(24), 'hex')),
  ('cron_secret', encode(extensions.gen_random_bytes(24), 'hex'));

create table public.profiles (
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

create table public.settings (
  key text primary key,
  value text not null
);
insert into public.settings (key, value) values
  ('deadline_days', '7'),           -- 식사일 며칠 전까지 신청/취소 가능한지 (그날 23:59 KST까지)
  ('noshow_threshold', '3'),        -- 최근 90일 노쇼 몇 회부터 관리자에게 알릴지
  ('attendance_close_hour', '15'),  -- 식사 당일 몇 시에 출석 체크를 마감하고 노쇼를 확정할지
  ('reminder_hour', '9'),           -- 마감 전날 리마인드 시각
  ('max_guests', '20');

create table public.day_overrides (
  date date primary key,
  closed boolean not null,          -- true: 휴무, false: (주말이라도) 운영
  note text
);

create table public.menus (
  date date primary key,
  title text not null,
  description text,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

create table public.signups (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  guests int not null default 0 check (guests >= 0),
  guest_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);
create index signups_date on public.signups (date);

create table public.attendance (
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  checked_by uuid references public.profiles (id),
  checked_at timestamptz not null default now(),
  primary key (user_id, date)
);

create table public.budgets (
  id bigint generated always as identity primary key,
  start_date date not null,
  end_date date not null,
  amount bigint not null check (amount >= 0),
  note text,
  check (start_date <= end_date)
);

create table public.expenses (
  id bigint generated always as identity primary key,
  date date not null,
  amount bigint not null check (amount > 0),
  memo text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  dedupe_key text unique,
  title text not null,
  body text,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  pushed_at timestamptz
);
create index notifications_user on public.notifications (user_id, id desc);
create index notifications_unpushed on public.notifications (id) where pushed_at is null;

create table public.push_subs (
  endpoint text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  p256dh text not null,
  auth text not null
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id),
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

-- 대한민국 공휴일(대체공휴일 포함). 관리자 화면에서 고칠 수 있다.
insert into public.day_overrides (date, closed, note) values
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
create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'active');
$$;

create or replace function public.is_admin_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'active' and is_admin);
$$;

alter table public.profiles enable row level security;
alter table public.settings enable row level security;
alter table public.day_overrides enable row level security;
alter table public.menus enable row level security;
alter table public.signups enable row level security;
alter table public.attendance enable row level security;
alter table public.budgets enable row level security;
alter table public.expenses enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subs enable row level security;
alter table public.audit_log enable row level security;

-- 본인 프로필은 승인 전에도 볼 수 있어야 "승인 대기" 화면을 띄울 수 있다
create policy "read profiles" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_active_user());
create policy "read settings" on public.settings for select to authenticated using (public.is_active_user());
create policy "read days" on public.day_overrides for select to authenticated using (public.is_active_user());
create policy "read menus" on public.menus for select to authenticated using (public.is_active_user());
create policy "read signups" on public.signups for select to authenticated using (public.is_active_user());
create policy "read attendance" on public.attendance for select to authenticated using (public.is_active_user());
create policy "read budgets" on public.budgets for select to authenticated using (public.is_active_user());
create policy "read expenses" on public.expenses for select to authenticated using (public.is_active_user());
create policy "read own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "read own push subs" on public.push_subs for select to authenticated using (user_id = auth.uid());
create policy "admin reads audit" on public.audit_log for select to authenticated using (public.is_admin_user());

revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;

-- ---------- 가입: auth.users에 사용자가 생기면 profiles를 만든다 ----------
-- 직원이 직접 가입할 때는 초대 코드가 맞아야 하고(승인 대기 상태),
-- 관리자 기능(Edge Function)으로 만들 때는 서버만 아는 admin_token이 있어야 한다(바로 사용 가능).
-- 초대 코드로 맨 처음 가입한 사람은 관리자가 된다. 초대 코드는 배포할 때 GitHub 비밀값으로 넣는다.
-- BEFORE 트리거에서 검사하고 비밀값을 메타데이터에서 지운 뒤, AFTER 트리거에서 프로필을 만든다.
create or replace function private.check_new_user() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  code text := (select value from private.secrets where key = 'invite_code');
  by_admin boolean := coalesce(meta ->> 'admin_token', '') = (select value from private.secrets where key = 'admin_token');
  login text := lower(meta ->> 'login_id');
begin
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

create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare
  meta jsonb := new.raw_user_meta_data;
  by_admin boolean := coalesce((meta ->> 'tcl_by_admin')::boolean, false);
  first_user boolean := not exists (select 1 from profiles);
begin
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

create trigger on_auth_user_check before insert on auth.users
  for each row execute function private.check_new_user();
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- 가입 화면에서 미리 확인 (Supabase Auth는 트리거 오류 메시지를 그대로 보여주지 않아서)
create or replace function public.precheck_signup(p_invite_code text, p_login_id text) returns text
language plpgsql stable security definer set search_path = public, private as $$
declare code text := (select value from private.secrets where key = 'invite_code');
begin
  if code = '' or coalesce(p_invite_code, '') <> code then return '초대 코드가 맞지 않아요. 관리자에게 물어봐 주세요.'; end if;
  if lower(coalesce(p_login_id, '')) !~ '^[a-z0-9._-]{3,30}$' then return '아이디는 영문 소문자/숫자 3~30자로 만들어 주세요.'; end if;
  if exists (select 1 from profiles where login_id = lower(p_login_id)) then return '이미 있는 아이디예요.'; end if;
  return null;
end;
$$;
