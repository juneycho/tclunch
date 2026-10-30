-- TC 점심: 주기 작업(pg_cron)과 휴대폰 푸시 발송(pg_net → Edge Function)
-- 로컬 테스트에서는 이 파일을 건너뛴다.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Edge Function(service_role)만 쓰는 함수들
create or replace function lunch.svc_get_secret(k text) returns text
language sql stable security definer set search_path = lunch_private as $$
  select value from lunch_private.secrets where key = k;
$$;

create or replace function lunch.svc_set_secret(k text, v text) returns void
language sql security definer set search_path = lunch_private as $$
  insert into lunch_private.secrets (key, value) values (k, v) on conflict (key) do update set value = excluded.value;
$$;

-- 아직 안 보낸 알림을 가져가면서 보낸 것으로 표시한다
create or replace function lunch.svc_take_push_batch() returns jsonb
language plpgsql security definer set search_path = lunch as $$
declare out jsonb;
begin
  with batch as (
    update notifications set pushed_at = now()
    where id in (select id from notifications where pushed_at is null order by id limit 200 for update skip locked)
    returning id, user_id, title, body, created_at
  )
  select coalesce(jsonb_agg(jsonb_build_object('title', b.title, 'body', b.body,
    'subs', (select coalesce(jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'keys',
      jsonb_build_object('p256dh', s.p256dh, 'auth', s.auth))), '[]'::jsonb) from push_subs s where s.user_id = b.user_id))), '[]'::jsonb)
  into out
  from batch b where b.created_at > now() - interval '1 day';   -- 오래된 알림은 푸시하지 않고 넘긴다
  return out;
end;
$$;

create or replace function lunch.svc_delete_push_sub(p_endpoint text) returns void
language sql security definer set search_path = lunch as $$
  delete from push_subs where endpoint = p_endpoint;
$$;

revoke execute on function lunch.svc_get_secret(text), lunch.svc_set_secret(text, text),
  lunch.svc_take_push_batch(), lunch.svc_delete_push_sub(text) from public, anon, authenticated;
grant execute on function lunch.svc_get_secret(text), lunch.svc_set_secret(text, text),
  lunch.svc_take_push_batch(), lunch.svc_delete_push_sub(text) to service_role;

-- 보낼 알림이 있으면 push-dispatch 함수를 깨운다 (project_url은 배포 워크플로가 넣는다)
create or replace function lunch_private.dispatch_push() returns void
language plpgsql security definer set search_path = lunch, lunch_private as $$
declare url text := (select value from lunch_private.secrets where key = 'project_url');
begin
  if url is null or not exists (select 1 from notifications where pushed_at is null) then return; end if;
  perform net.http_post(
    url := url || '/functions/v1/push-dispatch',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-cron-secret', (select value from lunch_private.secrets where key = 'cron_secret')),
    body := '{}'::jsonb
  );
end;
$$;

select cron.schedule('tc-lunch-jobs', '*/5 * * * *', 'select lunch_private.run_jobs()');
select cron.schedule('tc-lunch-push', '* * * * *', 'select lunch_private.dispatch_push()');
