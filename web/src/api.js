import { supabase, SUPABASE_URL, toEmail } from './supabase.js';

// 화면 코드는 예전 REST 경로 그대로 api('/경로')를 부르고, 여기서 Supabase 호출로 바꾼다.
// 실제 규칙(마감, 본인만 신청, 권한)은 전부 DB 함수(supabase/migrations)에 있다.
const AUTH_ERRORS = {
  'Invalid login credentials': '아이디 또는 비밀번호가 틀렸어요.',
  'Database error saving new user': '등록하지 못했어요. 이름이 10자를 넘거나 이미 있는 이름인지 확인해 주세요.',
  'User already registered': '이미 있는 아이디예요.',
};

// Supabase는 비밀번호 최소 6자라서, 4~5자리 숫자는 뒤에 고정 문자를 붙여 저장한다 (가입·로그인·변경 모두 같은 규칙)
const padPw = (pw) => (pw.length < 6 ? `${pw}#tclunch` : pw);
// 이름을 내부 아이디로: UTF-8 바이트를 16진수로 ('김' → 'ueab980')
const nameToLoginId = (name) => `u${Array.from(new TextEncoder().encode(name), (x) => x.toString(16).padStart(2, '0')).join('')}`;

const fail = (message, status = 400) => { const e = new Error(message); e.status = status; throw e; };
const unwrap = ({ data, error }) => {
  if (error) fail(AUTH_ERRORS[error.message] || error.message, error.status || 400);
  return data;
};
const rpc = async (fn, args) => unwrap(await supabase.rpc(fn, args));

