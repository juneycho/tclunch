import { supabase, SUPABASE_URL, toEmail } from './supabase.js';
import { translate, translateServer } from './i18n.js';

// 화면 코드는 예전 REST 경로 그대로 api('/경로')를 부르고, 여기서 Supabase 호출로 바꾼다.
// 실제 규칙(마감, 본인만 신청, 권한)은 전부 DB 함수(supabase/migrations)에 있다.
// 오류 문구는 고른 언어로 보여 준다 (App이 언어를 바꿀 때 setApiLang을 부른다)
let lang = 'ko';
export const setApiLang = (l) => { lang = l; };
const AUTH_ERRORS = {
  'Invalid login credentials': 'errWrongLogin',
  'Database error saving new user': 'errRegister',
  'User already registered': 'errRegister',
};
const VN_OFFSET = 7 * 3600e3; // 베트남 시간 (UTC+7)
const vnTime = (ts) => new Date(ts).toLocaleString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });

// 관리자 비밀번호: Supabase는 최소 6자라서, 4~5자리 숫자는 뒤에 고정 문자를 붙여 저장한다 (가입·로그인·변경 모두 같은 규칙)
const padPw = (pw) => (pw.length < 6 ? `${pw}#tclunch` : pw);
// 직원 계정의 비밀번호는 이름(내부 아이디)으로 정해지는 고정 값이다. DB의 lunch_private.set_name_password 와 같아야 한다.
const namePw = (loginId) => `tclunch:${loginId}`;
// 이름을 내부 아이디로: UTF-8 바이트를 16진수로 ('김' → 'ueab980-…')
// 뒤에 무작위 글자를 붙여서, 이름을 바꾼 사람의 예전 이름으로 새로 들어와도 겹치지 않게 한다 (최대 64자)
const nameToLoginId = (name) => `u${Array.from(new TextEncoder().encode(name), (x) => x.toString(16).padStart(2, '0')).join('').slice(0, 50)}-${Math.random().toString(36).slice(2, 8)}`;

const fail = (message, status = 400) => { const e = new Error(translateServer(message, lang)); e.status = status; throw e; };
const failKey = (key, status) => fail(translate(lang, key), status);
const unwrap = ({ data, error }) => {
  if (error) AUTH_ERRORS[error.message] ? failKey(AUTH_ERRORS[error.message], error.status || 400) : fail(error.message, error.status || 400);
  return data;
};
const rpc = async (fn, args) => unwrap(await supabase.rpc(fn, args));

