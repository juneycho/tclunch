-- 2026-10-31 로그인 화면 공지 (관리자가 설정에서 고친다). 로그인 전에도 읽을 수 있다. 여러 번 실행해도 괜찮다.
insert into lunch.settings (key, value) values ('login_notice', '관리자 아이디: TC (비밀번호: 1234)')
on conflict (key) do nothing;

create or replace function lunch.login_notice() returns text
language sql stable security definer set search_path = lunch as $$
  select value from settings where key = 'login_notice';
$$;

create or replace function lunch.admin_save_notice(p_text text) returns void
language plpgsql security definer set search_path = lunch as $$
declare a profiles := lunch_private.require_admin();
begin
  insert into settings (key, value) values ('login_notice', left(coalesce(trim(p_text), ''), 300))
  on conflict (key) do update set value = excluded.value;
  perform lunch_private.audit(a.id, 'settings.notice', jsonb_build_object('text', p_text));
end;
$$;

revoke execute on function lunch.login_notice(), lunch.admin_save_notice(text) from public;
grant execute on function lunch.login_notice() to anon, authenticated;
grant execute on function lunch.admin_save_notice(text) to authenticated;
