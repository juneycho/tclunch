// 데모용 데이터 넣기: DB_PATH=data/demo.db node scripts/demo-seed.js
// (실제 운영 DB에는 쓰지 마세요)
import { openDb, setSetting } from '../server/db.js';
import { hashPassword } from '../server/auth.js';
import { addDays, kstToday, weekday } from '../server/time.js';

const db = openDb(process.env.DB_PATH || 'data/demo.db');
const pw = hashPassword('password1');
const people = ['김민수', '이서연', '박지훈', '최유진', '정현우', '강하은', '조성민', '윤지아', '장도윤', '임수빈', '한예준', '오채원'];
const add = db.prepare(`INSERT OR IGNORE INTO users (login_id, name, password_hash, status, is_admin, is_cook, is_member)
  VALUES (?, ?, ?, 'active', ?, ?, ?)`);
add.run('admin', '관리자', pw, 1, 0, 1);
add.run('cook', '요리사', pw, 0, 1, 0);
people.forEach((n, i) => add.run(`user${i + 1}`, n, pw, 0, 0, 1));
setSetting(db, 'invite_code', 'tc-lunch-2026');

const ids = db.prepare('SELECT id FROM users WHERE is_member = 1').all().map((r) => r.id);
const today = kstToday();
const sign = db.prepare('INSERT OR IGNORE INTO signups (user_id, date, guests) VALUES (?, ?, ?)');
const att = db.prepare('INSERT OR IGNORE INTO attendance (user_id, date, checked_by) VALUES (?, ?, 1)');
for (let i = -20; i <= 13; i++) {
  const d = addDays(today, i);
  if ([0, 6].includes(weekday(d)) || db.prepare('SELECT 1 FROM day_overrides WHERE date = ? AND closed = 1').get(d)) continue;
  const n = 2 + ((i * 7 + 20) % 10);
  ids.slice(0, n).forEach((id, k) => {
    sign.run(id, d, k === 0 && i % 3 === 0 ? 2 : 0);
    if (i < 0 && !(k === 3 && i % 4 === 0)) att.run(id, d);
  });
}
db.prepare("INSERT OR IGNORE INTO menus (date, title, description) VALUES (?, '김치찌개, 계란말이', '돼지고기 듬뿍')").run(addDays(today, 1));
const ym = today.slice(0, 7);
db.prepare('INSERT OR IGNORE INTO budgets (id, start_date, end_date, amount, note) VALUES (1, ?, ?, 1500000, ?)')
  .run(`${ym}-01`, addDays(`${addDays(`${ym}-28`, 7).slice(0, 7)}-01`, -1), `${Number(ym.slice(5))}월 식비`);
db.prepare("INSERT INTO expenses (date, amount, memo, created_by) VALUES (?, 186000, '마트 장보기', 2)").run(addDays(today, -6));
db.prepare("INSERT INTO expenses (date, amount, memo, created_by) VALUES (?, 92000, '정육점', 2)").run(addDays(today, -2));
console.log('데모 데이터 완료. 아이디 admin / cook / user1~12, 비밀번호 password1');
