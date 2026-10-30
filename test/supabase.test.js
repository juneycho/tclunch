// Supabase SQL(마이그레이션) 규칙 테스트. 로컬 Postgres가 필요하다.
// PGHOST=/tmp/pgtest PGPORT=5433 PGUSER=postgres npm run test:db
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const migrations = fs.readdirSync(path.join(root, 'supabase/migrations')).sort()
  .filter((f) => !f.includes('cron'))           // pg_cron/pg_net은 Supabase에만 있다
  .map((f) => read(`supabase/migrations/${f}`));

let admin, db, dbName, clock = '2026-11-02T10:00:00+09:00';
const users = {};

// 같은 프로젝트에 이미 있는 테니스 앱 (anon 키로 public 테이블을 직접 읽고 씀)
const TENNIS_SQL = `
  create table public.members (id serial primary key, name text not null unique);
  create table public.attendance (id serial primary key, member_name text not null, date text not null, present boolean not null default false);
  alter table public.members enable row level security;
  alter table public.attendance enable row level security;
  create policy anon_all_members on public.members for all using (true) with check (true);
  create policy anon_all_attendance on public.attendance for all using (true) with check (true);
  grant all on public.members, public.attendance to anon, authenticated;
  grant usage, select on all sequences in schema public to anon, authenticated;
  grant usage on schema public to anon, authenticated;
`;

before(async () => {
  admin = new pg.Client({ database: 'postgres' });
  await admin.connect();
});
after(async () => { await db?.end(); await admin.end(); });

beforeEach(async () => {
  await db?.end();
  if (dbName) await admin.query(`drop database ${dbName}`);
  dbName = `tcl_${crypto.randomBytes(4).toString('hex')}`;
  await admin.query(`create database ${dbName}`);
  db = new pg.Client({ database: dbName });
  await db.connect();
  await db.query(`do $$ begin
    if not exists (select from pg_roles where rolname = 'authenticated') then
      create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    end if; end $$;`);
  await db.query(read('test/sql/supabase-stub.sql').replace(/create role[^;]+;/g, ''));
  await db.query(TENNIS_SQL);
  for (const m of migrations) await db.query(m);
  await db.query('set search_path = lunch, public');
  clock = '2026-11-02T10:00:00+09:00';
  await db.query("update lunch_private.secrets set value = 'tc-2026' where key = 'invite_code'");
  users.admin = await signUp('admin', '관리자');                 // 첫 가입자 = 관리자
  users.kim = await signUp('kim', '김철수', { admin: true });
  users.lee = await signUp('lee', '이영희', { admin: true });
  users.cook = await signUp('cook', '요리사', { admin: true, is_cook: true, is_member: false });
});

async function signUp(login, name, { admin: byAdmin, invite = 'tc-2026', ...extra } = {}) {
  const token = byAdmin ? (await db.query("select value from lunch_private.secrets where key = 'admin_token'")).rows[0].value : undefined;
  const meta = { app: 'tc-lunch', login_id: login, name, invite_code: invite, admin_token: token, ...extra };
  const r = await db.query('insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id', [`${login}@x`, meta]);
  return r.rows[0].id;
}

