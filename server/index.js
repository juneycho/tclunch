import fs from 'node:fs';
import path from 'node:path';
import webpush from 'web-push';
import { createApp } from './app.js';
import { hashPassword } from './auth.js';
import { getSettings, openDb, setSetting } from './db.js';
import { runJobs } from './logic.js';

const dbPath = process.env.DB_PATH || 'data/tc-lunch.db';
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = openDb(dbPath);

// 첫 실행 시 관리자 계정 만들기 (ADMIN_LOGIN_ID / ADMIN_PASSWORD 환경변수)
const adminId = process.env.ADMIN_LOGIN_ID;
const adminPw = process.env.ADMIN_PASSWORD;
if (!db.prepare('SELECT 1 FROM users WHERE is_admin = 1').get()) {
  if (!adminId || !adminPw || adminPw.length < 8) {
    console.error('관리자 계정이 없습니다. ADMIN_LOGIN_ID, ADMIN_PASSWORD(8자 이상) 환경변수를 설정하고 다시 실행하세요.');
    process.exit(1);
  }
  db.prepare(`INSERT INTO users (login_id, name, password_hash, is_admin, is_member, status)
    VALUES (?, ?, ?, 1, 1, 'active')`).run(adminId, process.env.ADMIN_NAME || '관리자', hashPassword(adminPw));
  console.log(`관리자 계정 생성: ${adminId}`);
}

// 웹 푸시 키: 환경변수가 없으면 처음 한 번 만들어 DB에 저장해 둔다.
const s = getSettings(db);
let vapid = { publicKey: process.env.VAPID_PUBLIC_KEY || s.vapid_public, privateKey: process.env.VAPID_PRIVATE_KEY || s.vapid_private };
if (!vapid.publicKey || !vapid.privateKey) {
  vapid = webpush.generateVAPIDKeys();
  setSetting(db, 'vapid_public', vapid.publicKey);
  setSetting(db, 'vapid_private', vapid.privateKey);
}
webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', vapid.publicKey, vapid.privateKey);

async function push(userId, payload) {
  const subs = db.prepare('SELECT * FROM push_subs WHERE user_id = ?').all(userId);
  await Promise.all(subs.map((sub) => webpush
    .sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload))
    .catch((e) => {
      if (e.statusCode === 404 || e.statusCode === 410) db.prepare('DELETE FROM push_subs WHERE endpoint = ?').run(sub.endpoint);
    })));
}

const app = createApp({
  db, push, vapidPublicKey: vapid.publicKey,
  secureCookies: process.env.NODE_ENV === 'production',
});

const tick = () => { try { runJobs(db, push); } catch (e) { console.error('job error', e); } };
tick();
setInterval(tick, 5 * 60 * 1000);
// 만료된 세션 정리
setInterval(() => db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now()), 6 * 3600e3);

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`TC LUNCH 서버 실행 중: http://localhost:${port}`));
