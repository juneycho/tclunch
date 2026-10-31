-- 2026-10-31 관리자: 그날 한 사람의 신청(본인 + 그 사람이 추가한 손님)을 통째로 지운다. 내역에 사람 id를 넣는다. 여러 번 실행해도 괜찮다.
create or replace function lunch.admin_remove_person(p_date date, p_user uuid) returns void
language plpgsql security definer set search_path = lunch as $$
declare a profiles := lunch_private.require_admin();
begin
  delete from signups where date = p_date and user_id = p_user;
  delete from guest_entries where date = p_date and host_id = p_user;
  perform lunch_private.audit(a.id, 'admin.remove', jsonb_build_object('date', p_date, 'user', p_user));
end;
$$;

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
                     jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'count', per.n) order by p.name) as people
              from per join profiles p on p.id = per.uid group by per.date) d), '[]'::jsonb),
      'totals', coalesce((
        select jsonb_agg(jsonb_build_object('name', t.name, 'count', t.n) order by t.name)
        from (select p.name, sum(per.n)::int as n from per join profiles p on p.id = per.uid group by p.name) t), '[]'::jsonb),
      'total', coalesce((select sum(n) from per), 0)
    )
  );
end;
$$;

revoke execute on function lunch.admin_remove_person(date, uuid) from public, anon;
grant execute on function lunch.admin_remove_person(date, uuid) to authenticated;
