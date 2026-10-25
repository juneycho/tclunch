// 관리자 전용: 직원 계정 직접 만들기, 비밀번호 초기화 (service_role 키가 필요한 작업)
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { cors, json, toEmail } from '../_shared/login.ts';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

function tempPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => chars[b % chars.length]).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
    const { data: { user } } = await sb.auth.getUser(jwt);
    if (!user) return json({ error: '로그인이 필요해요.' }, 401);
    const { data: me } = await sb.from('profiles').select('*').eq('id', user.id).single();
    if (!me || me.status !== 'active' || !me.is_admin) return json({ error: '관리자만 할 수 있어요.' }, 403);

    const body = await req.json();
    if (body.action === 'create') {
      const loginId = String(body.loginId || '').toLowerCase();
      if (!/^[a-z0-9._-]{3,30}$/.test(loginId)) return json({ error: '아이디는 영문 소문자/숫자 3~30자예요.' }, 400);
      const name = String(body.name || '').trim();
      if (!name) return json({ error: '이름을 입력해 주세요.' }, 400);
      const { data: dup } = await sb.from('profiles').select('id').eq('login_id', loginId).maybeSingle();
      if (dup) return json({ error: '이미 있는 아이디예요.' }, 409);
      const { data: token } = await sb.rpc('svc_get_secret', { k: 'admin_token' });
      const password = tempPassword();
      const { error } = await sb.auth.admin.createUser({
        email: toEmail(loginId), password, email_confirm: true,
        user_metadata: { login_id: loginId, name, admin_token: token, is_cook: !!body.isCook, is_member: body.isMember !== false },
      });
      if (error) return json({ error: `계정을 만들지 못했어요: ${error.message}` }, 400);
      await sb.from('audit_log').insert({ actor_id: me.id, action: 'user.create', detail: { loginId } });
      return json({ tempPassword: password });
    }
    if (body.action === 'reset') {
      const password = tempPassword();
      const { error } = await sb.auth.admin.updateUserById(body.userId, { password });
      if (error) return json({ error: error.message }, 400);
      await sb.from('profiles').update({ must_change_pw: true }).eq('id', body.userId);
      await sb.from('audit_log').insert({ actor_id: me.id, action: 'user.reset_password', detail: { id: body.userId } });
      return json({ tempPassword: password });
    }
    return json({ error: '알 수 없는 요청이에요.' }, 400);
  } catch (e) {
    return json({ error: String(e?.message || e) }, 500);
  }
});
