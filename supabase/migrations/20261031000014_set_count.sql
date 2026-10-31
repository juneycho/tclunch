-- 2026-10-31 날짜를 누르고 인원을 정한 뒤 '확인': 내 인원을 그 숫자로 맞춘다 (0이면 취소). 여러 번 실행해도 괜찮다.
create or replace function lunch.set_my_count(p_date date, p_count int) returns jsonb
language plpgsql security definer set search_path = lunch as $$
declare u profiles := lunch_private.require_user(); guests int;
begin
  if p_count is null or p_count < 0 then raise exception '인원을 확인해 주세요.'; end if;
  if p_count > 0 and not lunch_private.is_meal_day(p_date) then raise exception '이날은 점심 운영을 하지 않아요.'; end if;
  if lunch_private.phase_of(p_date) <> 'open' and not u.is_admin then
    raise exception '신청 마감됐어요. (%까지)', lunch_private.fmt_day(lunch_private.deadline_of(p_date));
  end if;
  guests := case when u.is_member then greatest(p_count - 1, 0) else p_count end;
  if guests > lunch_private.setting_int('max_guests') then
    raise exception '손님 수는 1~%명이에요.', lunch_private.setting_int('max_guests');
  end if;
  if u.is_member and p_count > 0 then
    insert into signups (user_id, date) values (u.id, p_date) on conflict (user_id, date) do nothing;
  else
    delete from signups where user_id = u.id and date = p_date;
  end if;
  delete from guest_entries where date = p_date and host_id = u.id;
  if guests > 0 then insert into guest_entries (date, host_id, count) values (p_date, u.id, guests); end if;
  perform lunch_private.audit(u.id, 'set_count', jsonb_build_object('date', p_date, 'count', p_count));
  return lunch_private.day_view(p_date, u.id);
end;
$$;
revoke execute on function lunch.set_my_count(date, int) from public, anon;
grant execute on function lunch.set_my_count(date, int) to authenticated;
