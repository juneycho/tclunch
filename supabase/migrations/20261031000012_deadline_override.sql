-- 2026-10-31 주별 마감 예외: settings.deadline_overrides = '그 주 월요일=마감 일시, …'
-- 처음 한 번만: 11/2 주 신청을 10/31(토) 22:00까지 받는다. 여러 번 실행해도 괜찮다.
insert into lunch.settings (key, value) values ('deadline_overrides', '2026-11-02=2026-10-31 22:00')
on conflict (key) do update set value = excluded.value;

create or replace function lunch_private.deadline_at(d date) returns timestamp
language plpgsql stable security definer set search_path = lunch as $$
declare
  mon date := d - (extract(isodow from d)::int - 1);
  item text;
begin
  foreach item in array string_to_array(coalesce((select value from settings where key = 'deadline_overrides'), ''), ',') loop
    if split_part(trim(item), '=', 1) = mon::text then
      return split_part(trim(item), '=', 2)::timestamp;
    end if;
  end loop;
  return (mon - 7 + (lunch_private.setting_int('deadline_weekday') - 1))::timestamp
    + make_interval(hours => lunch_private.setting_int('deadline_hour'));
end;
$$;

-- 날짜 정보에 마감 일시(시:분)도 넣는다
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
    'myGuests', (select coalesce(sum(count), 0) from guest_entries where date = d and host_id = uid),
    'menu', (select jsonb_build_object('title', title, 'description', description) from menus where date = d)
  );
$$;

revoke execute on all functions in schema lunch_private from public, anon, authenticated;