const routes = [
  // 인증
  ['POST', /^\/auth\/enter$/, async (_, b) => {
    const name = String(b.name || '').trim();
    if (!name || name.length > 10) failKey('errNameLen');
    const found = await rpc('login_lookup', { p_name: name });
    if (found?.admin) {
      if (!b.password) return { needPassword: true };
      const r = await supabase.auth.signInWithPassword({ email: toEmail(found.loginId), password: padPw(b.password) });
      if (r.error) r.error.message === 'Invalid login credentials' ? failKey('errWrongAdminPw') : fail(r.error.message);
    } else if (found) {
      unwrap(await supabase.auth.signInWithPassword({ email: toEmail(found.loginId), password: namePw(found.loginId) }));
    } else {
      const loginId = nameToLoginId(name);
      unwrap(await supabase.auth.signUp({
        email: toEmail(loginId), password: namePw(loginId),
        options: { data: { app: 'tc-lunch', login_id: loginId, name } },
      }));
    }
    const user = await rpc('get_me');
    if (!user || user.status !== 'active') {
      await supabase.auth.signOut();
      failKey('errUnavailable', 403);
    }
    return { user };
  }],
  ['GET', /^\/notice$/, async () => ({ text: await rpc('login_notice') })],
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
    // 현재 비밀번호를 비워 두면 이름으로 정해진 비밀번호로 확인한다 (막 관리자가 된 첫 사용자)
    const me = await rpc('get_me');
    const current = b.current ? padPw(b.current) : namePw(me.loginId);
    const login = await supabase.auth.signInWithPassword({ email: data.user.email, password: current });
    if (login.error) failKey('errCurrentPw');
    if (!b.next || b.next.length < 4) failKey('errNewPwLen');
    unwrap(await supabase.auth.updateUser({ password: padPw(b.next) }));
    await rpc('clear_must_change_pw');
    return { ok: true };
  }],

  // 달력/신청/출석/메뉴
  ['GET', /^\/calendar$/, (q) => rpc('get_calendar', { p_month: q.get('month') || null })],
  ['GET', /^\/days\/([\d-]+)$/, (q, b, [d]) => rpc('get_day', { p_date: d })],
  // 내 신청은 언제나 나 1명. 손님은 아래 guests 로 따로 추가한다
  ['PUT', /^\/days\/([\d-]+)\/signup$/, (q, b, [d]) => rpc('signup_upsert', { p_date: d })],
  ['POST', /^\/days\/([\d-]+)\/guests$/, (q, b, [d]) => rpc('add_guests', { p_date: d, p_count: b.count, p_note: b.note || null })],
  ['POST', /^\/days\/([\d-]+)\/tap$/, (q, b, [d]) => rpc('tap_day', { p_date: d })],
  ['POST', /^\/days\/([\d-]+)\/untap$/, (q, b, [d]) => rpc('untap_day', { p_date: d })],
  ['GET', /^\/history$/, (q) => rpc('history_list', { p_month: q.get('month') || null })],
  ['DELETE', /^\/days\/([\d-]+)\/guests\/one$/, (q, b, [d]) => rpc('remove_guest', { p_date: d })],
  ['DELETE', /^\/guests\/(\d+)$/, (q, b, [id]) => rpc('delete_guests', { p_id: Number(id) })],
  ['DELETE', /^\/days\/([\d-]+)\/signup$/, (q, b, [d]) => rpc('signup_cancel', { p_date: d })],
  ['POST', /^\/days\/([\d-]+)\/attendance$/, (q, b, [d]) => rpc('self_check', { p_date: d })],
  ['PUT', /^\/days\/([\d-]+)\/attendance\/([\w-]+)$/, (q, b, [d, u]) => rpc('set_attendance', { p_date: d, p_user: u, p_attended: !!b.attended })],
  ['PUT', /^\/days\/([\d-]+)\/menu$/, (q, b, [d]) => rpc('set_menu', { p_date: d, p_title: b.title, p_description: b.description || null })],
  ['DELETE', /^\/days\/([\d-]+)\/menu$/, (q, b, [d]) => rpc('delete_menu', { p_date: d })],
  ['GET', /^\/sheet$/, (q) => rpc('cook_sheet', { p_from: q.get('from') || null, p_days: Number(q.get('days') || 14) })],
  ['GET', /^\/monthly$/, (q) => rpc('monthly_summary', { p_month: q.get('month') || null })],

  // 지출
  ['GET', /^\/expenses$/, async () => {
    const from = new Date(Date.now() + VN_OFFSET - 60 * 864e5).toISOString().slice(0, 10);
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
    const rows = unwrap(await supabase.from('notifications').select('id, title, body, kind, params, created_at, read_at')
      .order('id', { ascending: false }).limit(50));
    return { notifications: rows.map((n) => ({ id: n.id, title: n.title, body: n.body, kind: n.kind, params: n.params,
      read: !!n.read_at, createdAt: vnTime(n.created_at) })) };
  }],
  ['POST', /^\/notifications\/read$/, () => rpc('mark_notifications_read')],
  ['GET', /^\/push\/key$/, async () => (await fetch(`${SUPABASE_URL}/functions/v1/push-dispatch?key=1`)).json()],
  ['POST', /^\/push\/test$/, () => rpc('send_test_notification')],
  ['GET', /^\/push\/status$/, () => rpc('push_status')],
  ['POST', /^\/push\/subscribe$/, (q, b) => rpc('save_push_sub', { p_endpoint: b.endpoint, p_p256dh: b.keys?.p256dh, p_auth: b.keys?.auth })],

  // 관리자
  ['GET', /^\/admin\/users$/, async () => ({ users: await rpc('admin_users') })],
  ['PATCH', /^\/admin\/users\/([\w-]+)$/, (q, b, [id]) => rpc('admin_update_user', { p_id: id, p: b })],
  ['POST', /^\/admin\/users\/([\w-]+)\/reset-password$/, async (q, b, [id]) => ({ tempPassword: await rpc('admin_reset_password', { p_id: id }) })],
  ['PUT', /^\/admin\/days\/([\d-]+)\/signup\/([\w-]+)$/, (q, b, [d, u]) =>
    rpc('admin_signup_override', { p_date: d, p_user: u, p_guests: b.guests ?? 0, p_remove: !!b.remove })],
  ['PUT', /^\/admin\/days\/([\d-]+)$/, (q, b, [d]) =>
    rpc('admin_set_day', { p_date: d, p_closed: !!b.closed, p_note: b.note || null, p_reset: !!b.reset })],
  ['PUT', /^\/admin\/notice$/, (q, b) => rpc('admin_save_notice', { p_text: b.text || '' })],
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
      createdAt: vnTime(r.created_at), actor: r.profiles?.name })) };
  }],
];

export async function api(path, { method = 'GET', body } = {}) {
  if (!supabase) failKey('errNoConfig', 500);
  const [p, qs] = path.split('?');
  for (const [m, re, handler] of routes) {
    const match = m === method && p.match(re);
    if (match) return (await handler(new URLSearchParams(qs), body || {}, match.slice(1))) ?? { ok: true };
  }
  failKey('errNotFound', 404);
}

// 베트남 기준 오늘 날짜 (YYYY-MM-DD)
export const vnToday = () => new Date(Date.now() + VN_OFFSET).toISOString().slice(0, 10);
export function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
// 그 주의 월요일
export function mondayOf(date) {
  const wd = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((wd + 6) % 7));
}
