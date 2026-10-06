import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const dataDir = path.resolve(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(process.env.DB_FILE || path.join(dataDir, 'spend.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  persona TEXT,
  city TEXT, age INTEGER, income INTEGER, household TEXT,
  period_months INTEGER NOT NULL DEFAULT 6,
  consent_partner INTEGER NOT NULL DEFAULT 1,
  ad_personalization INTEGER NOT NULL DEFAULT 1,
  data_source TEXT,
  settings TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ts TEXT NOT NULL,
  amount REAL NOT NULL,
  merchant_name TEXT NOT NULL,
  merchant_id TEXT,
  category TEXT NOT NULL,
  sub TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1,
  cat_source TEXT NOT NULL DEFAULT 'rule',
  original_category TEXT,
  description TEXT,
  payment_method TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  location TEXT,
  coupon_used INTEGER NOT NULL DEFAULT 0,
  is_recurring INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS tx_user_ts ON transactions(user_id, ts);
CREATE TABLE IF NOT EXISTS merchant_rules (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  merchant_key TEXT NOT NULL,
  category TEXT NOT NULL,
  sub TEXT NOT NULL,
  PRIMARY KEY (user_id, merchant_key)
);
CREATE TABLE IF NOT EXISTS rec_state (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rec_id TEXT NOT NULL,
  status TEXT NOT NULL,
  baseline REAL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, rec_id)
);
CREATE TABLE IF NOT EXISTS ad_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  ad_id TEXT NOT NULL,
  type TEXT NOT NULL,
  value REAL NOT NULL DEFAULT 0,
  meta TEXT,
  source TEXT NOT NULL DEFAULT 'app',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ad_events_ad ON ad_events(ad_id, type);
CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  amount REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, category)
);
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, key)
);
CREATE TABLE IF NOT EXISTS challenges (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  baseline REAL NOT NULL,
  target REAL NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, challenge_id)
);
CREATE TABLE IF NOT EXISTS ai_cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

export const json = { parse(v, f = null) { if (v == null) return f; try { return JSON.parse(v); } catch { return f; } }, str: (v) => JSON.stringify(v ?? null) };
export const uid = () => crypto.randomUUID();
export function tx(fn) { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } }
