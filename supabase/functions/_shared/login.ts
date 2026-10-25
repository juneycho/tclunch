// 아이디로 로그인하기 위해 Supabase Auth 이메일 자리에 가짜 주소를 쓴다. (메일은 보내지 않음)
// 프런트엔드 web/src/supabase.js 의 EMAIL_DOMAIN 과 같아야 한다.
export const EMAIL_DOMAIN = 'tclunch.example.com';
export const toEmail = (loginId: string) => `${loginId.toLowerCase()}@${EMAIL_DOMAIN}`;

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
