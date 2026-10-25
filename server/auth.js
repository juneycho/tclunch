import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

const SESSION_DAYS = 30;
export const COOKIE = 'tcl_session';

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export const hashPassword = (pw) => bcrypt.hashSync(pw, 10);
export const checkPassword = (pw, hash) => bcrypt.compareSync(pw, hash);

export function validPassword(pw) {
  return typeof pw === 'string' && pw.length >= 8 && pw.length <= 100;
}

export function tempPassword() {
  // 헷갈리는 문자(0/O, 1/l) 제외
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(10), (b) => chars[b % chars.length]).join('');
}

export function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(sha256(token), userId, Date.now() + SESSION_DAYS * 864e5);
  return token;
}

export function sessionUser(db, token) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?`).get(sha256(token));
  if (!row || row.expires_at < Date.now() || row.status !== 'active') return null;
  return row;
}

export const destroySession = (db, token) =>
  token && db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));

export const destroyUserSessions = (db, userId) =>
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);

// 로그인 시도 제한: 같은 IP+아이디로 15분에 10번까지
const attempts = new Map();
export function rateLimited(key) {
  const now = Date.now();
  const list = (attempts.get(key) || []).filter((t) => now - t < 15 * 60e3);
  attempts.set(key, list);
  return list.length >= 10;
}
export const recordFailure = (key) => attempts.set(key, [...(attempts.get(key) || []), Date.now()]);
export const clearFailures = (key) => attempts.delete(key);

export function publicUser(u) {
  return {
    id: u.id, loginId: u.login_id, name: u.name,
    isAdmin: !!u.is_admin, isCook: !!u.is_cook, isMember: !!u.is_member,
    status: u.status, mustChangePw: !!u.must_change_pw,
  };
}
