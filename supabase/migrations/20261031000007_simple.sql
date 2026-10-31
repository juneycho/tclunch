-- 2026-10-31 더 단순하게: 노쇼·출석 없음, 신청 횟수만 센다. 요리사도 휴일 지정. 목·금 오전 마감 알림.
-- 여러 번 실행해도 괜찮다.

-- ---------- 예산: 1인 1식 평균은 (휴일이 아닌 날의) 신청 인원으로 ----------
create or replace function lunch_private.budget_summary() returns jsonb
language sql stable security definer set search_path = lunch as $$
  with b as (
    select * from budgets where start_date <= lunch_private.kst_today() and end_date >= lunch_private.kst_today()
    order by start_date desc limit 1
  ), x as (
    select b.*,
      (select coalesce(sum(amount), 0) from expenses e where e.date between b.start_date and b.end_date) as spent,
      (select count(*) from signups s where s.date between b.start_date and least(b.end_date, lunch_private.kst_today())
         and lunch_private.is_meal_day(s.date))
      + (select coalesce(sum(count), 0) from guest_entries g where g.date between b.start_date and least(b.end_date, lunch_private.kst_today())
         and lunch_private.is_meal_day(g.date)) as meals
    from b
  )
  select jsonb_build_object('id', id, 'startDate', start_date, 'endDate', end_date, 'note', note,
    'total', amount, 'spent', spent, 'remaining', amount - spent, 'meals', meals,
    'perMeal', case when meals > 0 then round(spent::numeric / meals) end)
  from x;
$$;

-- ---------- 신청내용: 월별 사람별 신청 횟수 (휴일로 바뀐 날은 빼고 센다) ----------
create or replace function lunch.monthly_summary(p_month text default null) returns jsonb
language plpgsql stable security definer set search_path = lunch as $$
declare
  u profiles := lunch_private.require_user();
  first date := coalesce(to_date(p_month || '-01', 'YYYY-MM-DD'), date_trunc('month', lunch_private.kst_today())::date);
  last date := (first + interval '1 month' - interval '1 day')::date;
begin
  return jsonb_build_object(
    'month', to_char(first, 'YYYY-MM'),
    'days', coalesce((select jsonb_agg(d::date order by d) from generate_series(first, last, interval '1 day') d
                      where lunch_private.is_meal_day(d::date)), '[]'::jsonb),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'cells', x.cells, 'meals', x.meals) order by p.name)
      from profiles p
      cross join lateral (
        select coalesce(jsonb_object_agg(s.date, 1), '{}'::jsonb) as cells, count(*) as meals
        from signups s
        where s.user_id = p.id and s.date between first and last and lunch_private.is_meal_day(s.date)
      ) x
      where x.meals > 0), '[]'::jsonb),
    'guests', coalesce((select jsonb_object_agg(date, c) from (
        select date, sum(count) c from guest_entries
        where date between first and last and lunch_private.is_meal_day(date) group by date) g), '{}'::jsonb)
  );
end;
$$;

-- ---------- 휴일 지정: 요리사도 할 수 있다 ----------
create or replace function lunch.admin_set_day(p_date date, p_closed boolean, p_note text default null, p_reset boolean default false) returns void
language plpgsql security definer set search_path = lunch as $$
declare a profiles := lunch_private.require_cook();
begin
  if p_reset then delete from day_overrides where date = p_date;
  else
    insert into day_overrides (date, closed, note) values (p_date, p_closed, left(nullif(trim(p_note), ''), 30))
    on conflict (date) do update set closed = excluded.closed, note = excluded.note;
  end if;
  perform lunch_private.audit(a.id, 'day.override', jsonb_build_object('date', p_date, 'closed', p_closed, 'note', p_note, 'reset', p_reset));
end;
$$;

-- ---------- 자동 알림 ----------
-- 1) 마감 전날(목) 오전, 마감일(금) 오전: 모든 직원에게 다음 주 신청 마감 알림
-- 2) 인원 확정 → 요리사에게 메뉴 등록 요청
-- (노쇼 알림은 없앴다)
create or replace function lunch_private.run_jobs() returns void
language plpgsql security definer set search_path = lunch as $$
declare
  today date := lunch_private.kst_today();
  dlw int := lunch_private.setting_int('deadline_weekday');
  dow int := extract(isodow from today)::int;
  next_mon date; d date; u record; hc record;
begin
  if dow in (dlw - 1, dlw) and lunch_private.kst_hour() >= lunch_private.setting_int('reminder_hour')
     and lunch_private.kst_hour() < lunch_private.setting_int('deadline_hour') then
    next_mon := today + (8 - dow);
    if exists (select 1 from generate_series(next_mon, next_mon + 6, interval '1 day') g where lunch_private.is_meal_day(g::date)) then
      for u in select p.id from profiles p where p.status = 'active' and p.is_member loop
        perform lunch_private.notify_k(u.id, 'remind:' || today || ':' || u.id, 'remind',
          jsonb_build_object('week', next_mon, 'hour', lunch_private.setting_int('deadline_hour'), 'today', dow = dlw),
          case when dow = dlw then '오늘 ' else '내일 ' end || lunch_private.setting_int('deadline_hour') || '시, 다음 주 점심 신청이 마감돼요',
          '드실 날을 골라 신청해 주세요.');
      end loop;
    end if;
  end if;

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

-- ---------- 휴대폰 알림 시험: 나에게 알림 하나 보내기 ----------
create or replace function lunch.send_test_notification() returns void
language plpgsql security definer set search_path = lunch as $$
declare u profiles := lunch_private.require_user();
begin
  insert into notifications (user_id, dedupe_key, title, body, kind, params)
  values (u.id, 'test:' || u.id || ':' || extract(epoch from clock_timestamp()), 'Thanh Cong Lunch 알림 시험',
          '이 알림이 보이면 휴대폰 알림이 잘 되는 거예요.', 'test', '{}'::jsonb);
end;
$$;

-- 서버 알림(푸시) 준비 상태: 공개키·주소가 저장돼 있는지만 알려 준다 (값은 알려 주지 않음)
create or replace function lunch.push_status() returns jsonb
language sql stable security definer set search_path = lunch, lunch_private as $$
  select jsonb_build_object(
    'serverReady', exists (select 1 from lunch_private.secrets where key = 'vapid_public')
                   and exists (select 1 from lunch_private.secrets where key = 'project_url'),
    'myDevices', (select count(*) from push_subs where user_id = auth.uid()));
$$;

update lunch.settings set value = '9' where key = 'reminder_hour' and value::int >= 17;

revoke execute on all functions in schema lunch_private from public, anon, authenticated;
revoke execute on all functions in schema lunch from public, anon;
grant execute on all functions in schema lunch to authenticated;
grant execute on function lunch.login_lookup(text) to anon;
do $$ begin
  revoke execute on function lunch.svc_get_secret(text), lunch.svc_set_secret(text, text),
    lunch.svc_take_push_batch(), lunch.svc_delete_push_sub(text) from authenticated;
exception when undefined_function then null; end $$;
