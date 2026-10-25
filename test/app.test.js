import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { hashPassword } from '../server/auth.js';
import { openDb } from '../server/db.js';
import { runJobs } from '../server/logic.js';

// 기준 시각: 2026-11-02(월) 10:00 KST
let clock;
const at = (iso) => { clock = new Date(iso); };
let db, app;

function addUser(loginId, extra = {}) {
  const r = db.prepare(`INSERT INTO users (login_id, name, password_hash, status, is_admin, is_cook, is_member)
    VALUES (?, ?, ?, 'active', ?, ?, ?)`).run(loginId, extra.name || loginId, hashPassword('password1'),
    extra.admin ? 1 : 0, extra.cook ? 1 : 0, extra.member === false ? 0 : 1);
  return r.lastInsertRowid;
}

async function login(loginId) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').set('X-Requested-With', 'tc-lunch').send({ loginId, password: 'password1' });
  assert.equal(res.status, 200, res.body.error);
  const h = { 'X-Requested-With': 'tc-lunch' };
  return {
    get: (u) => agent.get(u),
    put: (u, b) => agent.put(u).set(h).send(b || {}),
    post: (u, b) => agent.post(u).set(h).send(b || {}),
    del: (u) => agent.delete(u).set(h),
    patch: (u, b) => agent.patch(u).set(h).send(b || {}),
  };
}

beforeEach(() => {
  at('2026-11-02T01:00:00Z');
  db = openDb(':memory:');
  app = createApp({ db, now: () => clock });
  addUser('admin', { admin: true, name: '관리자' });
  addUser('kim', { name: '김철수' });
  addUser('lee', { name: '이영희' });
  addUser('cook', { cook: true, member: false, name: '요리사' });
});

test('신청은 식사일 7일 전까지만 가능', async () => {
  const kim = await login('kim');
  // 11/9(월)의 마감은 11/2 → 오늘이니 가능
  let r = await kim.put('/api/days/2026-11-09/signup', { guests: 2, guestNote: '거래처' });
  assert.equal(r.status, 200);
  assert.equal(r.body.total, 3);
  // 11/6(금)은 마감 지남
  r = await kim.put('/api/days/2026-11-06/signup', {});
  assert.equal(r.status, 400);
  // 마감 이후에는 취소 불가
  at('2026-11-02T15:30:00Z'); // 11/3 00:30 KST
  r = await kim.del('/api/days/2026-11-09/signup');
  assert.equal(r.status, 400);
});

test('주말/공휴일은 신청 불가, 관리자가 운영일로 열 수 있음', async () => {
  const kim = await login('kim');
  assert.equal((await kim.put('/api/days/2026-11-14/signup')).status, 400); // 토요일
  assert.equal((await kim.put('/api/days/2026-12-25/signup')).status, 400); // 성탄절
  const admin = await login('admin');
  await admin.put('/api/admin/days/2026-11-14', { closed: false, note: '특근' });
  assert.equal((await kim.put('/api/days/2026-11-14/signup')).status, 200);
});

test('다른 사람 대신 신청할 수 없음 (본인 신청 API만 존재)', async () => {
  const kim = await login('kim');
  const r = await kim.put('/api/admin/days/2026-11-09/signup/3', { guests: 0 });
  assert.equal(r.status, 403);
});

test('CSRF 헤더 없으면 거절', async () => {
  const r = await request(app).post('/api/auth/login').send({ loginId: 'kim', password: 'password1' });
  assert.equal(r.status, 403);
});

test('달력에 인원수 표시', async () => {
  const kim = await login('kim');
  const lee = await login('lee');
  await kim.put('/api/days/2026-11-10/signup', { guests: 1 });
  await lee.put('/api/days/2026-11-10/signup', {});
  const r = await kim.get('/api/calendar?month=2026-11');
  const d = r.body.days.find((x) => x.date === '2026-11-10');
  assert.deepEqual([d.members, d.guests, d.total, d.phase], [2, 1, 3, 'open']);
  assert.equal(d.mine.guests, 1);
});

