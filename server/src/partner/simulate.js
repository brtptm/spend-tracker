// Simulated Paytm backfill: 14 days of realistic, messy UPI traffic pushed through the REAL ingestion
// pipeline, so the Integration Portal has history on first run. Deterministic (same seed → same data).
// Deliveries are logged with kind "simulated" so the portal is honest about where they came from.
import { db, json } from '../db.js';
import { MERCHANTS, PEOPLE } from '../data/catalog.js';
import { rng } from '../data/generator.js';
import { ingest, MCC_MAP } from './ingest.js';
import { newId } from './keys.js';

const FIRST = ['Aarav', 'Diya', 'Vihaan', 'Ananya', 'Arjun', 'Ishita', 'Kabir', 'Meera', 'Reyansh', 'Saanvi', 'Aditya', 'Kavya', 'Vivaan', 'Myra', 'Rohan', 'Tara', 'Krishna', 'Zara', 'Aryan', 'Nisha', 'Dev', 'Riya', 'Ishaan', 'Pooja', 'Karan', 'Sneha', 'Yash', 'Aditi', 'Neel', 'Simran'];
const LAST = ['Sharma', 'Iyer', 'Reddy', 'Mehta', 'Nair', 'Gupta', 'Kulkarni', 'Banerjee', 'Singh', 'Patel', 'Rao', 'Menon', 'Joshi', 'Das', 'Chopra'];
const CITIES = ['Bengaluru', 'Mumbai', 'Delhi', 'Pune', 'Hyderabad', 'Chennai', 'Kolkata', 'Gurugram', 'Noida', 'Ahmedabad'];
const BANKS = ['hdfcbank', 'icici', 'axisbank', 'ybl', 'okhdfcbank', 'okicici', 'paytm', 'sbi'];
const GATEWAY = ['payu', 'rzp', 'paytm', 'pg', 'cashfree'];
// Archetypes weight which merchants a user pays (by subcategory).
const ARCHETYPES = [
  { name: 'foodie', subs: { food_delivery: 6, restaurants: 2, coffee: 2, groceries: 2, cabs: 2, streaming: 1 } },
  { name: 'commuter', subs: { cabs: 5, metro: 4, fuel: 2, food_delivery: 2, groceries: 2, mobile: 1 } },
  { name: 'shopper', subs: { fashion: 4, beauty: 3, marketplace: 3, food_delivery: 2, groceries: 2 } },
  { name: 'family', subs: { groceries: 6, electricity: 1, gas: 1, healthcare: 2, marketplace: 2, mobile: 1 } },
  { name: 'student', subs: { food_delivery: 3, street_food: 4, coffee: 2, metro: 3, streaming: 1, gaming: 1 } },
];
const MCC_FOR = Object.entries(MCC_MAP).reduce((m, [code, { category, sub }]) => (m[`${category}.${sub}`] ||= code, m), {});

