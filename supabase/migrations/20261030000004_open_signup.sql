-- 2026-10-30: 초대 코드·관리자 승인 없이 "이름 + 비밀번호"로 바로 들어가기
-- 이름이 곧 아이디다 (이름을 UTF-8 16진수로 바꿔 내부 아이디로 쓴다). 같은 이름은 한 명만.
-- 비밀번호는 본인 확인용(다른 사람이 내 이름으로 신청하지 못하게)이라 숫자 4자리부터 허용한다.
-- 이미 setup.sql을 실행한 프로젝트에서는 이 파일만 SQL Editor에서 한 번 실행하면 된다.

alter table lunch.profiles drop constraint if exists profiles_login_id_check;
alter table lunch.profiles add constraint profiles_login_id_check check (login_id ~ '^[a-z0-9._-]{3,64}$');

create or replace function lunch_private.check_new_user() returns trigger
language plpgsql security definer set search_path = lunch, lunch_private as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  by_admin boolean := coalesce(meta ->> 'admin_token', '') = (select value from lunch_private.secrets where key = 'admin_token');
  login text := lower(meta ->> 'login_id');
  nm text := trim(meta ->> 'name');
begin
  -- 같은 프로젝트의 다른 앱 가입은 그대로 통과시킨다
  if coalesce(meta ->> 'app', '') <> 'tc-lunch' then return new; end if;
  if login is null or login !~ '^[a-z0-9._-]{3,64}$' then
    raise exception '아이디 형식이 잘못됐어요.';
  end if;
  if coalesce(nm, '') = '' or char_length(nm) > 10 then
    raise exception '이름은 1~10자로 써 주세요.';
  end if;
  if exists (select 1 from profiles where lower(name) = lower(nm)) then
    raise exception '이미 있는 이름이에요.';
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
    new.id, lower(meta ->> 'login_id'), trim(meta ->> 'name'),
    'active',                                        -- 승인 없이 바로 사용
    first_user,                                      -- 맨 처음 들어온 사람이 관리자
    by_admin and coalesce((meta ->> 'is_cook')::boolean, false),
    case when by_admin then coalesce((meta ->> 'is_member')::boolean, true) else true end,
    by_admin
  );
  return new;
end;
$$;

-- 로그인 화면: 이 이름으로 이미 들어온 적이 있으면 그 계정의 아이디를 알려준다 (없으면 새로 만든다)
create or replace function lunch.login_lookup(p_name text) returns text
language sql stable security definer set search_path = lunch as $$
  select login_id from profiles where lower(name) = lower(trim(p_name)) order by created_at limit 1;
$$;

revoke execute on function lunch.login_lookup(text) from public;
grant execute on function lunch.login_lookup(text) to anon, authenticated;
revoke execute on all functions in schema lunch_private from public, anon, authenticated;
