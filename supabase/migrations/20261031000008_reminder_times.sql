-- 2026-10-31 마감 알림: 목 17:40, 금 06:45, 금 15:00 (베트남 시간). 여러 번 실행해도 괜찮다.
-- 형식: 요일(1=월 … 7=일)-시:분, 쉼표로 구분
insert into lunch.settings (key, value) values ('reminder_times', '4-17:40,5-06:45,5-15:00')
on conflict (key) do update set value = excluded.value;

create or replace function lunch_private.run_jobs() returns void
language plpgsql security definer set search_path = lunch as $$
declare
  now_l timestamp := lunch_private.local_now();
  today date := now_l::date;
  dow int := extract(isodow from today)::int;
  dlw int := lunch_private.setting_int('deadline_weekday');
  slot text; slot_at timestamp; next_mon date; d date; u record; hc record;
begin
  -- 1) 정해진 시각에 모든 직원에게 다음 주 신청 마감 알림 (시각마다 한 번, 마감 전까지만)
  foreach slot in array string_to_array(coalesce((select value from settings where key = 'reminder_times'), ''), ',') loop
    slot := trim(slot);
    continue when slot !~ '^[1-7]-\d{1,2}:\d{2}$' or split_part(slot, '-', 1)::int <> dow;
    slot_at := today + split_part(slot, '-', 2)::time;
    -- 이번 알림이 가리키는 마감: 오늘이 마감 요일 이전이면 이번 주 마감, 아니면 다음 주 마감
    next_mon := today + (8 - dow);
    continue when now_l < slot_at or now_l >= slot_at + interval '2 hours' or now_l >= lunch_private.deadline_at(next_mon);
    continue when not exists (select 1 from generate_series(next_mon, next_mon + 6, interval '1 day') g where lunch_private.is_meal_day(g::date));
    for u in select p.id from profiles p where p.status = 'active' and p.is_member loop
      perform lunch_private.notify_k(u.id, 'remind:' || today || ':' || slot || ':' || u.id, 'remind',
        jsonb_build_object('week', next_mon, 'hour', lunch_private.setting_int('deadline_hour'), 'today', dow = dlw),
        case when dow = dlw then '오늘 ' else '내일 ' end || lunch_private.setting_int('deadline_hour') || '시, 다음 주 점심 신청이 마감돼요',
        '드실 날을 골라 신청해 주세요.');
    end loop;
  end loop;

  -- 2) 인원 확정 → 요리사에게 메뉴 등록 요청
  for i in 1..14 loop
    d := today + i;
    continue when lunch_private.phase_of(d) <> 'confirmed' or not lunch_private.is_meal_day(d);
    select (select count(*) from signups where date = d) as m, lunch_private.guest_count(d) as g into hc;
    for u in select id from profiles where status = 'active' and is_cook loop
      perform lunch_private.notify_k(u.id, 'confirmed:' || d || ':' || u.id, 'confirmed',
        jsonb_build_object('date', d, 'members', hc.m, 'guests', hc.g, 'total', hc.m + hc.g,
          'budget', (hc.m + hc.g) * lunch_private.setting_int('meal_price')),
        lunch_private.fmt_day(d) || ' 인원 확정: ' || (hc.m + hc.g) || '명',
        '1인 ' || lunch_private.setting_int('meal_price') || ' VND 기준으로 메뉴를 정해 주세요.');
    end loop;
  end loop;
end;
$$;
revoke execute on function lunch_private.run_jobs() from public, anon, authenticated;

-- 알림이 정해진 분에 맞게 가도록 자동 작업을 1분마다 돌린다 (pg_cron이 없는 테스트 DB에서는 건너뜀)
do $$ begin
  perform cron.schedule('tc-lunch-jobs', '* * * * *', 'select lunch_private.run_jobs()');
exception when undefined_function or invalid_schema_name then null; end $$;
