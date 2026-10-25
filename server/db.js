import Database from 'better-sqlite3';
import { HOLIDAYS } from './holidays.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  login_id TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  is_cook INTEGER NOT NULL DEFAULT 0,
  is_member INTEGER NOT NULL DEFAULT 1,           -- 점심을 신청하는 직원인지
  status TEXT NOT NULL DEFAULT 'pending',         -- pending | active | inactive
  must_change_pw INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS day_overrides (
  date TEXT PRIMARY KEY,
  closed INTEGER NOT NULL,                        -- 1: 휴무, 0: (주말이라도) 운영
  note TEXT
);
CREATE TABLE IF NOT EXISTS menus (
  date TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  updated_by INTEGER REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS signups (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  date TEXT NOT NULL,
  guests INTEGER NOT NULL DEFAULT 0,
  guest_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, date)
);
CREATE INDEX IF NOT EXISTS signups_date ON signups(date);
CREATE TABLE IF NOT EXISTS attendance (
  user_id INTEGER NOT NULL REFERENCES users(id),
  date TEXT NOT NULL,
  checked_by INTEGER REFERENCES users(id),
  checked_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, date)
);
CREATE TABLE IF NOT EXISTS budgets (
  id INTEGER PRIMARY KEY,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  amount INTEGER NOT NULL,
  note TEXT
);
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  amount INTEGER NOT NULL,
  memo TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dedupe_key TEXT UNIQUE,
  title TEXT NOT NULL,
  body TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read_at TEXT
);
CREATE TABLE IF NOT EXISTS push_subs (
  endpoint TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  actor_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export const DEFAULT_SETTINGS = {
  deadline_days: '7',            // 식사일 며칠 전까지 신청/취소 가능한지 (그날 23:59까지)
  noshow_threshold: '3',         // 노쇼 누적 몇 회부터 관리자에게 알릴지
  attendance_close_hour: '15',   // 식사 당일 몇 시에 출석 체크를 마감하고 노쇼를 확정할지
  reminder_hour: '9',            // 마감 하루 전 리마인드를 보낼 시각
  max_guests: '20',
  invite_code: '',               // 비어 있으면 자가 가입 불가
};

export function openDb(file = process.env.DB_PATH || 'data/tc-lunch.db') {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  const putSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) putSetting.run(k, v);
  const putHoliday = db.prepare('INSERT OR IGNORE INTO day_overrides (date, closed, note) VALUES (?, 1, ?)');
  for (const [d, note] of Object.entries(HOLIDAYS)) putHoliday.run(d, note);
  return db;
}

export function getSettings(db) {
  const out = {};
  for (const { key, value } of db.prepare('SELECT key, value FROM settings').all()) out[key] = value;
  return out;
}

export const setSetting = (db, key, value) =>
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, String(value));