test('출석 체크와 노쇼 집계/알림', async () => {
  const kim = await login('kim');
  const lee = await login('lee');
  await kim.put('/api/days/2026-11-09/signup', {});
  await lee.put('/api/days/2026-11-09/signup', {});
  at('2026-11-09T03:00:00Z'); // 당일 12시
  assert.equal((await kim.post('/api/days/2026-11-09/attendance')).status, 200);
  at('2026-11-09T07:00:00Z'); // 16시: 출석 마감
  assert.equal((await lee.post('/api/days/2026-11-09/attendance')).status, 400);
  runJobs(db, null, clock);
  runJobs(db, null, clock); // 두 번 돌려도 알림은 한 번
  const n = (await lee.get('/api/notifications')).body.notifications.filter((x) => x.title.includes('노쇼'));
  assert.equal(n.length, 1);
  const s = (await lee.get('/api/summary')).body;
  assert.equal(s.noShows.total, 1);
  assert.equal((await kim.get('/api/summary')).body.noShows.total, 0);

  // 요리사가 정정하면 노쇼에서 빠짐
  const cook = await login('cook');
  assert.equal((await cook.put('/api/days/2026-11-09/attendance/3', { attended: true })).status, 200);
  assert.equal((await lee.get('/api/summary')).body.noShows.total, 0);
});

test('노쇼 기준 초과 시 관리자 알림', async () => {
  const lee = await login('lee');
  for (const d of ['2026-11-09', '2026-11-10', '2026-11-11']) await lee.put(`/api/days/${d}/signup`, {});
  at('2026-11-11T08:00:00Z');
  runJobs(db, null, clock);
  const admin = await login('admin');
  const titles = (await admin.get('/api/notifications')).body.notifications.map((x) => x.title);
  assert.ok(titles.some((t) => t.includes('이영희님 노쇼 3회')), titles.join(','));
});

test('인원 확정되면 요리사 알림, 메뉴 등록 시 신청자 알림', async () => {
  const kim = await login('kim');
  await kim.put('/api/days/2026-11-09/signup', { guests: 2 });
  at('2026-11-02T16:00:00Z'); // 11/3 01:00 KST → 11/9 마감
  runJobs(db, null, clock);
  const cook = await login('cook');
  const titles = (await cook.get('/api/notifications')).body.notifications.map((x) => x.title);
  assert.ok(titles.includes('11/9(월) 인원 확정: 3명'), titles.join(','));
  assert.equal((await cook.put('/api/days/2026-11-09/menu', { title: '비빔밥' })).status, 200);
  assert.equal((await kim.put('/api/days/2026-11-09/menu', { title: '해킹' })).status, 403);
  const k = (await kim.get('/api/notifications')).body.notifications.map((x) => x.title);
  assert.ok(k.some((t) => t.includes('비빔밥')));
});

test('마감 하루 전 미신청자 리마인드', async () => {
  // 11/2 10시 → 11/10 신청 마감이 내일(11/3)
  runJobs(db, null, clock);
  const kim = await login('kim');
  const titles = (await kim.get('/api/notifications')).body.notifications.map((x) => x.title);
  assert.ok(titles.some((t) => t.startsWith('11/10(화) 점심 신청이 내일 마감')));
});

test('예산: 총예산, 지출, 남은 예산', async () => {
  const admin = await login('admin');
  const cook = await login('cook');
  assert.equal((await admin.post('/api/admin/budgets', { startDate: '2026-11-01', endDate: '2026-11-30', amount: 1000000 })).status, 200);
  await cook.post('/api/expenses', { date: '2026-11-02', amount: 85000, memo: '장보기' });
  const kim = await login('kim');
  assert.equal((await kim.post('/api/expenses', { date: '2026-11-02', amount: 1 })).status, 403);
  const b = (await kim.get('/api/summary')).body.budget;
  assert.deepEqual([b.total, b.spent, b.remaining], [1000000, 85000, 915000]);
});

test('가입: 초대 코드 + 관리자 승인', async () => {
  const admin = await login('admin');
  const anon = request(app);
  const h = { 'X-Requested-With': 'tc-lunch' };
  let r = await anon.post('/api/auth/register').set(h).send({ inviteCode: 'x', loginId: 'park', name: '박', password: 'password1' });
  assert.equal(r.status, 400);
  await admin.put('/api/admin/settings', { invite_code: 'tc-2026' });
  r = await anon.post('/api/auth/register').set(h).send({ inviteCode: 'tc-2026', loginId: 'park', name: '박', password: 'password1' });
  assert.equal(r.status, 200);
  r = await anon.post('/api/auth/login').set(h).send({ loginId: 'park', password: 'password1' });
  assert.equal(r.status, 403);
  const park = db.prepare("SELECT id FROM users WHERE login_id = 'park'").get();
  await admin.patch(`/api/admin/users/${park.id}`, { status: 'active' });
  await login('park');
});

test('전출(비활성화) 시 로그인 차단, 마감 전 신청 삭제', async () => {
  const kim = await login('kim');
  await kim.put('/api/days/2026-11-20/signup', {});
  const admin = await login('admin');
  await admin.patch('/api/admin/users/2', { status: 'inactive' });
  assert.equal((await kim.get('/api/calendar')).status, 401);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM signups').get().c, 0);
});
