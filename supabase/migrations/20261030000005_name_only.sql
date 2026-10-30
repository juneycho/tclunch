-- 2026-10-30: 직원은 비밀번호 없이 이름만 쓰고 들어간다. 관리자만 비밀번호를 쓴다.
-- 직원 계정의 실제 비밀번호는 앱이 이름(내부 아이디)으로 정하는 고정 값('tclunch:' || login_id)이다.
-- 이미 setup.sql을 실행한 프로젝트에서는 이 파일만 SQL Editor에서 한 번 실행하면 된다.

create or replace function lunch_private.set_name_password(uid uuid) returns void
language sql security definer set search_path = lunch, extensions as $$
  update auth.users u set encrypted_password = extensions.crypt('tclunch:' || p.login_id, extensions.gen_salt('bf')), updated_at = now()
  from lunch.profiles p where p.id = uid and u.id = uid;
  update lunch.profiles set must_change_pw = false where id = uid;
$$;

-- 지금 있는 직원(관리자 제외) 계정을 이름만으로 들어올 수 있게 바꾼다
select lunch_private.set_name_password(id) from lunch.profiles where not is_admin;

-- 로그인 화면: 이 이름의 계정이 있는지, 관리자(비밀번호 필요)인지
drop function if exists lunch.login_lookup(text);
create function lunch.login_lookup(p_name text) returns jsonb
language sql stable security definer set search_path = lunch as $$
  select jsonb_build_object('loginId', login_id, 'admin', is_admin)
  from profiles where lower(name) = lower(trim(p_name)) order by created_at limit 1;
$$;
revoke execute on function lunch.login_lookup(text) from public;
grant execute on function lunch.login_lookup(text) to anon, authenticated;

-- 관리자에서 빠지면 다시 이름만으로 들어오게 한다.
-- (새로 관리자로 지정하면 "비번 초기화"로 임시 비밀번호를 만들어 알려 준다)
create or replace function lunch_private.on_admin_changed() returns trigger
language plpgsql security definer set search_path = lunch as $$
begin
  if old.is_admin and not new.is_admin then perform lunch_private.set_name_password(new.id); end if;
  return new;
end;
$$;
drop trigger if exists on_admin_changed on lunch.profiles;
create trigger on_admin_changed after update of is_admin on lunch.profiles
  for each row execute function lunch_private.on_admin_changed();

-- 비밀번호 초기화는 관리자 계정에만 의미가 있다
create or replace function lunch.admin_reset_password(p_id uuid) returns text
language plpgsql security definer set search_path = lunch, extensions as $$
declare
  a profiles := lunch_private.require_admin();
  chars text := 'abcdefghjkmnpqrstuvwxyz23456789';
  pw text := '';
begin
  if not exists (select 1 from profiles where id = p_id and is_admin) then
    raise exception '직원은 비밀번호 없이 이름만으로 들어와요. 관리자 계정만 초기화할 수 있어요.';
  end if;
  for i in 1..10 loop
    pw := pw || substr(chars, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % length(chars)), 1);
  end loop;
  update auth.users set encrypted_password = extensions.crypt(pw, extensions.gen_salt('bf')), updated_at = now() where id = p_id;
  update profiles set must_change_pw = true where id = p_id;
  perform lunch_private.audit(a.id, 'user.reset_password', jsonb_build_object('id', p_id));
  return pw;
end;
$$;

revoke execute on all functions in schema lunch_private from public, anon, authenticated;