export function simulateBackfill(partner, { days = 14, users = 30, seed = 'paytm-backfill-v1' } = {}) {
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const between = (a, b) => a + r() * (b - a);
  const digits = (n) => Array.from({ length: n }, () => Math.floor(r() * 10)).join('');

  const people = Array.from({ length: users }, (_, i) => {
    const first = FIRST[i % FIRST.length], last = pick(LAST);
    const arch = ARCHETYPES[i % ARCHETYPES.length];
    const handle = `${first.toLowerCase()}.${last.toLowerCase().slice(0, 1)}${i}`;
    const vpas = [`${handle}@paytm`, ...(r() < 0.45 ? [`${handle}@${pick(['ybl', 'okhdfcbank', 'okicici', 'axl'])}`] : [])];
    const pool = MERCHANTS.filter((m) => arch.subs[m.sub]).flatMap((m) => Array(arch.subs[m.sub]).fill(m));
    return { phone: `98100${String(10001 + i).slice(-5)}`, name: `${first} ${last}`, city: pick(CITIES), vpas, pool, perDay: between(2, 9) };
  });

  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - days);
  const pending = [];
  const totals = { deliveries: 0, received: 0 };
  const logIns = db.prepare(`INSERT INTO ingest_log (id, partner_id, key_id, kind, received, accepted, duplicates, filtered, rejected, results, duration_ms, created_at)
    VALUES (?, ?, NULL, 'simulated', ?, ?, ?, ?, ?, ?, ?, ?)`);

  for (let d = 0; d < days; d++) {
    const day = new Date(start.getTime() + d * 864e5);
    const events = [];
    // Pending payments from yesterday settle today (same id → status update).
    for (const p of pending.splice(0)) events.push({ ...p, status: r() < 0.9 ? 'success' : 'failed' });
    for (const u of people) {
      const n = Math.max(0, Math.round(u.perDay * between(0.5, 1.5) * (day.getDay() % 6 === 0 ? 1.3 : 1)));
      for (let k = 0; k < n; k++) {
        const ts = new Date(day.getTime() + between(7, 23.5) * 3600e3);
        const payer = r() < 0.8 ? u.vpas[0] : u.vpas.at(-1);
        const base = { id: `PTM${day.toISOString().slice(2, 10).replace(/-/g, '')}${digits(8)}`, phone: u.phone, timestamp: ts.toISOString(), payer_vpa: payer, rrn: digits(12), app: 'paytm', user: { name: u.name, city: u.city } };
        const x = r();
        if (x < 0.06) { events.push({ ...base, amount: Math.round(between(500, 25000)), direction: 'credit', payee_vpa: payer, payee_name: 'SALARY / REFUND' }); continue; }
        if (x < 0.09) { const e = { ...base, amount: Math.round(between(120, 900)), status: 'pending', payee_vpa: `blinkit.${pick(GATEWAY)}@${pick(BANKS)}`, payee_name: 'PAYTM*BLINKIT COMMERCE' }; events.push(e); pending.push(e); continue; }
        if (x < 0.105 && u.vpas.length > 1) { events.push({ ...base, amount: Math.round(between(1000, 20000)), payee_vpa: u.vpas[1], payee_name: u.name.toUpperCase() }); continue; }
        if (x < 0.115) { events.push({ ...base, amount: 1, payee_vpa: `verify.${pick(GATEWAY)}@${pick(BANKS)}`, note: 'Penny drop verification' }); continue; }
        if (x < 0.13) { events.push({ ...base, phone: r() < 0.5 ? `0${digits(5)}` : u.phone, amount: r() < 0.5 ? -Math.round(between(10, 500)) : Math.round(between(50, 500)), payee_vpa: r() < 0.5 ? 'merchant@@bank' : `shop${digits(3)}@ybl` }); continue; }
        if (x < 0.2) { // payment to a person
          const who = pick(PEOPLE);
          events.push({ ...base, amount: Math.round(between(100, 3500)), payee_vpa: r() < 0.5 ? `9${digits(9)}@ybl` : `${who.toLowerCase().replace(/\s+/g, '.')}@okaxis`, payee_name: r() < 0.5 ? who.toUpperCase() : undefined, note: pick(['Dinner split', 'Rent share', 'Cab', 'Thanks!', '']) });
          continue;
        }
        const m = pick(u.pool);
        const raw = r() < 0.5 ? `PAYTM*${m.name.toUpperCase()} ${digits(7)}` : `UPI-${m.name.toUpperCase()} PVT LTD`;
        const e = { ...base, amount: Math.round(between(m.range[0], m.range[1]) * (r() < 0.3 ? 0.6 : 1)), payee_vpa: `${m.id}.${pick(GATEWAY)}@${pick(BANKS)}`, payee_name: raw, mcc: r() < 0.7 ? MCC_FOR[`${m.category}.${m.sub}`] : undefined };
        events.push(e);
        if (r() < 0.03) events.push({ ...e }); // network retry → duplicate
      }
    }
    // Deliver in a few batches through the day, like a real sync job.
    const chunks = 3 + Math.floor(r() * 3);
    const size = Math.ceil(events.length / chunks);
    for (let c = 0; c < chunks; c++) {
      const part = events.slice(c * size, (c + 1) * size);
      if (!part.length) continue;
      const t0 = performance.now();
      const out = ingest(partner, part);
      const at = new Date(day.getTime() + (8 + c * (14 / chunks) + r()) * 3600e3).toISOString().slice(0, 19).replace('T', ' ');
      logIns.run(newId('ing'), partner.id, out.received, out.accepted + out.updated, out.duplicates, out.filtered, out.rejected, json.str({ ...out, simulated: true }), Math.max(1, Math.round(performance.now() - t0)), at);
      totals.deliveries++; totals.received += out.received;
    }
  }
  return totals;
}

/** Run once per database (skipped when SIMULATE_HISTORY=0). */
export function ensureSimulatedHistory(partner) {
  if (process.env.SIMULATE_HISTORY === '0') return null;
  if (db.prepare("SELECT 1 FROM ingest_log WHERE partner_id = ? AND kind = 'simulated' LIMIT 1").get(partner.id)) return null;
  return simulateBackfill(partner);
}