const routes = [
  // 인증
  ['POST', /^\/auth\/enter$/, async (_, b) => {
    const name = String(b.name || '').trim();
    if (!name || name.length > 10) fail('이름은 1~10자로 써 주세요.');
    if (!b.password || b.password.length < 4) fail('비밀번호는 4자리 이상이에요.');
    const password = padPw(b.password);
    const loginId = await rpc('login_lookup', { p_name: name });
    if (loginId) {
      const r = await supabase.auth.signInWithPassword({ email: toEmail(loginId), password });
      if (r.error) {
        fail(r.error.message === 'Invalid login credentials'
          ? `비밀번호가 틀렸어요. 처음 오셨는데 같은 이름이 이미 있다면 '${name}2'처럼 구분해서 써 주세요.`
          : r.error.message);
      }
    } else {
      unwrap(await supabase.auth.signUp({
        email: toEmail(nameToLoginId(name)), password,
        options: { data: { app: 'tc-lunch', login_id: nameToLoginId(name), name } },
      }));
    }
    const user = await rpc('get_me');
    if (!user || user.status !== 'active') {
      await supabase.auth.signOut();
      fail('사용할 수 없는 계정이에요. 관리자에게 물어봐 주세요.', 403);
    }
    return { user };
  }],
  ['POST', /^\/auth\/logout$/, async () => { await supabase.auth.signOut(); return { ok: true }; }],
  ['GET', /^\/me$/, async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return { user: null };
    const user = await rpc('get_me');
    if (!user || user.status !== 'active') { await supabase.auth.signOut(); return { user: null }; }
    return { user };
  }],
  ['POST', /^\/me\/password$/, async (_, b) => {
    const { data } = await supabase.auth.getUser();
    const login = await supabase.auth.signInWithPassword({ email: data.user.email, password: padPw(b.current || '') });
    if (login.error) fail('현재 비밀번호가 틀렸어요.');
    if (!b.next || b.next.length < 4) fail('새 비밀번호는 4자리 이상이에요.');
    unwrap(await supabase.auth.updateUser({ password: padPw(b.next) }));
    await rpc('clear_must_change_pw');
    return { ok: true };
  }],

  // 달력/신청/출석/메뉴
  ['GET', /^\/calendar$/, (q) => rpc('get_calendar', { p_month: q.get('month') || null })],
  ['GET', /^\/days\/([\d-]+)$/, (q, b, [d]) => rpc('get_day', { p_date: d })],
  ['PUT', /^\/days\/([\d-]+)\/signup$/, (q, b, [d]) => rpc('signup_upsert', { p_date: d, p_guests: b.guests ?? 0, p_guest_note: b.guestNote || null })],
  ['DELETE', /^\/days\/([\d-]+)\/signup$/, (q, b, [d]) => rpc('signup_cancel', { p_date: d })],
  ['POST', /^\/days\/([\d-]+)\/attendance$/, (q, b, [d]) => rpc('self_check', { p_date: d })],
  ['PUT', /^\/days\/([\d-]+)\/attendance\/([\w-]+)$/, (q, b, [d, u]) => rpc('set_attendance', { p_date: d, p_user: u, p_attended: !!b.attended })],
  ['PUT', /^\/days\/([\d-]+)\/menu$/, (q, b, [d]) => rpc('set_menu', { p_date: d, p_title: b.title, p_description: b.description || null })],
  ['DELETE', /^\/days\/([\d-]+)\/menu$/, (q, b, [d]) => rpc('delete_menu', { p_date: d })],
  ['GET', /^\/cook\/upcoming$/, () => rpc('cook_upcoming')],

  // 지출
  ['GET', /^\/expenses$/, async () => {
    const from = new Date(Date.now() + 9 * 3600e3 - 60 * 864e5).toISOString().slice(0, 10);
    const rows = unwrap(await supabase.from('expenses').select('id, date, amount, memo, profiles(name)')
      .gte('date', from).order('date', { ascending: false }).order('id', { ascending: false }));
    return { expenses: rows.map((r) => ({ ...r, createdBy: r.profiles?.name })) };
  }],
  ['POST', /^\/expenses$/, (q, b) => rpc('add_expense', { p_date: b.date, p_amount: b.amount, p_memo: b.memo || null })],
  ['DELETE', /^\/expenses\/(\d+)$/, (q, b, [id]) => rpc('delete_expense', { p_id: Number(id) })],

  // 요약/알림/푸시
  ['GET', /^\/summary$/, () => rpc('get_summary')],
  ['GET', /^\/my\/history$/, async () => ({ history: await rpc('get_my_history') })],
  ['GET', /^\/notifications$/, async () => {
    const rows = unwrap(await supabase.from('notifications').select('id, title, body, created_at, read_at')
      .order('id', { ascending: false }).limit(50));
    return { notifications: rows.map((n) => ({ id: n.id, title: n.title, body: n.body, read: !!n.read_at,
      createdAt: new Date(n.created_at).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }) })) };
  }],
  ['POST', /^\/notifications\/read$/, () => rpc('mark_notifications_read')],
  ['GET', /^\/push\/key$/, async () => (await fetch(`${SUPABASE_URL}/functions/v1/push-dispatch?key=1`)).json()],
  ['POST', /^\/push\/subscribe$/, (q, b) => rpc('save_push_sub', { p_endpoint: b.endpoint, p_p256dh: b.keys?.p256dh, p_auth: b.keys?.auth })],

  // 관리자
  ['GET', /^\/admin\/users$/, async () => ({ users: await rpc('admin_users') })],
  ['PATCH', /^\/admin\/users\/([\w-]+)$/, (q, b, [id]) => rpc('admin_update_user', { p_id: id, p: b })],
  ['POST', /^\/admin\/users\/([\w-]+)\/reset-password$/, async (q, b, [id]) => ({ tempPassword: await rpc('admin_reset_password', { p_id: id }) })],
  ['PUT', /^\/admin\/days\/([\d-]+)\/signup\/([\w-]+)$/, (q, b, [d, u]) =>
    rpc('admin_signup_override', { p_date: d, p_user: u, p_guests: b.guests ?? 0, p_remove: !!b.remove })],
  ['PUT', /^\/admin\/days\/([\d-]+)$/, (q, b, [d]) =>
    rpc('admin_set_day', { p_date: d, p_closed: !!b.closed, p_note: b.note || null, p_reset: !!b.reset })],
  ['GET', /^\/admin\/settings$/, () => rpc('admin_get_settings')],
  ['PUT', /^\/admin\/settings$/, (q, b) => rpc('admin_save_settings', { p: b })],
  ['GET', /^\/admin\/noshows$/, async () => ({ rows: await rpc('admin_noshows') })],
  ['GET', /^\/admin\/budgets$/, async () => ({
    budgets: unwrap(await supabase.from('budgets').select('id, startDate:start_date, endDate:end_date, amount, note')
      .order('start_date', { ascending: false })),
  })],
  ['POST', /^\/admin\/budgets$/, (q, b) =>
    rpc('admin_save_budget', { p_start: b.startDate, p_end: b.endDate, p_amount: b.amount, p_note: b.note || null, p_id: b.id || null })],
  ['DELETE', /^\/admin\/budgets\/(\d+)$/, (q, b, [id]) => rpc('admin_delete_budget', { p_id: Number(id) })],
  ['GET', /^\/admin\/audit$/, async () => {
    const rows = unwrap(await supabase.from('audit_log').select('id, action, detail, created_at, profiles(name)')
      .order('id', { ascending: false }).limit(200));
    return { rows: rows.map((r) => ({ id: r.id, action: r.action, detail: JSON.stringify(r.detail),
      createdAt: new Date(r.created_at).toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }), actor: r.profiles?.name })) };
  }],
];

export async function api(path, { method = 'GET', body } = {}) {
  if (!supabase) fail('Supabase 설정(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)이 없어요.', 500);
  const [p, qs] = path.split('?');
  for (const [m, re, handler] of routes) {
    const match = m === method && p.match(re);
    if (match) return (await handler(new URLSearchParams(qs), body || {}, match.slice(1))) ?? { ok: true };
  }
  fail(`없는 기능이에요: ${method} ${path}`, 404);
}

export const won = (n) => `${Number(n).toLocaleString('ko-KR')}원`;
const WD = '일월화수목금토';
export const weekdayOf = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();
export function fmtDay(date) {
  const [, m, d] = date.split('-');
  return `${Number(m)}/${Number(d)}(${WD[weekdayOf(date)]})`;
}
export const PHASE_LABEL = { open: '신청 가능', confirmed: '인원 확정', today: '오늘', past: '지난 날' };
export function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
