-- 2026-10-31 손님 −1: 내가 추가한 손님을 한 명 줄인다 (마감 전, 관리자는 언제나). 여러 번 실행해도 괜찮다.
create or replace function lunch.remove_guest(p_date date) returns jsonb
language plpgsql security definer set search_path = lunch as $$
declare u profiles := lunch_private.require_user(); g guest_entries;
begin
  if lunch_private.phase_of(p_date) <> 'open' and not u.is_admin then
    raise exception '마감 후에는 취소할 수 없어요. 꼭 필요하면 관리자에게 말해 주세요.';
  end if;
  select * into g from guest_entries where date = p_date and host_id = u.id order by id desc limit 1;
  if g.id is null then raise exception '내가 추가한 손님이 없어요.'; end if;
  if g.count > 1 then update guest_entries set count = count - 1 where id = g.id;
  else delete from guest_entries where id = g.id; end if;
  perform lunch_private.audit(u.id, 'guests.minus', jsonb_build_object('date', p_date));
  return lunch_private.day_view(p_date, u.id);
end;
$$;
revoke execute on function lunch.remove_guest(date) from public, anon;
grant execute on function lunch.remove_guest(date) to authenticated;
