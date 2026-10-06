// Deterministic sample-data generator that stands in for the Paytm transaction
// feed. Same seed → same history, so demos are reproducible.
import { MERCHANT, DISHES, PEOPLE } from './catalog.js';

export function rng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) { h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// [merchantId, timesPerMonth, amountScale]
export const PERSONAS = {
  convenience: {
    label: 'Convenience spender', name: 'Rohan Verma', city: 'Bengaluru', age: 32, income: 160000, household: 'Married, 2 kids',
    couponRate: 0.08,
    monthly: [
      ['swiggy', 45, 0.62], ['zomato', 32, 0.6], ['dineout', 3, 0.7], ['haldirams', 2, 1], ['bigbasket', 1, 0.6], ['blinkit', 3, 0.6],
      ['starbucks', 3, 1], ['ccd', 2, 1], ['streetfood', 4, 1],
      ['amazon', 2, 0.8], ['flipkart', 1, 0.6], ['myntra', 1, 0.8], ['ajio', 1, 0.6], ['nykaa', 0.5, 1],
      ['uber', 22, 0.75], ['ola', 10, 0.75], ['metro', 12, 1], ['rapido', 4, 1],
      ['bookmyshow', 1.5, 0.9], ['pvr', 1, 1], ['steam', 0.4, 1],
      ['apollo', 1.5, 1], ['practo', 0.4, 1], ['jio', 1, 0.8],
    ],
    subscriptions: [['netflix', 649, 3], ['hotstar', 299, 7], ['spotify', 119, 12], ['cultfit', 2400, 5]],
    bills: [['bescom', 1600], ['airtelfiber', 999], ['indane', 950, 2]],
    quarterly: [['lic', 5200]],
    p2p: { perMonth: 3, range: [400, 3000] },
    spikes: { 9: 1.9, 10: 1.6 }, // Oct/Nov festive season (0-based months)
  },
  fashion: {
    label: 'Fashion enthusiast', name: 'Neha Kapoor', city: 'Mumbai', age: 27, income: 85000, household: 'Single',
    couponRate: 0.55,
    monthly: [
      ['myntra', 2.5, 0.9], ['ajio', 1.5, 0.9], ['nykaa', 2, 0.9], ['hm', 0.6, 0.8], ['amazon', 1.5, 0.5],
      ['swiggy', 10, 0.6], ['zomato', 8, 0.6], ['blinkit', 6, 0.5], ['zepto', 4, 0.5], ['starbucks', 4, 1], ['chaipoint', 6, 1],
      ['uber', 10, 0.7], ['ola', 6, 0.7], ['metro', 14, 1],
      ['bookmyshow', 1.2, 1], ['apollo', 1, 0.6], ['airtel', 1, 0.6],
    ],
    subscriptions: [['prime', 299, 9], ['spotify', 119, 14]],
    bills: [['airtelfiber', 799], ['nobroker', 18000, 1]],
    quarterly: [],
    p2p: { perMonth: 4, range: [300, 2500] },
    spikes: { 9: 1.7, 10: 1.5, 2: 1.2 },
  },
  subscriptions: {
    label: 'Subscription collector', name: 'Kabir Shah', city: 'Pune', age: 35, income: 120000, household: 'Married',
    couponRate: 0.2,
    monthly: [
      ['swiggy', 14, 0.6], ['zomato', 8, 0.6], ['bigbasket', 3, 0.8], ['dmart', 2, 0.8], ['ccd', 3, 1],
      ['amazon', 2.5, 0.7], ['flipkart', 1, 0.6], ['croma', 0.15, 0.4],
      ['uber', 8, 0.8], ['hpcl', 4, 1], ['irctc', 0.4, 1],
      ['pvr', 1, 1], ['steam', 0.6, 0.6], ['apollo', 1.2, 1], ['groww', 1, 0.6], ['jio', 1, 1],
    ],
    subscriptions: [['netflix', 649, 2], ['hotstar', 899, 4], ['sonyliv', 299, 6], ['spotify', 119, 8], ['youtube', 149, 8], ['adobe', 1675, 15], ['goldsgym', 2500, 1], ['prime', 299, 20]],
    bills: [['bescom', 2100], ['airtelfiber', 1199], ['indane', 1000, 2]],
    quarterly: [['policybazaar', 3100]],
    p2p: { perMonth: 2, range: [500, 4000] },
    spikes: { 9: 1.5, 10: 1.4 },
  },
};

const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const poisson = (r, lambda) => { if (lambda <= 0) return 0; let L = Math.exp(-lambda), k = 0, p = 1; do { k++; p *= r(); } while (p > L && k < 200); return k - 1; };
const round = (n) => Math.max(1, Math.round(n));
const payMethod = (r) => { const x = r(); return x < 0.68 ? 'UPI' : x < 0.86 ? 'Card' : x < 0.96 ? 'Wallet' : 'NetBanking'; };
const status = (r) => { const x = r(); return x < 0.975 ? 'completed' : x < 0.992 ? 'failed' : 'pending'; };

function at(year, month, day, hour, r) {
  const d = new Date(year, month, day, hour, Math.floor(r() * 60), Math.floor(r() * 60));
  return d;
}

/** Generate `months` months of transactions ending today. */
export function generateTransactions(personaKey, { months = 12, seed = personaKey, now = new Date() } = {}) {
  const P = PERSONAS[personaKey];
  const r = rng(seed);
  const out = [];
  const push = (merchantId, date, amount, extra = {}) => {
    if (date > now) return;
    const M = MERCHANT[merchantId];
    out.push({
      timestamp: date.toISOString(), amount: round(amount), merchantName: M?.name || extra.merchantName, merchantId: M ? merchantId : null,
      description: extra.description || '', paymentMethod: extra.paymentMethod || payMethod(r), status: extra.status || status(r),
      location: P.city, couponUsed: extra.couponUsed ?? r() < P.couponRate, isRecurring: Boolean(extra.isRecurring),
      categoryHint: extra.category, subHint: extra.sub,
    });
  };

  for (let k = months - 1; k >= 0; k--) {
    const base = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const y = base.getFullYear(), mo = base.getMonth();
    const days = new Date(y, mo + 1, 0).getDate();
    const spike = P.spikes[mo] || 1;
    const drift = 0.92 + r() * 0.16;

    for (const [id, perMonth, scale] of P.monthly) {
      const M = MERCHANT[id];
      const shoppingBoost = M.category === 'shopping' ? spike : spike > 1 ? 1 + (spike - 1) * 0.25 : 1;
      const n = poisson(r, perMonth * drift * shoppingBoost);
      for (let i = 0; i < n; i++) {
        const day = 1 + Math.floor(r() * days);
        const hour = pick(r, M.hours);
        const [lo, hi] = M.range;
        const skew = Math.pow(r(), 1.6); // most purchases toward the low end
        let amt = (lo + (hi - lo) * skew) * scale;
        const dish = M.sub === 'food_delivery' ? (personaKey === 'convenience' && r() < 0.24 ? pick(r, ['Chicken Biryani', 'Mutton Biryani']) : pick(r, DISHES)) : '';
        push(id, at(y, mo, day, hour, r), amt, { description: dish ? `${dish} delivery` : '' });
      }
    }
    for (const [id, amount, day] of P.subscriptions) push(id, at(y, mo, Math.min(day, days), 7, r), amount, { isRecurring: true, paymentMethod: 'Card', status: 'completed', couponUsed: false, description: 'Monthly subscription' });
    for (const [id, amount, every = 1] of P.bills) {
      if (k % every !== 0) continue;
      const seasonal = id === 'bescom' && [3, 4, 5].includes(mo) ? 1.45 : 1;
      push(id, at(y, mo, 5 + Math.floor(r() * 6), 10, r), amount * seasonal * (0.9 + r() * 0.2), { isRecurring: true, couponUsed: false, description: 'Bill payment' });
    }
    for (const [id, amount] of P.quarterly) if (mo % 3 === 0) push(id, at(y, mo, 12, 11, r), amount, { isRecurring: true, couponUsed: false, description: 'Premium' });
    const np = poisson(r, P.p2p.perMonth);
    for (let i = 0; i < np; i++) {
      const who = pick(r, PEOPLE);
      const family = who === 'Mom' || who === 'Dad';
      const [lo, hi] = P.p2p.range;
      push(null, at(y, mo, 1 + Math.floor(r() * days), pick(r, [13, 21, 22]), r), lo + (hi - lo) * r() * (family ? 2 : 1), {
        merchantName: who, description: family ? 'Family transfer' : r() < 0.5 ? 'Split: dinner' : 'UPI transfer', paymentMethod: 'UPI', couponUsed: false,
        category: 'p2p', sub: family ? 'family' : 'friends',
      });
    }
  }

  // Planted signals for the anomaly detector (current month).
  const t = new Date(now.getFullYear(), now.getMonth(), Math.max(1, now.getDate() - 2), 23, 41);
  if (personaKey === 'convenience') {
    push('swiggy', t, 486, { description: 'Chicken Biryani delivery', status: 'completed' });
    push('swiggy', new Date(t.getTime() + 50_000), 486, { description: 'Chicken Biryani delivery', status: 'completed' });
    push('croma', new Date(now.getFullYear(), now.getMonth(), Math.max(1, now.getDate() - 3), 1, 12), 38990, { description: 'Laptop', paymentMethod: 'Card', status: 'completed' });
  }
  if (personaKey === 'subscriptions') push('adobe', new Date(now.getFullYear(), now.getMonth(), Math.max(1, now.getDate() - 1), 7, 2), 1675, { isRecurring: true, description: 'Monthly subscription', status: 'completed' });

  return out.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
