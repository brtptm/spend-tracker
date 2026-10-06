import { MERCHANTS, MERCHANT, CATEGORY } from '../data/catalog.js';

export const merchantKey = (name = '') => name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const BUSINESS_WORDS = /\b(pvt|ltd|limited|store|stores|mart|foods?|cafe|restaurant|services|technologies|india|bank|pay|recharge|bill|shop|traders|enterprises|hotel|pharma|medical|medicals|clinic|motors|fuel|petrol|sweets|corner|bakery|general|kirana|centre|center|agency|bhandar|emporium|salon|studio)\b/i;

/**
 * Categorise one transaction. Order: the user's own corrections → known merchant →
 * keyword match → person-to-person heuristics → low-confidence fallback for AI review.
 */
export function categorize({ merchantName = '', description = '', amount = 0, merchantId, categoryHint, subHint }, userRules = new Map()) {
  const key = merchantKey(merchantName);
  const rule = userRules.get(key);
  if (rule) return { category: rule.category, sub: rule.sub, confidence: 0.99, source: 'user', merchantId: merchantId || null, reasoning: 'You categorised this merchant before.' };

  if (categoryHint && CATEGORY[categoryHint]) return { category: categoryHint, sub: subHint || Object.keys(CATEGORY[categoryHint].subs)[0], confidence: 0.97, source: 'rule', merchantId: merchantId || null, reasoning: 'Categorised by the payment network.' };

  if (merchantId && MERCHANT[merchantId]) {
    const M = MERCHANT[merchantId];
    return { category: M.category, sub: M.sub, confidence: 0.99, source: 'rule', merchantId, reasoning: `${M.name} is a known ${CATEGORY[M.category].subs[M.sub].toLowerCase()} merchant.` };
  }

  const hay = ` ${key} ${merchantKey(description)} `;
  let best = null;
  for (const M of MERCHANTS) {
    for (const kw of M.keywords) {
      if (hay.includes(` ${kw} `) || hay.includes(kw)) {
        if (!best || kw.length > best.kw.length) best = { M, kw };
      }
    }
  }
  if (best) {
    const exact = key === merchantKey(best.M.name) || key.startsWith(best.kw);
    return { category: best.M.category, sub: best.M.sub, confidence: exact ? 0.97 : 0.82, source: 'rule', merchantId: best.M.id, reasoning: `Matched “${best.kw}” → ${best.M.name}.` };
  }

  if (/\b(medical|clinic|hospital|pharma|diagnostic|lab)\b/i.test(hay)) return { category: 'personal', sub: 'healthcare', confidence: 0.72, source: 'rule', merchantId: null, reasoning: 'Health-related keywords.' };
  if (/\b(restaurant|cafe|foods?|kitchen|dhaba|bakery|sweets|mithai|biryani|tiffin|canteen)\b/i.test(hay)) return { category: 'food', sub: amount < 250 ? 'street_food' : 'restaurants', confidence: 0.7, source: 'rule', merchantId: null, reasoning: 'Food-related keywords.' };
  if (/\b(mart|store|stores|traders|enterprises|retail|general|kirana|bhandar|emporium)\b/i.test(hay)) return { category: 'shopping', sub: 'marketplace', confidence: 0.55, source: 'rule', merchantId: null, reasoning: 'Generic retail merchant.' };

  // Person names: 2–3 capitalised words, no business words → peer-to-peer.
  const looksLikePerson = /^[A-Z][a-z]+( [A-Z][a-z]+){0,2}$/.test(merchantName.trim()) && !BUSINESS_WORDS.test(merchantName);
  if (looksLikePerson || /\b(transfer|sent to|split|upi to)\b/i.test(description)) {
    const family = /\b(mom|dad|mother|father|bhai|didi|family)\b/i.test(`${merchantName} ${description}`);
    const split = /\bsplit\b/i.test(description);
    return { category: 'p2p', sub: family ? 'family' : split ? 'split' : 'friends', confidence: looksLikePerson ? 0.8 : 0.7, source: 'rule', merchantId: null, reasoning: 'Looks like a payment to a person.' };
  }

  return { category: 'shopping', sub: 'marketplace', confidence: 0.35, source: 'rule', merchantId: null, reasoning: 'Unknown merchant — needs review.', needsReview: true };
}

/** Parse a Paytm-style CSV export. Accepts common column names. */
export function parseCsv(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (lines.length < 2) throw new Error('The CSV has no rows.');
  const split = (line) => { const out = []; let cur = '', q = false; for (const ch of line) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map((s) => s.trim()); };
  const head = split(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z]/g, ''));
  const col = (...names) => head.findIndex((h) => names.includes(h));
  const iDate = col('date', 'transactiondate', 'datetime', 'timestamp', 'time');
  const iAmt = col('amount', 'amountrs', 'amountinr', 'debit', 'value');
  const iMer = col('merchant', 'merchantname', 'paidto', 'to', 'payee', 'description', 'narration');
  const iDesc = col('remarks', 'note', 'comment', 'details', 'activity');
  const iMethod = col('paymentmethod', 'mode', 'method', 'instrument');
  const iStatus = col('status');
  if (iDate < 0 || iAmt < 0 || iMer < 0) throw new Error('The CSV needs date, amount and merchant columns.');
  const rows = [];
  for (const line of lines.slice(1)) {
    const c = split(line);
    const amount = Math.abs(Number(String(c[iAmt]).replace(/[₹,\s]|rs\.?/gi, '')));
    const d = new Date(c[iDate]);
    if (!Number.isFinite(amount) || amount <= 0 || Number.isNaN(d.getTime())) continue;
    rows.push({
      timestamp: d.toISOString(), amount, merchantName: c[iMer] || 'Unknown', description: iDesc >= 0 ? c[iDesc] : '',
      paymentMethod: iMethod >= 0 ? c[iMethod] || 'UPI' : 'UPI', status: iStatus >= 0 ? (/fail/i.test(c[iStatus]) ? 'failed' : /pend/i.test(c[iStatus]) ? 'pending' : 'completed') : 'completed',
    });
  }
  if (!rows.length) throw new Error('No valid rows found. Check the date and amount columns.');
  return rows;
}
