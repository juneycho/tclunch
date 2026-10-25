// 휴대폰 푸시 알림 발송 (Supabase Edge Function, 대시보드 편집기에 그대로 붙여넣어도 된다)
// GET  ?key → 브라우저가 구독할 때 쓰는 공개키. 처음 한 번 키를 만들어 DB에 저장한다.
// POST      → pg_cron이 1분마다 호출. x-cron-secret 헤더가 DB 값과 같아야 한다.
// 설정: 대시보드에서 이 함수의 "Verify JWT"를 끈다.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const sb = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const secret = async (k: string) => (await sb.rpc('svc_get_secret', { k })).data as string | null;
const setSecret = (k: string, v: string) => sb.rpc('svc_set_secret', { k, v });

async function vapid() {
  let pub = await secret('vapid_public');
  let priv = await secret('vapid_private');
  if (!pub || !priv) {
    const keys = webpush.generateVAPIDKeys();
    await setSecret('vapid_public', keys.publicKey);
    await setSecret('vapid_private', keys.privateKey);
    pub = keys.publicKey;
    priv = keys.privateKey;
  }
  webpush.setVapidDetails('mailto:tclunch@example.com', pub, priv);
  return pub;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    if (req.method === 'GET') {
      // pg_cron이 이 함수를 부를 주소를 기억해 둔다
      if ((await secret('project_url')) !== SUPABASE_URL) await setSecret('project_url', SUPABASE_URL);
      return json({ key: await vapid() });
    }
    const cronSecret = await secret('cron_secret');
    if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) return json({ error: 'forbidden' }, 403);
    await vapid();
    const { data: batch, error } = await sb.rpc('svc_take_push_batch');
    if (error) return json({ error: error.message }, 500);
    let sent = 0;
    for (const n of batch as { title: string; body: string | null; subs: webpush.PushSubscription[] }[]) {
      for (const sub of n.subs) {
        try {
          await webpush.sendNotification(sub, JSON.stringify({ title: n.title, body: n.body }));
          sent++;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await sb.rpc('svc_delete_push_sub', { p_endpoint: sub.endpoint });
        }
      }
    }
    return json({ sent });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
