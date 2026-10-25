import { getSettings } from './db.js';
import { addDays, kstParts, weekday } from './time.js';

const num = (v) => Number.parseInt(v, 10);

export function dayInfo(db, date) {
  const o = db.prepare('SELECT closed, note FROM day_overrides WHERE date = ?').get(date);
  const wd = weekday(date);
  const mealDay = o ? !o.closed : wd !== 0 && wd !== 6;
  return { mealDay, note: o?.note || null };
}

// 신청/취소 마감일: 식사일 deadline_days일 전(그날 23:59 KST까지 가능)
export const deadlineOf = (date, settings) => addDays(date, -num(settings.deadline_days));

// open: 신청 가능 · confirmed: 마감되어 인원 확정 · today: 오늘 · past: 지난 날
export function phaseOf(date, settings, now = new Date()) {
  const today = kstParts(now).date;
  if (date < today) return 'past';
  if (date === today) return 'today';
  return today <= deadlineOf(date, settings) ? 'open' : 'confirmed';
}

// 출석 체크가 마감되어 노쇼가 확정된 날인지
export function attendanceClosed(date, settings, now = new Date()) {
  const { date: today, hour } = kstParts(now);
  return date < today || (date === today && hour >= num(settings.attendance_close_hour));
}

export function headcount(db, date) {
  const r = db.prepare(
    `SELECT COUNT(*) AS members, COALESCE(SUM(guests), 0) AS guests FROM signups WHERE date = ?`,
  ).get(date);
  return { members: r.members, guests: r.guests, total: r.members + r.guests };
}

export function noShowCounts(db, now = new Date()) {
  const s = getSettings(db);
  const { date: today, hour } = kstParts(now);
  const lastClosed = hour >= num(s.attendance_close_hour) ? today : addDays(today, -1);
  return db.prepare(`
    SELECT u.id, u.name, u.login_id, u.status,
      COUNT(CASE WHEN s.id IS NOT NULL AND a.user_id IS NULL THEN 1 END) AS no_shows,
      COUNT(CASE WHEN s.id IS NOT NULL AND a.user_id IS NULL AND s.date >= ? THEN 1 END) AS no_shows_90d,
      COUNT(s.id) AS signups
    FROM users u
    LEFT JOIN signups s ON s.user_id = u.id AND s.date <= ?
    LEFT JOIN attendance a ON a.user_id = s.user_id AND a.date = s.date
    WHERE u.is_member = 1
    GROUP BY u.id
    ORDER BY no_shows DESC, u.name
  `).all(addDays(today, -90), lastClosed);
}

export function budgetSummary(db, now = new Date()) {
  const today = kstParts(now).date;
  const b = db.prepare(
    'SELECT * FROM budgets WHERE start_date <= ? AND end_date >= ? ORDER BY start_date DESC LIMIT 1',
  ).get(today, today);
  if (!b) return null;
  const spent = db.prepare('SELECT COALESCE(SUM(amount), 0) AS v FROM expenses WHERE date BETWEEN ? AND ?')
    .get(b.start_date, b.end_date).v;
  // 실제로 먹은 끼니 수: 출석한 직원 + 그 직원이 데려온 손님
  const meals = db.prepare(`
    SELECT COUNT(*) + COALESCE(SUM(s.guests), 0) AS v FROM signups s
    JOIN attendance a ON a.user_id = s.user_id AND a.date = s.date
    WHERE s.date BETWEEN ? AND ?`).get(b.start_date, b.end_date).v;
  return {
    id: b.id, startDate: b.start_date, endDate: b.end_date, note: b.note,
    total: b.amount, spent, remaining: b.amount - spent, meals,
    perMeal: meals ? Math.round(spent / meals) : null,
  };
}

