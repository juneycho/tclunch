-- 2026-10-31 관리자: 마감·지난 날짜도 아무나의 인원을 그 숫자로 맞춘다 (0이면 삭제). 여러 번 실행해도 괜찮다.
create or replace function lunch.admin_set_count(p_date date, p_user uuid, p_count int) returns jsonb
language plpgsql security definer set search_path = lunch as $$
declare a profiles := lunch_private.require_admin(); u profiles; guests int;
begin
  select * into u from profiles where id = p_user;
  if u.id is null then raise exception '사람을 찾을 수 없어요.'; end if;
  if p_count is null or p_count < 0 then raise exception '인원을 확인해 주세요.'; end if;
  if p_count > 0 and not lunch_private.is_meal_day(p_date) then raise exception '이날은 점심 운영을 하지 않아요.'; end if;
  guests := case when u.is_member then greatest(p_count - 1, 0) else p_count end;
  if u.is_member and p_count > 0 then
    insert into signups (user_id, date) values (u.id, p_date) on conflict (user_id, date) do nothing;
  else
    delete from signups where user_id = u.id and date = p_date;
  end if;
  delete from guest_entries where date = p_date and host_id = u.id;
  if guests > 0 then insert into guest_entries (date, host_id, count) values (p_date, u.id, guests); end if;
  perform lunch_private.audit(a.id, 'admin.set_count', jsonb_build_object('date', p_date, 'user', p_user, 'count', p_count));
  return lunch_private.day_view(p_date, a.id);
end;
$$;
grant execute on function lunch.admin_set_count(date, uuid, int) to authenticated;
