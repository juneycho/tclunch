import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import {
  COOKIE, checkPassword, clearFailures, createSession, destroySession, destroyUserSessions,
  hashPassword, publicUser, rateLimited, recordFailure, sessionUser, tempPassword, validPassword,
} from './auth.js';
import { DEFAULT_SETTINGS, getSettings, setSetting } from './db.js';
import {
  attendanceClosed, budgetSummary, dayInfo, deadlineOf, formatDay, headcount, noShowCounts, notify, phaseOf,
} from './logic.js';
import { addDays, isValidDate, kstParts, monthDays } from './time.js';

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };

export function createApp({ db, now = () => new Date(), push = null, vapidPublicKey = null, secureCookies = false }) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(express.json({ limit: '20kb' }));
  app.use(cookieParser());

  // 같은 사이트에서 온 요청만 상태를 바꿀 수 있게 (CSRF 방지): 프런트엔드는 항상 이 헤더를 붙인다.
  app.use('/api', (req, res, next) => {
    if (req.method !== 'GET' && req.get('X-Requested-With') !== 'tc-lunch') {
      return res.status(403).json({ error: '잘못된 요청이에요.' });
    }
    req.user = sessionUser(db, req.cookies[COOKIE]);
    next();
  });

  const wrap = (fn) => (req, res, next) => {
    try {
      const out = fn(req, res);
      if (out !== undefined && !res.headersSent) res.json(out);
    } catch (e) { next(e); }
  };
  const auth = (req) => req.user || fail(401, '로그인이 필요해요.');
  const admin = (req) => (auth(req).is_admin ? req.user : fail(403, '관리자만 할 수 있어요.'));
  const cookOrAdmin = (req) => (auth(req).is_cook || req.user.is_admin ? req.user : fail(403, '요리사나 관리자만 할 수 있어요.'));
  const dateParam = (req) => (isValidDate(req.params.date) ? req.params.date : fail(400, '날짜 형식이 잘못됐어요.'));
  const intIn = (v, min, max, label) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) fail(400, `${label}은(는) ${min}~${max} 사이 숫자여야 해요.`);
    return n;
  };
  const text = (v, max, label, required = false) => {
    if (v == null || v === '') return required ? fail(400, `${label}을(를) 입력해 주세요.`) : null;
    if (typeof v !== 'string' || v.length > max) fail(400, `${label}이(가) 너무 길어요.`);
    return v.trim();
  };
  const audit = (actor, action, detail) =>
    db.prepare('INSERT INTO audit_log (actor_id, action, detail) VALUES (?, ?, ?)').run(actor.id, action, JSON.stringify(detail));

  const setCookie = (res, token) => res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: secureCookies, maxAge: 30 * 864e5, path: '/',
  });

  // ---------- 인증 ----------
  app.post('/api/auth/register', wrap((req) => {
    const s = getSettings(db);
    const { inviteCode, loginId, name, password } = req.body || {};
    if (!s.invite_code || inviteCode !== s.invite_code) fail(400, '초대 코드가 맞지 않아요. 관리자에게 물어봐 주세요.');
    if (typeof loginId !== 'string' || !/^[a-zA-Z0-9._-]{3,30}$/.test(loginId)) fail(400, '아이디는 영문/숫자 3~30자로 만들어 주세요.');
    const nm = text(name, 30, '이름', true);
    if (!validPassword(password)) fail(400, '비밀번호는 8자 이상이어야 해요.');
    if (db.prepare('SELECT 1 FROM users WHERE login_id = ?').get(loginId)) fail(409, '이미 있는 아이디예요.');
    db.prepare('INSERT INTO users (login_id, name, password_hash, status) VALUES (?, ?, ?, ?)')
      .run(loginId, nm, hashPassword(password), 'pending');
    for (const a of db.prepare("SELECT id FROM users WHERE is_admin = 1 AND status = 'active'").all()) {
      notify(db, push, a.id, { key: `pending:${loginId}:${a.id}`, title: `${nm}님이 가입 승인을 기다려요`, body: '관리자 > 직원 관리에서 승인해 주세요.' });
    }
    return { ok: true, message: '가입 신청 완료! 관리자가 승인하면 로그인할 수 있어요.' };
  }));

  app.post('/api/auth/login', wrap((req, res) => {
    const { loginId, password } = req.body || {};
    const key = `${req.ip}:${String(loginId).toLowerCase()}`;
    if (rateLimited(key)) fail(429, '로그인 시도가 너무 많아요. 15분 뒤에 다시 해 주세요.');
    const u = typeof loginId === 'string' && db.prepare('SELECT * FROM users WHERE login_id = ?').get(loginId);
    if (!u || typeof password !== 'string' || !checkPassword(password, u.password_hash)) {
      recordFailure(key);
      fail(401, '아이디 또는 비밀번호가 틀렸어요.');
    }
    if (u.status === 'pending') fail(403, '아직 관리자 승인 전이에요.');
    if (u.status !== 'active') fail(403, '비활성화된 계정이에요.');
    clearFailures(key);
    setCookie(res, createSession(db, u.id));
    return { user: publicUser(u) };
  }));

  app.post('/api/auth/logout', wrap((req, res) => {
    destroySession(db, req.cookies[COOKIE]);
    res.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  }));

  app.get('/api/me', wrap((req) => ({ user: req.user ? publicUser(req.user) : null })));

  app.post('/api/me/password', wrap((req, res) => {
    const u = auth(req);
    const { current, next } = req.body || {};
    if (!checkPassword(String(current), u.password_hash)) fail(400, '현재 비밀번호가 틀렸어요.');
    if (!validPassword(next)) fail(400, '새 비밀번호는 8자 이상이어야 해요.');
    db.prepare('UPDATE users SET password_hash = ?, must_change_pw = 0 WHERE id = ?').run(hashPassword(next), u.id);
    destroyUserSessions(db, u.id);
    setCookie(res, createSession(db, u.id));
    return { ok: true };
  }));

  // ---------- 달력 ----------
  const dayView = (date, user, s) => {
    const info = dayInfo(db, date);
    const hc = headcount(db, date);
    const mine = db.prepare('SELECT guests, guest_note FROM signups WHERE user_id = ? AND date = ?').get(user.id, date);
    const menu = db.prepare('SELECT title, description FROM menus WHERE date = ?').get(date);
    return {
      date, mealDay: info.mealDay, note: info.note,
      phase: phaseOf(date, s, now()), deadline: deadlineOf(date, s),
      ...hc, mine: mine ? { guests: mine.guests, guestNote: mine.guest_note } : null,
      menu: menu || null,
    };
  };

  app.get('/api/calendar', wrap((req) => {
    const u = auth(req);
    const month = /^\d{4}-\d{2}$/.test(req.query.month) ? req.query.month : kstParts(now()).date.slice(0, 7);
    const s = getSettings(db);
    return { month, today: kstParts(now()).date, days: monthDays(month).map((d) => dayView(d, u, s)) };
  }));

  app.get('/api/days/:date', wrap((req) => {
    const u = auth(req);
    const date = dateParam(req);
    const s = getSettings(db);
    const roster = db.prepare(`
      SELECT u.id, u.name, s.guests, s.guest_note, a.user_id IS NOT NULL AS attended
      FROM signups s JOIN users u ON u.id = s.user_id
      LEFT JOIN attendance a ON a.user_id = s.user_id AND a.date = s.date
      WHERE s.date = ? ORDER BY u.name`).all(date)
      .map((r) => ({ id: r.id, name: r.name, guests: r.guests, guestNote: r.guest_note, attended: !!r.attended }));
    return {
      ...dayView(date, u, s), roster,
      attendanceClosed: attendanceClosed(date, s, now()),
      canSelfCheck: phaseOf(date, s, now()) === 'today' && !attendanceClosed(date, s, now()),
    };
  }));

  // 본인 신청만 가능 (대리 신청 불가). 마감 후에는 관리자만 고칠 수 있다.
  app.put('/api/days/:date/signup', wrap((req) => {
    const u = auth(req);
    const date = dateParam(req);
    const s = getSettings(db);
    if (!u.is_member) fail(403, '점심 신청 대상 계정이 아니에요.');
    if (!dayInfo(db, date).mealDay) fail(400, '이날은 점심 운영을 하지 않아요.');
    if (phaseOf(date, s, now()) !== 'open') fail(400, `신청 마감됐어요. (${formatDay(deadlineOf(date, s))}까지)`);
    const guests = intIn(req.body?.guests ?? 0, 0, Number(s.max_guests), '손님 수');
    const guestNote = guests ? text(req.body?.guestNote, 50, '손님 메모') : null;
    db.prepare(`INSERT INTO signups (user_id, date, guests, guest_note) VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, date) DO UPDATE SET guests = excluded.guests, guest_note = excluded.guest_note, updated_at = datetime('now')`)
      .run(u.id, date, guests, guestNote);
    return dayView(date, u, s);
  }));

  app.delete('/api/days/:date/signup', wrap((req) => {
    const u = auth(req);
    const date = dateParam(req);
    const s = getSettings(db);
    if (phaseOf(date, s, now()) !== 'open') fail(400, '마감 후에는 취소할 수 없어요. 꼭 필요하면 관리자에게 말해 주세요.');
    db.prepare('DELETE FROM signups WHERE user_id = ? AND date = ?').run(u.id, date);
    return dayView(date, u, s);
  }));

  // 식사 당일 본인 출석 체크
  app.post('/api/days/:date/attendance', wrap((req) => {
    const u = auth(req);
    const date = dateParam(req);
    const s = getSettings(db);
    if (phaseOf(date, s, now()) !== 'today' || attendanceClosed(date, s, now())) {
      fail(400, `출석 체크는 식사 당일 ${s.attendance_close_hour}시 전까지만 할 수 있어요.`);
    }
    if (!db.prepare('SELECT 1 FROM signups WHERE user_id = ? AND date = ?').get(u.id, date)) fail(400, '신청하지 않은 날이에요.');
    db.prepare('INSERT OR IGNORE INTO attendance (user_id, date, checked_by) VALUES (?, ?, ?)').run(u.id, date, u.id);
    return { ok: true };
  }));

  // 요리사/관리자가 명단에서 출석 체크 (요리사는 당일만, 관리자는 지난 날도 정정 가능)
  app.put('/api/days/:date/attendance/:userId', wrap((req) => {
    const actor = cookOrAdmin(req);
    const date = dateParam(req);
    const s = getSettings(db);
    const userId = intIn(req.params.userId, 1, 1e9, '직원');
    const phase = phaseOf(date, s, now());
    if (!actor.is_admin && !(phase === 'today' || (phase === 'past' && date === addDays(kstParts(now()).date, -1)))) {
      fail(400, '요리사는 오늘과 어제 출석만 체크할 수 있어요. 그 이전은 관리자에게 부탁해 주세요.');
    }
    if (phase === 'open' || phase === 'confirmed') fail(400, '아직 식사일이 아니에요.');
    if (!db.prepare('SELECT 1 FROM signups WHERE user_id = ? AND date = ?').get(userId, date)) fail(400, '신청자가 아니에요.');
    if (req.body?.attended) {
      db.prepare('INSERT OR IGNORE INTO attendance (user_id, date, checked_by) VALUES (?, ?, ?)').run(userId, date, actor.id);
      // 노쇼 정정: 이미 보낸 노쇼 알림은 지운다
      db.prepare('DELETE FROM notifications WHERE dedupe_key = ?').run(`noshow:${date}:${userId}`);
    } else {
      db.prepare('DELETE FROM attendance WHERE user_id = ? AND date = ?').run(userId, date);
    }
    audit(actor, 'attendance', { date, userId, attended: !!req.body?.attended });
    return { ok: true };
  }));

  // ---------- 메뉴 (요리사) ----------
  app.put('/api/days/:date/menu', wrap((req) => {
    const actor = cookOrAdmin(req);
    const date = dateParam(req);
    const title = text(req.body?.title, 60, '메뉴', true);
    const description = text(req.body?.description, 300, '설명');
    const existed = db.prepare('SELECT 1 FROM menus WHERE date = ?').get(date);
    db.prepare(`INSERT INTO menus (date, title, description, updated_by) VALUES (?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET title = excluded.title, description = excluded.description,
      updated_by = excluded.updated_by, updated_at = datetime('now')`).run(date, title, description, actor.id);
    for (const { user_id } of db.prepare('SELECT user_id FROM signups WHERE date = ?').all(date)) {
      notify(db, push, user_id, {
        key: `menu:${date}:${user_id}:${existed ? Date.now() : 'new'}`,
        title: `${formatDay(date)} 메뉴${existed ? ' 변경' : ''}: ${title}`, body: description || undefined,
      });
    }
    return { ok: true };
  }));

  app.delete('/api/days/:date/menu', wrap((req) => {
    cookOrAdmin(req);
    db.prepare('DELETE FROM menus WHERE date = ?').run(dateParam(req));
    return { ok: true };
  }));

  app.get('/api/cook/upcoming', wrap((req) => {
    const u = cookOrAdmin(req);
    const s = getSettings(db);
    const today = kstParts(now()).date;
    const days = [];
    for (let i = 0; i <= 14; i++) {
      const d = addDays(today, i);
      if (dayInfo(db, d).mealDay) days.push(dayView(d, u, s));
    }
    return { days };
  }));

  // ---------- 예산/지출 ----------
  app.get('/api/expenses', wrap((req) => {
    auth(req);
    const from = isValidDate(req.query.from) ? req.query.from : addDays(kstParts(now()).date, -60);
    const to = isValidDate(req.query.to) ? req.query.to : '9999-12-31';
    return {
      expenses: db.prepare(`SELECT e.id, e.date, e.amount, e.memo, u.name AS createdBy FROM expenses e
        LEFT JOIN users u ON u.id = e.created_by WHERE e.date BETWEEN ? AND ? ORDER BY e.date DESC, e.id DESC`).all(from, to),
    };
  }));

  app.post('/api/expenses', wrap((req) => {
    const actor = cookOrAdmin(req);
    const date = isValidDate(req.body?.date) ? req.body.date : fail(400, '날짜를 확인해 주세요.');
    const amount = intIn(req.body?.amount, 1, 100_000_000, '금액');
    const memo = text(req.body?.memo, 100, '메모');
    const r = db.prepare('INSERT INTO expenses (date, amount, memo, created_by) VALUES (?, ?, ?, ?)').run(date, amount, memo, actor.id);
    audit(actor, 'expense.add', { id: r.lastInsertRowid, date, amount, memo });
    return { id: r.lastInsertRowid };
  }));

  app.delete('/api/expenses/:id', wrap((req) => {
    const actor = cookOrAdmin(req);
    const e = db.prepare('SELECT * FROM expenses WHERE id = ?').get(req.params.id) || fail(404, '없는 지출이에요.');
    if (!actor.is_admin && e.created_by !== actor.id) fail(403, '본인이 입력한 지출만 지울 수 있어요.');
    db.prepare('DELETE FROM expenses WHERE id = ?').run(e.id);
    audit(actor, 'expense.delete', e);
    return { ok: true };
  }));

  // ---------- 요약/알림 ----------
  app.get('/api/summary', wrap((req) => {
    const u = auth(req);
    const s = getSettings(db);
    const mine = noShowCounts(db, now()).find((r) => r.id === u.id);
    return {
      budget: budgetSummary(db, now()),
      noShows: mine ? { total: mine.no_shows, last90: mine.no_shows_90d, signups: mine.signups } : null,
      noShowThreshold: Number(s.noshow_threshold),
      deadlineDays: Number(s.deadline_days),
      attendanceCloseHour: Number(s.attendance_close_hour),
      unread: db.prepare('SELECT COUNT(*) AS v FROM notifications WHERE user_id = ? AND read_at IS NULL').get(u.id).v,
    };
  }));

  app.get('/api/notifications', wrap((req) => {
    const u = auth(req);
    return {
      notifications: db.prepare(`SELECT id, title, body, created_at AS createdAt, read_at IS NOT NULL AS read
        FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50`).all(u.id),
    };
  }));

  app.post('/api/notifications/read', wrap((req) => {
    const u = auth(req);
    db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL").run(u.id);
    return { ok: true };
  }));

  app.get('/api/my/history', wrap((req) => {
    const u = auth(req);
    const s = getSettings(db);
    return {
      history: db.prepare(`SELECT s.date, s.guests, a.user_id IS NOT NULL AS attended FROM signups s
        LEFT JOIN attendance a ON a.user_id = s.user_id AND a.date = s.date
        WHERE s.user_id = ? ORDER BY s.date DESC LIMIT 100`).all(u.id)
        .map((r) => ({ ...r, attended: !!r.attended, phase: phaseOf(r.date, s, now()), closed: attendanceClosed(r.date, s, now()) })),
    };
  }));

  // ---------- 푸시 ----------
  app.get('/api/push/key', wrap(() => ({ key: vapidPublicKey })));
  app.post('/api/push/subscribe', wrap((req) => {
    const u = auth(req);
    const { endpoint, keys } = req.body || {};
    if (typeof endpoint !== 'string' || !endpoint.startsWith('https://') || !keys?.p256dh || !keys?.auth) fail(400, '잘못된 구독 정보예요.');
    db.prepare(`INSERT INTO push_subs (endpoint, user_id, p256dh, auth) VALUES (?, ?, ?, ?)
      ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`)
      .run(endpoint, u.id, String(keys.p256dh), String(keys.auth));
    return { ok: true };
  }));

  // ---------- 관리자 ----------
  app.get('/api/admin/users', wrap((req) => {
    admin(req);
    return { users: db.prepare('SELECT * FROM users ORDER BY status, name').all().map(publicUser) };
  }));

  app.post('/api/admin/users', wrap((req) => {
    const actor = admin(req);
    const { loginId, name } = req.body || {};
    if (typeof loginId !== 'string' || !/^[a-zA-Z0-9._-]{3,30}$/.test(loginId)) fail(400, '아이디는 영문/숫자 3~30자예요.');
    const nm = text(name, 30, '이름', true);
    if (db.prepare('SELECT 1 FROM users WHERE login_id = ?').get(loginId)) fail(409, '이미 있는 아이디예요.');
    const pw = tempPassword();
    const r = db.prepare(`INSERT INTO users (login_id, name, password_hash, status, must_change_pw, is_cook, is_member)
      VALUES (?, ?, ?, 'active', 1, ?, ?)`).run(loginId, nm, hashPassword(pw), req.body.isCook ? 1 : 0, req.body.isMember === false ? 0 : 1);
    audit(actor, 'user.create', { loginId });
    return { id: r.lastInsertRowid, tempPassword: pw };
  }));

  app.patch('/api/admin/users/:id', wrap((req) => {
    const actor = admin(req);
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) || fail(404, '없는 사용자예요.');
    const b = req.body || {};
    const next = {
      name: b.name !== undefined ? text(b.name, 30, '이름', true) : u.name,
      status: b.status ?? u.status,
      is_admin: b.isAdmin !== undefined ? (b.isAdmin ? 1 : 0) : u.is_admin,
      is_cook: b.isCook !== undefined ? (b.isCook ? 1 : 0) : u.is_cook,
      is_member: b.isMember !== undefined ? (b.isMember ? 1 : 0) : u.is_member,
    };
    if (!['pending', 'active', 'inactive'].includes(next.status)) fail(400, '상태 값이 잘못됐어요.');
    if (u.id === actor.id && (!next.is_admin || next.status !== 'active')) fail(400, '본인의 관리자 권한은 스스로 해제할 수 없어요.');
    db.prepare('UPDATE users SET name = ?, status = ?, is_admin = ?, is_cook = ?, is_member = ? WHERE id = ?')
      .run(next.name, next.status, next.is_admin, next.is_cook, next.is_member, u.id);
    if (next.status !== 'active') {
      destroyUserSessions(db, u.id);
      // 전출 등으로 비활성화하면 아직 마감 전인 신청은 지운다 (마감 후 신청은 요리사 준비에 반영됐으므로 둔다)
      const s = getSettings(db);
      const today = kstParts(now()).date;
      for (const { date } of db.prepare('SELECT date FROM signups WHERE user_id = ? AND date > ?').all(u.id, today)) {
        if (phaseOf(date, s, now()) === 'open') db.prepare('DELETE FROM signups WHERE user_id = ? AND date = ?').run(u.id, date);
      }
    }
    if (u.status === 'pending' && next.status === 'active') {
      notify(db, push, u.id, { key: `approved:${u.id}`, title: '가입이 승인됐어요', body: '이제 점심 신청을 할 수 있어요.' });
    }
    audit(actor, 'user.update', { id: u.id, ...next });
    return { user: publicUser({ ...u, ...next }) };
  }));

  app.post('/api/admin/users/:id/reset-password', wrap((req) => {
    const actor = admin(req);
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) || fail(404, '없는 사용자예요.');
    const pw = tempPassword();
    db.prepare('UPDATE users SET password_hash = ?, must_change_pw = 1 WHERE id = ?').run(hashPassword(pw), u.id);
    destroyUserSessions(db, u.id);
    audit(actor, 'user.reset_password', { id: u.id });
    return { tempPassword: pw };
  }));

  // 관리자 대리 수정 (마감 후 예외 처리용, 기록이 남는다)
  app.put('/api/admin/days/:date/signup/:userId', wrap((req) => {
    const actor = admin(req);
    const date = dateParam(req);
    const userId = intIn(req.params.userId, 1, 1e9, '직원');
    const s = getSettings(db);
    if (req.body?.remove) {
      db.prepare('DELETE FROM signups WHERE user_id = ? AND date = ?').run(userId, date);
      db.prepare('DELETE FROM attendance WHERE user_id = ? AND date = ?').run(userId, date);
    } else {
      const guests = intIn(req.body?.guests ?? 0, 0, Number(s.max_guests), '손님 수');
      db.prepare(`INSERT INTO signups (user_id, date, guests) VALUES (?, ?, ?)
        ON CONFLICT(user_id, date) DO UPDATE SET guests = excluded.guests, updated_at = datetime('now')`).run(userId, date, guests);
    }
    audit(actor, 'signup.override', { date, userId, ...req.body });
    return { ok: true };
  }));

  app.put('/api/admin/days/:date', wrap((req) => {
    const actor = admin(req);
    const date = dateParam(req);
    if (req.body?.reset) db.prepare('DELETE FROM day_overrides WHERE date = ?').run(date);
    else {
      db.prepare(`INSERT INTO day_overrides (date, closed, note) VALUES (?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET closed = excluded.closed, note = excluded.note`)
        .run(date, req.body?.closed ? 1 : 0, text(req.body?.note, 30, '메모'));
    }
    audit(actor, 'day.override', { date, ...req.body });
    return { ok: true };
  }));

  app.get('/api/admin/settings', wrap((req) => { admin(req); return getSettings(db); }));
  app.put('/api/admin/settings', wrap((req) => {
    const actor = admin(req);
    const b = req.body || {};
    const limits = { deadline_days: [1, 30], noshow_threshold: [1, 50], attendance_close_hour: [11, 23], reminder_hour: [0, 23], max_guests: [0, 100] };
    for (const [k, [min, max]] of Object.entries(limits)) if (b[k] !== undefined) setSetting(db, k, intIn(b[k], min, max, k));
    if (b.invite_code !== undefined) {
      const code = text(b.invite_code, 40, '초대 코드') || '';
      if (code && code.length < 6) fail(400, '초대 코드는 6자 이상으로 해 주세요.');
      setSetting(db, 'invite_code', code);
    }
    audit(actor, 'settings', { ...b, invite_code: b.invite_code !== undefined ? '(changed)' : undefined });
    return getSettings(db);
  }));

  app.get('/api/admin/noshows', wrap((req) => { admin(req); return { rows: noShowCounts(db, now()) }; }));

  app.get('/api/admin/budgets', wrap((req) => {
    admin(req);
    return { budgets: db.prepare('SELECT id, start_date AS startDate, end_date AS endDate, amount, note FROM budgets ORDER BY start_date DESC').all() };
  }));
  app.post('/api/admin/budgets', wrap((req) => {
    const actor = admin(req);
    const { startDate, endDate } = req.body || {};
    if (!isValidDate(startDate) || !isValidDate(endDate) || startDate > endDate) fail(400, '기간을 확인해 주세요.');
    const amount = intIn(req.body.amount, 0, 1_000_000_000, '예산');
    const overlap = db.prepare('SELECT 1 FROM budgets WHERE start_date <= ? AND end_date >= ? AND id != ?')
      .get(endDate, startDate, req.body.id || 0);
    if (overlap) fail(400, '기간이 겹치는 예산이 이미 있어요.');
    if (req.body.id) {
      db.prepare('UPDATE budgets SET start_date = ?, end_date = ?, amount = ?, note = ? WHERE id = ?')
        .run(startDate, endDate, amount, text(req.body.note, 50, '메모'), req.body.id);
    } else {
      db.prepare('INSERT INTO budgets (start_date, end_date, amount, note) VALUES (?, ?, ?, ?)')
        .run(startDate, endDate, amount, text(req.body.note, 50, '메모'));
    }
    audit(actor, 'budget.save', req.body);
    return { ok: true };
  }));
  app.delete('/api/admin/budgets/:id', wrap((req) => {
    const actor = admin(req);
    db.prepare('DELETE FROM budgets WHERE id = ?').run(req.params.id);
    audit(actor, 'budget.delete', { id: req.params.id });
    return { ok: true };
  }));

  app.get('/api/admin/audit', wrap((req) => {
    admin(req);
    return { rows: db.prepare(`SELECT l.id, l.action, l.detail, l.created_at AS createdAt, u.name AS actor
      FROM audit_log l LEFT JOIN users u ON u.id = l.actor_id ORDER BY l.id DESC LIMIT 200`).all() };
  }));

  app.use('/api', (req, res) => res.status(404).json({ error: '없는 API예요.' }));

  // ---------- 프런트엔드 ----------
  const dist = path.resolve('dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get(/.*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: '잘못된 요청이에요.' });
    console.error(err);
    res.status(500).json({ error: '서버 오류가 났어요. 잠시 뒤 다시 해 주세요.' });
  });

  return app;
}

export { DEFAULT_SETTINGS };
