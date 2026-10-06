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
/** Demo phones — the identity partners use to address these users. */
export const DEMO_PHONES = { convenience: '9876500001', fashion: '9876500002', subscriptions: '9876500003' };
/** UPI IDs each demo phone has paid from (people switch apps; the phone stays). */
const DEMO_VPAS = { convenience: ['rohan.v@paytm', 'rohanverma@okhdfcbank'], fashion: ['neha.k@paytm', 'nehakapoor@ybl', '9876500002@axl'], subscriptions: ['kabir.m@paytm', 'kabir@okicici'] };
function ensureDemoVpas(persona, userId) {
  if (db.prepare('SELECT 1 FROM user_vpas WHERE user_id = ?').get(userId)) return;
  const t = db.prepare("SELECT COUNT(*) n, MIN(ts) a, MAX(ts) b FROM transactions WHERE user_id = ? AND status = 'completed'").get(userId);
  if (!t.n) return;
  const vpas = DEMO_VPAS[persona], start = new Date(t.a).getTime(), end = new Date(t.b).getTime();
  // Older UPI IDs were used earlier; the first (Paytm) one is current and carries most payments.
  const weights = vpas.map((_, i) => (i === 0 ? 0.62 : 0.38 / (vpas.length - 1)));
  vpas.forEach((vpa, i) => {
    const first = i === 0 ? start + (end - start) * 0.35 : start + (end - start) * 0.05 * i;
    const last = i === 0 ? end : start + (end - start) * (0.4 + 0.15 * i);
    db.prepare('INSERT OR IGNORE INTO user_vpas (user_id, vpa, first_seen, last_seen, payments) VALUES (?, ?, ?, ?, ?)').run(userId, vpa, new Date(first).toISOString(), new Date(last).toISOString(), Math.round(t.n * weights[i]));
  });
}
export const PORTAL_DEMO = { email: 'integrations@paytm.demo', password: 'paytm-partner-2026' };

const DEFAULT_SETTINGS = { budgetAlerts: true, unusualSpending: true, dealAlerts: true, weeklySummary: true, theme: 'dark' };
export { DEFAULT_SETTINGS };

export async function ensureDemoUser(persona, { reset = false } = {}) {
  const email = DEMO_USERS[persona];
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing && !reset) {
    db.prepare('UPDATE users SET phone = ? WHERE id = ? AND phone IS NULL AND NOT EXISTS (SELECT 1 FROM users WHERE phone = ?)').run(DEMO_PHONES[persona], existing.id, DEMO_PHONES[persona]);
    ensureDemoVpas(persona, existing.id);
    return existing.id;
  }
  if (existing) db.prepare('DELETE FROM users WHERE id = ?').run(existing.id);
  const P = PERSONAS[persona];
  const id = uid();
  db.prepare('DELETE FROM users WHERE phone = ?').run(DEMO_PHONES[persona]);
  db.prepare(`INSERT INTO users (id, email, name, password_hash, persona, city, age, income, household, period_months, data_source, settings, phone)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 12, 'paytm', ?, ?)`).run(id, email, P.name, await bcrypt.hash(DEMO_PASSWORD, 10), persona, P.city, P.age, P.income, P.household, json.str(DEFAULT_SETTINGS), DEMO_PHONES[persona]);
  importTransactions(id, generateTransactions(persona, { months: 12, seed: email }));
  // A sample budget so the budget view has something to show.
  if (persona === 'convenience') {
    for (const [c, a] of [['food', 20000], ['shopping', 12000], ['transport', 7000], ['entertainment', 5000]]) db.prepare('INSERT INTO budgets (id, user_id, category, amount) VALUES (?, ?, ?, ?)').run(uid(), id, c, a);
  }
  await seedAdHistory(id, email);
  ensureDemoVpas(persona, id);
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

/** Paytm as the first integration partner, with one portal admin for the demo. */
export async function ensurePartners() {
  let p = db.prepare("SELECT * FROM partners WHERE slug = 'paytm'").get();
  if (!p) { db.prepare("INSERT INTO partners (id, slug, name) VALUES (?, 'paytm', 'Paytm')").run(uid()); p = db.prepare("SELECT * FROM partners WHERE slug = 'paytm'").get(); }
  if (!db.prepare('SELECT 1 FROM portal_members WHERE email = ?').get(PORTAL_DEMO.email)) {
    // The well-known demo password exists only outside production; production must set PORTAL_ADMIN_PASSWORD.
    const password = process.env.PORTAL_ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? null : PORTAL_DEMO.password);
    if (!password) console.warn('  Portal: no admin created — set PORTAL_ADMIN_PASSWORD to create integrations@paytm.demo.');
    else db.prepare('INSERT INTO portal_members (id, partner_id, email, name, password_hash) VALUES (?, ?, ?, ?, ?)').run(uid(), p.id, PORTAL_DEMO.email, 'Paytm Integrations', await bcrypt.hash(password, 10));
  }
  return p;
}

export async function ensureDemoUsers(opts) {
  for (const p of Object.keys(DEMO_USERS)) await ensureDemoUser(p, opts);
  const paytm = await ensurePartners();
  // Demo users came from Paytm history; link them (idempotent). Also backfill links for any
  // users created by partner ingestion before links existed.
  for (const phone of Object.values(DEMO_PHONES)) {
    const u = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
    if (u) db.prepare("INSERT OR IGNORE INTO user_partners (user_id, partner_id, owner, linked_via) VALUES (?, ?, 0, 'paytm_history')").run(u.id, paytm.id);
  }
  db.prepare("INSERT OR IGNORE INTO user_partners (user_id, partner_id, owner, linked_via) SELECT u.id, p.id, 1, 'ingest' FROM users u JOIN partners p ON p.slug = u.data_source WHERE u.source = 'partner'").run();
  // Two weeks of realistic Paytm traffic through the real pipeline, so the portal isn't empty on first run.
  const { ensureSimulatedHistory } = await import('./partner/simulate.js');
  const t0 = Date.now();
  const sim = ensureSimulatedHistory(paytm);
  if (sim) console.log(`  Portal: simulated ${sim.received.toLocaleString('en-IN')} Paytm payments in ${sim.deliveries} deliveries (${Date.now() - t0} ms)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await ensureDemoUsers({ reset: true });
  console.log(`Demo accounts reset (password: ${DEMO_PASSWORD}):`);
  for (const [k, e] of Object.entries(DEMO_USERS)) console.log(`  ${k.padEnd(14)} ${e}`);
}
