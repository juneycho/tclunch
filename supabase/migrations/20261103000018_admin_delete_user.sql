-- 2026-11-03 관리자: 잘못 만들어진 이름(계정)을 삭제한다. 여러 번 실행해도 괜찮다.
-- 계정만 지우고, 그 사람의 신청 기록은 같은 이름으로 남긴다 (관리자가 이름으로 등록한 것과 같은 형태). 그래서 날짜별 인원과 내역 합계는 바뀌지 않는다.
create or replace function lunch.admin_delete_user(p_id uuid) returns void
language plpgsql security definer set search_path = lunch as $$
declare a profiles := lunch_private.require_admin(); u profiles;
begin
  select * into u from profiles where id = p_id;
  if u.id is null then raise exception '사람을 찾을 수 없어요.'; end if;
  if u.id = a.id then raise exception '본인 계정은 삭제할 수 없어요.'; end if;
  if u.is_admin then raise exception '관리자는 먼저 관리자 체크를 풀고 삭제해 주세요.'; end if;
  insert into guest_entries (date, host_id, count, name)
  select x.date, a.id, sum(x.n)::int, u.name from (
    select date, 1 as n from signups where user_id = u.id
    union all
    select date, count from guest_entries where host_id = u.id and name is null
  ) x group by x.date;
  update menus set updated_by = null where updated_by = u.id;
  update attendance set checked_by = null where checked_by = u.id;
  update expenses set created_by = null where created_by = u.id;
  update audit_log set actor_id = null where actor_id = u.id;
  perform lunch_private.audit(a.id, 'user.delete', jsonb_build_object('id', u.id, 'name', u.name));
  delete from auth.users where id = u.id;   -- 프로필·신청·알림은 함께 지워진다
end;
$$;
revoke execute on function lunch.admin_delete_user(uuid) from public;
grant execute on function lunch.admin_delete_user(uuid) to authenticated;
