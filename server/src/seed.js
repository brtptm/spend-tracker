// Demo accounts for the three journeys in the brief.
import bcrypt from 'bcryptjs';
import { pathToFileURL } from 'node:url';
import { db, json, uid } from './db.js';
import { PERSONAS, generateTransactions } from './data/generator.js';
import { importTransactions } from './lib/store.js';
import { rng } from './data/generator.js';

export const DEMO_PASSWORD = 'spend-smart-2026';
export const DEMO_USERS = {
  convenience: 'rohan@demo.spendtracker.app',
  fashion: 'neha@demo.spendtracker.app',
  subscriptions: 'kabir@demo.spendtracker.app',
};
export const isDemoEmail = (e) => Object.values(DEMO_USERS).includes(e);

const DEFAULT_SETTINGS = { budgetAlerts: true, unusualSpending: true, dealAlerts: true, weeklySummary: true, theme: 'dark' };
export { DEFAULT_SETTINGS };

export async function ensureDemoUser(persona, { reset = false } = {}) {
  const email = DEMO_USERS[persona];
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing && !reset) return existing.id;
  if (existing) db.prepare('DELETE FROM users WHERE id = ?').run(existing.id);
  const P = PERSONAS[persona];
  const id = uid();
  db.prepare(`INSERT INTO users (id, email, name, password_hash, persona, city, age, income, household, period_months, data_source, settings)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 12, 'paytm', ?)`).run(id, email, P.name, await bcrypt.hash(DEMO_PASSWORD, 10), persona, P.city, P.age, P.income, P.household, json.str(DEFAULT_SETTINGS));
  importTransactions(id, generateTransactions(persona, { months: 12, seed: email }));
  // A sample budget so the budget view has something to show.
  if (persona === 'convenience') {
    for (const [c, a] of [['food', 20000], ['shopping', 12000], ['transport', 7000], ['entertainment', 5000]]) db.prepare('INSERT INTO budgets (id, user_id, category, amount) VALUES (?, ?, ?, ?)').run(uid(), id, c, a);
  }
  await seedAdHistory(id, email);
  return id;
}

/** 30 days of simulated offer impressions/clicks/conversions so partner stats aren't empty. */
async function seedAdHistory(userId, seed) {
  const { context } = await import('./lib/context.js');
  const r = rng(`ads:${seed}`);
  const offers = context(userId).offers.all.slice(0, 8);
  const ins = db.prepare("INSERT INTO ad_events (user_id, ad_id, type, value, source, created_at) VALUES (?, ?, ?, ?, 'simulated', datetime('now', ?))");
  for (const o of offers) {
    const views = Math.round((o.tier === 1 ? 26 : o.tier === 2 ? 14 : 6) * (0.8 + r() * 0.4));
    for (let v = 0; v < views; v++) {
      const ago = `-${Math.floor(r() * 30)} days`;
      ins.run(userId, o.adId, 'view', 0, ago);
      if (r() < o.expectedCTR) { ins.run(userId, o.adId, 'click', 0, ago); if (r() < 0.32) ins.run(userId, o.adId, 'convert', 300 + Math.round(r() * 900), ago); }
    }
  }
}

export async function ensureDemoUsers(opts) {
  for (const p of Object.keys(DEMO_USERS)) await ensureDemoUser(p, opts);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await ensureDemoUsers({ reset: true });
  console.log(`Demo accounts reset (password: ${DEMO_PASSWORD}):`);
  for (const [k, e] of Object.entries(DEMO_USERS)) console.log(`  ${k.padEnd(14)} ${e}`);
}
