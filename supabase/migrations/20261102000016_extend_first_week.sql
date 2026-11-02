-- 2026-11-02 첫 주라 한 번 더 연장: 11/2 주 신청을 11/2(월) 10:00까지 받는다 (오늘 점심 포함). 여러 번 실행해도 괜찮다.
insert into lunch.settings (key, value) values ('deadline_overrides', '2026-11-02=2026-11-02 10:00')
on conflict (key) do update set value = excluded.value;

-- 마감 전이면 오늘도 신청 가능 (평소에는 오늘의 마감이 지난 금요일이라 달라지는 것 없음)
create or replace function lunch_private.phase_of(d date) returns text
language sql stable as $$
  select case
    when d < lunch_private.kst_today() then 'past'
    when lunch_private.local_now() < lunch_private.deadline_at(d) then 'open'
    when d = lunch_private.kst_today() then 'today'
    else 'confirmed' end;
$$;
