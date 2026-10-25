// 휴대폰 푸시 알림 발송.
// GET  ?key   → 브라우저가 구독할 때 쓰는 공개키 (처음 한 번 키를 만들어 DB에 저장)
// POST        → pg_cron이 1분마다 호출. x-cron-secret 이 DB 값과 같아야 한다.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';
import { cors, json } from '../_shared/login.ts';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});
const secret = async (k: string) => (await sb.rpc('svc_get_secret', { k })).data as string | null;

async function vapid() {
  let pub = await secret('vapid_public');
  let priv = await secret('vapid_private');
  if (!pub || !priv) {
    const keys = webpush.generateVAPIDKeys();
    await sb.rpc('svc_set_secret', { k: 'vapid_public', v: keys.publicKey });
    await sb.rpc('svc_set_secret', { k: 'vapid_private', v: keys.privateKey });
    pub = keys.publicKey;
    priv = keys.privateKey;
  }
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com', pub, priv);
  return pub;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method === 'GET') return json({ key: await vapid() });

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
});