export function notify(db, push, userId, { key, title, body }) {
  const r = db.prepare(
    'INSERT OR IGNORE INTO notifications (user_id, dedupe_key, title, body) VALUES (?, ?, ?, ?)',
  ).run(userId, key || null, title, body || null);
  if (r.changes && push) push(userId, { title, body }).catch(() => {});
  return r.changes > 0;
}

const activeUsers = (db, where) =>
  db.prepare(`SELECT id, name FROM users WHERE status = 'active' AND ${where}`).all();

const fmt = (date) => {
  const [, m, d] = date.split('-');
  return `${Number(m)}/${Number(d)}(${'일월화수목금토'[weekday(date)]})`;
};

// 주기적으로 실행: 여러 번 실행해도 dedupe_key 덕분에 알림은 한 번만 간다.
export function runJobs(db, push, now = new Date()) {
  const s = getSettings(db);
  const { date: today, hour } = kstParts(now);
  const dl = num(s.deadline_days);

  // 1) 마감 하루 전 리마인드: 내일이 마감인 식사일에 아직 신청 안 한 직원
  if (hour >= num(s.reminder_hour)) {
    const date = addDays(today, dl + 1);
    if (dayInfo(db, date).mealDay) {
      for (const u of activeUsers(db, 'is_member = 1')) {
        const signed = db.prepare('SELECT 1 FROM signups WHERE user_id = ? AND date = ?').get(u.id, date);
        if (!signed) {
          notify(db, push, u.id, {
            key: `remind:${date}:${u.id}`,
            title: `${fmt(date)} 점심 신청이 내일 마감돼요`,
            body: '드실 거면 오늘~내일 중으로 신청해 주세요.',
          });
        }
      }
    }
  }

  // 2) 인원 확정 → 요리사에게 메뉴 등록 요청 (마감 다음 날 이후, 아직 안 지난 날)
  for (let i = 1; i <= dl; i++) {
    const date = addDays(today, i);
    if (phaseOf(date, s, now) !== 'confirmed' || !dayInfo(db, date).mealDay) continue;
    const hc = headcount(db, date);
    for (const c of activeUsers(db, 'is_cook = 1')) {
      notify(db, push, c.id, {
        key: `confirmed:${date}:${c.id}`,
        title: `${fmt(date)} 인원 확정: ${hc.total}명`,
        body: `직원 ${hc.members}명 + 손님 ${hc.guests}명. 메뉴를 등록해 주세요.`,
      });
    }
  }

  // 3) 노쇼 확정 알림 (최근 7일 내 출석 마감된 날)
  const threshold = num(s.noshow_threshold);
  let anyNew = false;
  for (let i = 0; i <= 7; i++) {
    const date = addDays(today, -i);
    if (!attendanceClosed(date, s, now)) continue;
    const missing = db.prepare(`
      SELECT s.user_id FROM signups s
      JOIN users u ON u.id = s.user_id AND u.status = 'active'
      LEFT JOIN attendance a ON a.user_id = s.user_id AND a.date = s.date
      WHERE s.date = ? AND a.user_id IS NULL`).all(date);
    for (const { user_id } of missing) {
      anyNew = notify(db, push, user_id, {
        key: `noshow:${date}:${user_id}`,
        title: `${fmt(date)} 점심 노쇼로 기록됐어요`,
        body: '신청하고 드시지 않았어요. 착오라면 요리사나 관리자에게 말해 주세요.',
      }) || anyNew;
    }
  }
  if (anyNew) {
    const over = noShowCounts(db, now).filter((r) => r.status === 'active' && r.no_shows_90d >= threshold);
    for (const r of over) {
      for (const a of activeUsers(db, 'is_admin = 1')) {
        notify(db, push, a.id, {
          key: `noshow-admin:${r.id}:${r.no_shows_90d}:${a.id}`,
          title: `${r.name}님 노쇼 ${r.no_shows_90d}회 (최근 90일)`,
          body: `기준 ${threshold}회 이상이에요.`,
        });
      }
    }
  }
}

export { fmt as formatDay };