// 로그인한 사용자로 RPC 호출 (PostgREST가 하는 것처럼 role과 jwt sub를 설정)
async function rpc(who, fn, args = {}) {
  const keys = Object.keys(args);
  const sql = `select lunch.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`;
  await db.query('begin');
  try {
    await db.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('app.now', $2, true)`, [who ? users[who] : '', clock]);
    await db.query('set local role authenticated');
    const r = await db.query(sql, keys.map((k) => args[k]));
    await db.query('commit');
    return r.rows[0].r;
  } catch (e) { await db.query('rollback'); throw e; }
}
const rejects = (p, re) => assert.rejects(p, (e) => (re ? re.test(e.message) : true) || assert.fail(e.message));
async function asUser(who, sql) {
  await db.query('begin');
  await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [users[who]]);
  await db.query('set local role authenticated');
  try { return await db.query(sql); } finally { await db.query('rollback'); }
}
const jobs = async () => {
  await db.query('begin');
  await db.query(`select set_config('app.now', $1, true)`, [clock]);
  await db.query('select lunch_private.run_jobs()');
  await db.query('commit');
};
const titles = async (who) => (await db.query('select title from notifications where user_id = $1', [users[who]])).rows.map((r) => r.title);

test('신청은 식사일 7일 전까지만 가능', async () => {
  const d = await rpc('kim', 'signup_upsert', { p_date: '2026-11-09', p_guests: 2, p_guest_note: '거래처' });
  assert.equal(d.total, 3);
  await rejects(rpc('kim', 'signup_upsert', { p_date: '2026-11-06' }), /마감/);
  clock = '2026-11-03T00:30:00+09:00';
  await rejects(rpc('kim', 'signup_cancel', { p_date: '2026-11-09' }), /취소할 수 없어요/);
});

test('주말/공휴일은 신청 불가, 관리자가 운영일로 열 수 있음', async () => {
  await rejects(rpc('kim', 'signup_upsert', { p_date: '2026-11-14' }), /운영/);
  await rejects(rpc('kim', 'signup_upsert', { p_date: '2026-12-25' }), /운영/);
  await rpc('admin', 'admin_set_day', { p_date: '2026-11-14', p_closed: false, p_note: '특근' });
  await rpc('kim', 'signup_upsert', { p_date: '2026-11-14' });
});

test('다른 사람 대신 신청할 수 없고, 테이블에 직접 쓸 수도 없음', async () => {
  await rejects(rpc('kim', 'admin_signup_override', { p_date: '2026-11-09', p_user: users.lee }), /관리자만/);
  await rejects(asUser('kim', `insert into signups (user_id, date) values ('${users.lee}', '2026-11-09')`), /permission denied/);
  await rejects(asUser('kim', `update profiles set is_admin = true`), /permission denied/);
  await rejects(asUser('kim', `select * from lunch_private.secrets`), /permission denied/);
  await rejects(rpc('kim', 'set_menu', { p_date: '2026-11-09', p_title: 'x' }), /요리사나 관리자/);
});

test('달력에 인원수 표시', async () => {
  await rpc('kim', 'signup_upsert', { p_date: '2026-11-10', p_guests: 1 });
  await rpc('lee', 'signup_upsert', { p_date: '2026-11-10' });
  const cal = await rpc('kim', 'get_calendar', { p_month: '2026-11' });
  const d = cal.days.find((x) => x.date === '2026-11-10');
  assert.deepEqual([d.members, d.guests, d.total, d.phase, d.mine.guests], [2, 1, 3, 'open', 1]);
  assert.equal(cal.days.length, 30);
});

test('출석 체크와 노쇼 집계/알림, 정정', async () => {
  await rpc('kim', 'signup_upsert', { p_date: '2026-11-09' });
  await rpc('lee', 'signup_upsert', { p_date: '2026-11-09' });
  clock = '2026-11-09T12:00:00+09:00';
  await rpc('kim', 'self_check', { p_date: '2026-11-09' });
  clock = '2026-11-09T16:00:00+09:00';
  await rejects(rpc('lee', 'self_check', { p_date: '2026-11-09' }), /출석 체크는/);
  await jobs(); await jobs();
  assert.equal((await titles('lee')).filter((t) => t.includes('노쇼')).length, 1);
  assert.equal((await rpc('lee', 'get_summary')).noShows.total, 1);
  assert.equal((await rpc('kim', 'get_summary')).noShows.total, 0);
  await rpc('cook', 'set_attendance', { p_date: '2026-11-09', p_user: users.lee, p_attended: true });
  assert.equal((await rpc('lee', 'get_summary')).noShows.total, 0);
  clock = '2026-11-12T10:00:00+09:00';
  await rejects(rpc('cook', 'set_attendance', { p_date: '2026-11-09', p_user: users.lee, p_attended: false }), /오늘과 어제/);
});

test('노쇼 기준 초과 시 관리자 알림', async () => {
  for (const d of ['2026-11-09', '2026-11-10', '2026-11-11']) await rpc('lee', 'signup_upsert', { p_date: d });
  clock = '2026-11-11T17:00:00+09:00';
  await jobs();
  assert.ok((await titles('admin')).some((t) => t.includes('이영희님 노쇼 3회')));
});

test('인원 확정되면 요리사 알림, 메뉴 등록 시 신청자 알림', async () => {
  await rpc('kim', 'signup_upsert', { p_date: '2026-11-09', p_guests: 2 });
  clock = '2026-11-03T01:00:00+09:00';
  await jobs();
  assert.ok((await titles('cook')).includes('11/9(월) 인원 확정: 3명'));
  await rpc('cook', 'set_menu', { p_date: '2026-11-09', p_title: '비빔밥' });
  assert.ok((await titles('kim')).some((t) => t.includes('비빔밥')));
});

test('마감 하루 전 미신청자 리마인드', async () => {
  await jobs();
  assert.ok((await titles('kim')).some((t) => t.startsWith('11/10(화) 점심 신청이 내일 마감')));
  assert.ok(!(await titles('cook')).some((t) => t.includes('신청이 내일')));
});

test('예산: 총예산, 지출, 남은 예산', async () => {
  await rpc('admin', 'admin_save_budget', { p_start: '2026-11-01', p_end: '2026-11-30', p_amount: 1000000 });
  await rejects(rpc('admin', 'admin_save_budget', { p_start: '2026-11-15', p_end: '2026-12-15', p_amount: 1 }), /겹치는/);
  await rpc('cook', 'add_expense', { p_date: '2026-11-02', p_amount: 85000, p_memo: '장보기' });
  await rejects(rpc('kim', 'add_expense', { p_date: '2026-11-02', p_amount: 1 }));
  const b = (await rpc('kim', 'get_summary')).budget;
  assert.deepEqual([b.total, b.spent, b.remaining], [1000000, 85000, 915000]);
});

test('가입: 초대 코드·승인 없이 이름으로 바로, 첫 가입자만 관리자, 같은 이름 불가', async () => {
  users.park = await signUp('park', '박민', { invite: '' });
  const me = (await db.query('select status, is_admin from profiles where id = $1', [users.park])).rows[0];
  assert.deepEqual(me, { status: 'active', is_admin: false });
  await rpc('park', 'get_calendar');
  assert.deepEqual((await db.query('select status, is_admin from profiles where id = $1', [users.admin])).rows[0], { status: 'active', is_admin: true });
  await rejects(signUp('park2', '박민'), /이미 있는 이름/);
  await rejects(signUp('park3', '열한글자가넘는긴이름이에요'), /1~10자/);
  // 관리자가 만든 계정은 첫 로그인 때 비번 변경
  assert.equal((await db.query('select must_change_pw from profiles where id = $1', [users.kim])).rows[0].must_change_pw, true);
  await rejects(rpc('kim', 'admin_get_settings'), /관리자만/);
});

test('전출(비활성화) 시 데이터 차단, 마감 전 신청 삭제', async () => {
  await rpc('kim', 'signup_upsert', { p_date: '2026-11-20' });
  await rpc('admin', 'admin_update_user', { p_id: users.kim, p: { status: 'inactive' } });
  await rejects(rpc('kim', 'get_calendar'), /비활성/);
  assert.equal((await asUser('kim', 'select * from signups')).rowCount, 0);
  assert.equal((await db.query('select count(*)::int c from signups')).rows[0].c, 0);
  await rejects(rpc('admin', 'admin_update_user', { p_id: users.admin, p: { isAdmin: false } }), /스스로/);
});

test('로그인 안 한 사용자(anon)는 아무것도 못 함', async () => {
  await db.query('begin');
  await db.query('set local role anon');
  await rejects(db.query("select lunch.get_calendar('2026-11')"), /permission denied/);
  await db.query('rollback');
});

test('관리자 비밀번호 초기화', async () => {
  await db.query("update auth.users set encrypted_password = 'old' where id = $1", [users.kim]);
  await rejects(rpc('lee', 'admin_reset_password', { p_id: users.kim }), /관리자만/);
  const pw = await rpc('admin', 'admin_reset_password', { p_id: users.kim });
  assert.match(pw, /^[a-z2-9]{10}$/);
  const r = (await db.query('select encrypted_password = extensions.crypt($2, encrypted_password) ok from auth.users where id = $1', [users.kim, pw])).rows[0];
  assert.equal(r.ok, true);
  assert.equal((await db.query('select must_change_pw from profiles where id = $1', [users.kim])).rows[0].must_change_pw, true);
});

test('로그인 화면의 이름 찾기는 로그인 없이 가능, 비밀값은 메타데이터에 남지 않음', async () => {
  await db.query('begin');
  await db.query('set local role anon');
  const r = await db.query("select lunch.login_lookup(' 김철수 ') v, lunch.login_lookup('없는사람') w");
  await db.query('rollback');
  assert.deepEqual(r.rows[0], { v: 'kim', w: null });
  const meta = (await db.query('select raw_user_meta_data m from auth.users where id = $1', [users.kim])).rows[0].m;
  assert.equal(meta.admin_token, undefined);
  assert.equal(meta.invite_code, undefined);
});

test('같은 프로젝트의 테니스 앱은 그대로 동작 (public 테이블, 다른 앱 가입)', async () => {
  await db.query('begin');
  await db.query('set local role anon');
  await db.query("insert into public.members (name) values ('홍길동')");
  await db.query("insert into public.attendance (member_name, date, present) values ('홍길동', '2026-10-30', true)");
  const r = await db.query('select count(*)::int c from public.attendance');
  await db.query('rollback');
  assert.equal(r.rows[0].c, 1);
  // 점심 앱 표시가 없는 가입은 막지도, 점심 직원으로 만들지도 않는다
  const other = (await db.query("insert into auth.users (email, raw_user_meta_data) values ('x@y', '{}') returning id")).rows[0].id;
  assert.equal((await db.query('select count(*)::int c from lunch.profiles where id = $1', [other])).rows[0].c, 0);
});
