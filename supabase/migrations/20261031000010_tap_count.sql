-- 2026-10-31 날짜를 한 번 누를 때마다 내 인원 +1 (처음은 나, 그다음부터는 손님), −1로 줄인다. 여러 번 실행해도 괜찮다.
create or replace function lunch.tap_day(p_date date) returns jsonb
language plpgsql security definer set search_path = lunch as $$
declare u profiles := lunch_private.require_user(); g guest_entries;
begin
  if not lunch_private.is_meal_day(p_date) then raise exception '이날은 점심 운영을 하지 않아요.'; end if;
  if lunch_private.phase_of(p_date) <> 'open' and not u.is_admin then
    raise exception '신청 마감됐어요. (%까지)', lunch_private.fmt_day(lunch_private.deadline_of(p_date));
  end if;
  if u.is_member and not exists (select 1 from signups where user_id = u.id and date = p_date) then
    insert into signups (user_id, date) values (u.id, p_date);
  else
    select * into g from guest_entries where date = p_date and host_id = u.id order by id desc limit 1;
    if coalesce((select sum(count) from guest_entries where date = p_date and host_id = u.id), 0) >= lunch_private.setting_int('max_guests') then
      raise exception '손님 수는 1~%명이에요.', lunch_private.setting_int('max_guests');
    end if;
    if g.id is null then insert into guest_entries (date, host_id, count) values (p_date, u.id, 1);
    else update guest_entries set count = count + 1 where id = g.id; end if;
  end if;
  perform lunch_private.audit(u.id, 'tap', jsonb_build_object('date', p_date));
  return lunch_private.day_view(p_date, u.id);
end;
$$;

create or replace function lunch.untap_day(p_date date) returns jsonb
language plpgsql security definer set search_path = lunch as $$
declare u profiles := lunch_private.require_user(); g guest_entries;
begin
  if lunch_private.phase_of(p_date) <> 'open' and not u.is_admin then
    raise exception '마감 후에는 취소할 수 없어요. 꼭 필요하면 관리자에게 말해 주세요.';
  end if;
  select * into g from guest_entries where date = p_date and host_id = u.id order by id desc limit 1;
  if g.id is not null then
    if g.count > 1 then update guest_entries set count = count - 1 where id = g.id;
    else delete from guest_entries where id = g.id; end if;
  else
    delete from signups where user_id = u.id and date = p_date;
  end if;
  perform lunch_private.audit(u.id, 'untap', jsonb_build_object('date', p_date));
  return lunch_private.day_view(p_date, u.id);
end;
$$;

-- 내역: 날짜별 "이름 N명"과 총인원, 그리고 그 달 사람별 합계 (휴일로 바뀐 날은 뺀다)
create or replace function lunch.history_list(p_month text default null) returns jsonb
language plpgsql stable security definer set search_path = lunch as $$
declare
  u profiles := lunch_private.require_user();
  first date := coalesce(to_date(p_month || '-01', 'YYYY-MM-DD'), date_trunc('month', lunch_private.kst_today())::date);
  last date := (first + interval '1 month' - interval '1 day')::date;
begin
  return (
    with per as (
      select x.date, x.uid, sum(x.n)::int as n from (
        select date, user_id as uid, 1 as n from signups where date between first and last
        union all
        select date, host_id, count from guest_entries where date between first and last
      ) x
      where lunch_private.is_meal_day(x.date)
      group by x.date, x.uid
    )
    select jsonb_build_object(
      'month', to_char(first, 'YYYY-MM'),
      'today', lunch_private.kst_today(),
      'days', coalesce((
        select jsonb_agg(jsonb_build_object('date', d.date, 'total', d.total, 'people', d.people) order by d.date)
        from (select per.date, sum(per.n)::int as total,
                     jsonb_agg(jsonb_build_object('name', p.name, 'count', per.n) order by p.name) as people
              from per join profiles p on p.id = per.uid group by per.date) d), '[]'::jsonb),
      'totals', coalesce((
        select jsonb_agg(jsonb_build_object('name', t.name, 'count', t.n) order by t.name)
        from (select p.name, sum(per.n)::int as n from per join profiles p on p.id = per.uid group by p.name) t), '[]'::jsonb),
      'total', coalesce((select sum(n) from per), 0)
    )
  );
end;
$$;

revoke execute on function lunch.tap_day(date), lunch.untap_day(date), lunch.history_list(text) from public, anon;
grant execute on function lunch.tap_day(date), lunch.untap_day(date), lunch.history_list(text) to authenticated;
