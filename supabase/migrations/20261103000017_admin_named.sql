-- 2026-11-03 관리자가 이름을 직접 적어 인원을 넣는다 (앱에 들어온 적 없는 사람도). 여러 번 실행해도 괜찮다.
-- 이름 붙은 인원은 관리자 계정이 맡아 guest_entries.name에 이름을 남기고, 내역에는 그 이름으로 나온다.
alter table lunch.guest_entries add column if not exists name text;

-- 관리자: 그날 '이름'의 인원을 그 숫자로 맞춘다 (0이면 삭제). 앱 사용자 이름과 같으면 그 사람 인원을 맞춘다.
create or replace function lunch.admin_set_named(p_date date, p_name text, p_count int) returns jsonb
language plpgsql security definer set search_path = lunch as $$
declare a profiles := lunch_private.require_admin(); nm text := left(trim(coalesce(p_name, '')), 40); uid uuid;
begin
  if nm = '' then raise exception '이름을 입력해 주세요.'; end if;
  if p_count is null or p_count < 0 or p_count > 100 then raise exception '인원을 확인해 주세요.'; end if;
  if p_count > 0 and not lunch_private.is_meal_day(p_date) then raise exception '이날은 점심 운영을 하지 않아요.'; end if;
  select id into uid from profiles where lower(name) = lower(nm) and status = 'active' order by created_at limit 1;
  if uid is not null then
    return lunch.admin_set_count(p_date, uid, p_count);
  end if;
  delete from guest_entries where date = p_date and lower(name) = lower(nm);
  if p_count > 0 then insert into guest_entries (date, host_id, count, name) values (p_date, a.id, p_count, nm); end if;
  perform lunch_private.audit(a.id, 'admin.set_named', jsonb_build_object('date', p_date, 'name', nm, 'count', p_count));
  return lunch_private.day_view(p_date, a.id);
end;
$$;
grant execute on function lunch.admin_set_named(date, text, int) to authenticated;

-- 내 인원·사람별 삭제는 이름 붙은 인원을 건드리지 않는다
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
  delete from guest_entries where date = p_date and host_id = u.id and name is null;
  if guests > 0 then insert into guest_entries (date, host_id, count) values (p_date, u.id, guests); end if;
  perform lunch_private.audit(u.id, 'set_count', jsonb_build_object('date', p_date, 'count', p_count));
  return lunch_private.day_view(p_date, u.id);
end;
$$;

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
  delete from guest_entries where date = p_date and host_id = u.id and name is null;
  if guests > 0 then insert into guest_entries (date, host_id, count) values (p_date, u.id, guests); end if;
  perform lunch_private.audit(a.id, 'admin.set_count', jsonb_build_object('date', p_date, 'user', p_user, 'count', p_count));
  return lunch_private.day_view(p_date, a.id);
end;
$$;

create or replace function lunch.admin_remove_person(p_date date, p_user uuid) returns void
language plpgsql security definer set search_path = lunch as $$
declare a profiles := lunch_private.require_admin();
begin
  delete from signups where date = p_date and user_id = p_user;
  delete from guest_entries where date = p_date and host_id = p_user and name is null;
  perform lunch_private.audit(a.id, 'admin.remove', jsonb_build_object('date', p_date, 'user', p_user));
end;
$$;

create or replace function lunch_private.day_view(d date, uid uuid) returns jsonb
language sql stable security definer set search_path = lunch as $$
  select jsonb_build_object(
    'date', d,
    'mealDay', lunch_private.is_meal_day(d),
    'note', (select note from day_overrides where date = d),
    'phase', lunch_private.phase_of(d),
    'deadline', lunch_private.deadline_of(d),
    'deadlineAt', to_char(lunch_private.deadline_at(d), 'YYYY-MM-DD HH24:MI'),
    'members', (select count(*) from signups where date = d),
    'guests', lunch_private.guest_count(d),
    'total', (select count(*) from signups where date = d) + lunch_private.guest_count(d),
    'mine', (select jsonb_build_object('guests', guests) from signups where date = d and user_id = uid),
    'myGuests', (select coalesce(sum(count), 0) from guest_entries where date = d and host_id = uid and name is null),
    'menu', (select jsonb_build_object('title', title, 'description', description) from menus where date = d)
  );
$$;

create or replace function lunch.get_day(p_date date) returns jsonb
language plpgsql stable security definer set search_path = lunch as $$
declare u profiles := lunch_private.require_user();
begin
  return lunch_private.day_view(p_date, u.id) || jsonb_build_object(
    'roster', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'guests', s.guests,
        'attended', a.user_id is not null) order by p.name)
      from signups s join profiles p on p.id = s.user_id
      left join attendance a on a.user_id = s.user_id and a.date = s.date
      where s.date = p_date), '[]'::jsonb),
    'guestEntries', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'count', g.count, 'note', g.note, 'name', g.name, 'hostId', g.host_id, 'host', p.name) order by g.id)
      from guest_entries g join profiles p on p.id = g.host_id where g.date = p_date), '[]'::jsonb),
    'attendanceClosed', lunch_private.attendance_closed(p_date),
    'canSelfCheck', lunch_private.phase_of(p_date) = 'today' and not lunch_private.attendance_closed(p_date)
  );
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
      select x.date, x.uid, x.gname, sum(x.n)::int as n from (
        select date, user_id as uid, null::text as gname, 1 as n from signups where date between first and last
        union all
        select date, host_id, name, count from guest_entries where date between first and last
      ) x
      where lunch_private.is_meal_day(x.date)
      group by x.date, x.uid, x.gname
    )
    select jsonb_build_object(
      'month', to_char(first, 'YYYY-MM'),
      'today', lunch_private.kst_today(),
      'days', coalesce((
        select jsonb_agg(jsonb_build_object('date', d.date, 'total', d.total, 'people', d.people) order by d.date)
        from (select per.date, sum(per.n)::int as total,
                     jsonb_agg(jsonb_build_object('id', case when per.gname is null then p.id end, 'name', coalesce(per.gname, p.name),
                       'named', per.gname is not null, 'count', per.n) order by coalesce(per.gname, p.name)) as people
              from per join profiles p on p.id = per.uid group by per.date) d), '[]'::jsonb),
      'totals', coalesce((
        select jsonb_agg(jsonb_build_object('name', t.name, 'count', t.n) order by t.name)
        from (select coalesce(per.gname, p.name) as name, sum(per.n)::int as n from per join profiles p on p.id = per.uid
              group by coalesce(per.gname, p.name)) t), '[]'::jsonb),
      'total', coalesce((select sum(n) from per), 0)
    )
  );
end;
$$;
