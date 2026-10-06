// Deterministic UPI ingestion: validate → normalise → filter junk → de-duplicate →
// categorise → store. The same input always produces the same outcome; no AI here.
import { db, json, uid, tx } from '../db.js';
import { categorize } from '../engine/categorize.js';
import { userRules } from '../lib/store.js';
import { CATEGORY, MERCHANT } from '../data/catalog.js';
import { DEFAULT_SETTINGS } from '../seed.js';

export const MAX_BATCH = 1000;
const MAX_AMOUNT = 1_000_000;           // ₹10 lakh: above any UPI per-transaction limit
const MAX_AGE_MS = 3 * 365 * 864e5;     // older than 3 years is not useful for behaviour
const FUTURE_SKEW_MS = 5 * 60 * 1000;   // tolerate 5 minutes of clock skew

/** Outcome codes. `rejected` = invalid input (fix and resend); `filtered` = valid but not spending. */
export const REJECT_CODES = {
  missing_field: 'A required field is missing.',
  invalid_phone: 'Phone must be a 10-digit Indian mobile number (optionally prefixed with +91 or 0).',
  invalid_amount: `Amount must be a positive number of rupees up to ${MAX_AMOUNT.toLocaleString('en-IN')}.`,
  invalid_timestamp: 'Timestamp must be ISO 8601 and not in the future.',
  invalid_vpa: 'UPI IDs look like name@handle.',
  invalid_status: 'Status must be one of success, failed, pending, reversed.',
  invalid_direction: 'Direction must be debit or credit.',
  invalid_currency: 'Only INR is supported.',
  invalid_mcc: 'MCC must be 4 digits.',
  field_too_long: 'A field is longer than allowed.',
  user_not_linked: 'This phone belongs to a user who is not linked to your account. They can link it by signing in with your app.',
};
export const FILTER_CODES = {
  credit_ignored: 'Money received is not spending, so it is not stored.',
  pending_ignored: 'Pending payments are stored once they settle — send the final status.',
  self_transfer: 'Transfer between the user’s own accounts.',
  test_payment: 'Penny-drop / verification payment (₹1 or less with a test marker).',
  too_old: 'Older than 3 years.',
};

// Merchant Category Code → our taxonomy (ISO 18245 groups most relevant to UPI).
const MCC = [
  [['5812', '5813'], 'food', 'restaurants'], [['5814'], 'food', 'food_delivery'], [['5411', '5422', '5441', '5451', '5499'], 'food', 'groceries'], [['5462'], 'food', 'street_food'],
  [['4121'], 'transport', 'cabs'], [['4111', '4112', '4131'], 'transport', 'bus_train'], [['4511', '4582'], 'transport', 'flights'], [['7011', '4722'], 'transport', 'hotels'], [['5541', '5542', '5983'], 'transport', 'fuel'],
  [['4812', '4814'], 'bills', 'mobile'], [['4899'], 'bills', 'internet'], [['4900'], 'bills', 'electricity'], [['6300', '6381'], 'bills', 'insurance'], [['6513'], 'bills', 'rent'],
  [['5045', '5732', '5734'], 'shopping', 'electronics'], [['5611', '5621', '5631', '5651', '5661', '5691', '5699'], 'shopping', 'fashion'], [['5977'], 'shopping', 'beauty'], [['5200', '5712', '5719'], 'shopping', 'home'], [['5311', '5399', '5964'], 'shopping', 'marketplace'],
  [['4841', '5815'], 'entertainment', 'streaming'], [['5816'], 'entertainment', 'gaming'], [['5817', '5818'], 'entertainment', 'software'], [['7832', '7922', '7996'], 'entertainment', 'events'], [['7997'], 'entertainment', 'fitness'],
  [['5912', '8011', '8021', '8062', '8071', '8099'], 'personal', 'healthcare'], [['8211', '8220', '8299'], 'personal', 'education'], [['8398', '8661'], 'personal', 'donations'], [['6211'], 'personal', 'investments'], [['6012', '6051'], 'personal', 'emi'],
];
export const MCC_MAP = Object.fromEntries(MCC.flatMap(([codes, category, sub]) => codes.map((c) => [c, { category, sub }])));

// ── Normalisers ──────────────────────────────────────────────────────────────
export function normalizePhone(v) {
  if (v == null) return null;
  let d = String(v).replace(/[\s\-().]/g, '');
  if (d.startsWith('+91')) d = d.slice(3); else if (d.startsWith('91') && d.length === 12) d = d.slice(2); else if (d.startsWith('0') && d.length === 11) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}
const VPA_RE = /^[a-z0-9][a-z0-9._-]{1,255}@[a-z][a-z0-9.-]{1,63}$/i;
export const normalizeVpa = (v) => (v == null || v === '' ? undefined : VPA_RE.test(String(v).trim()) ? String(v).trim().toLowerCase() : null);
export const maskPhone = (p) => `••••••${p.slice(-4)}`;

const PREFIXES = /^(upi[-/ ]|paytm\s*\*|pytm\s*\*|bharatpe[-\s]|phonepe\s*\*|razorpay\s*\*|rzp\s*\*|payu\s*\*|cashfree\s*\*|ccavenue\s*\*|billdesk\s*\*|pine\s*labs\s*\*)+/i;
const SUFFIXES = /\b(pvt\.?|private|ltd\.?|limited|llp|inc\.?|india|technologies|tech|services|retail)\b\.?/gi;
const GATEWAY_TOKENS = /\b(payu|rzp|razorpay|paytm|pytm|cashfree|billdesk|ccavenue|pg|pay|upi|merchant|mer)\b/gi;
const titleCase = (s) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(Upi|Atm|Emi|Lic|Irctc|Hp|Bbq|Kfc|Ola|Dmart)\b/g, (m) => m.toUpperCase());

/** Display name for the payee: strip gateway prefixes, ids and legal suffixes; fall back to the VPA. */
export function cleanMerchantName(name, vpa) {
  let n = String(name || '').replace(PREFIXES, '').replace(/[_*#|]+/g, ' ').replace(/\s*[-/]?\s*\b\d{5,}\b/g, ' ').replace(SUFFIXES, ' ').replace(/\s{2,}/g, ' ').trim();
  if (!n && vpa) {
    const local = vpa.split('@')[0];
    if (/^\d{10}$/.test(local)) return `Mobile ${maskPhone(local)}`;
    n = local.replace(/[._-]+/g, ' ').replace(GATEWAY_TOKENS, ' ').replace(/\b\d+\b/g, '').replace(/\s{2,}/g, ' ').trim() || local;
  }
  if (!n) return 'Unknown payee';
  if (n === n.toUpperCase() || n === n.toLowerCase()) n = titleCase(n);
  return n.slice(0, 80);
}

const STATUS = { success: 'completed', successful: 'completed', completed: 'completed', failed: 'failed', failure: 'failed', declined: 'failed', pending: 'pending', reversed: 'reversed', refunded: 'reversed' };
const str = (v, max) => (v == null ? undefined : String(v).trim().slice(0, max + 1));

/** Validate and normalise one raw event. Returns { ok, value } or { ok:false, code, param }. */
export function validate(e) {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return { ok: false, code: 'missing_field', param: 'body' };
  for (const f of ['id', 'phone', 'amount', 'timestamp']) if (e[f] == null || e[f] === '') return { ok: false, code: 'missing_field', param: f };
  const id = String(e.id).trim();
  if (id.length > 64) return { ok: false, code: 'field_too_long', param: 'id' };
  const phone = normalizePhone(e.phone);
  if (!phone) return { ok: false, code: 'invalid_phone', param: 'phone' };
  const amount = typeof e.amount === 'string' ? Number(e.amount.replace(/[₹,\s]/g, '')) : Number(e.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) return { ok: false, code: 'invalid_amount', param: 'amount' };
  const ts = new Date(e.timestamp);
  if (Number.isNaN(ts.getTime()) || typeof e.timestamp === 'number' && e.timestamp < 1e12) return { ok: false, code: 'invalid_timestamp', param: 'timestamp' };
  if (ts.getTime() > Date.now() + FUTURE_SKEW_MS) return { ok: false, code: 'invalid_timestamp', param: 'timestamp' };
  const currency = String(e.currency || 'INR').toUpperCase();
  if (currency !== 'INR') return { ok: false, code: 'invalid_currency', param: 'currency' };
  const direction = String(e.direction || 'debit').toLowerCase();
  if (!['debit', 'credit'].includes(direction)) return { ok: false, code: 'invalid_direction', param: 'direction' };
  const status = STATUS[String(e.status || 'success').toLowerCase()];
  if (!status) return { ok: false, code: 'invalid_status', param: 'status' };
  const payerVpa = normalizeVpa(e.payer_vpa), payeeVpa = normalizeVpa(e.payee_vpa);
  if (payerVpa === null) return { ok: false, code: 'invalid_vpa', param: 'payer_vpa' };
  if (payeeVpa === null) return { ok: false, code: 'invalid_vpa', param: 'payee_vpa' };
  if (!payeeVpa && !e.payee_name) return { ok: false, code: 'missing_field', param: 'payee_vpa' };
  const mcc = e.mcc == null || e.mcc === '' ? undefined : String(e.mcc).padStart(4, '0');
  if (mcc && !/^\d{4}$/.test(mcc)) return { ok: false, code: 'invalid_mcc', param: 'mcc' };
  for (const [f, max] of [['payee_name', 120], ['note', 200], ['rrn', 32], ['app', 32]]) if (e[f] != null && String(e[f]).length > max) return { ok: false, code: 'field_too_long', param: f };
  return {
    ok: true,
    value: {
      id, phone, amount: Math.round(amount * 100) / 100, ts, direction, status, payerVpa, payeeVpa, mcc,
      payeeName: str(e.payee_name, 120), note: str(e.note, 200) || '', rrn: str(e.rrn, 32), app: str(e.app, 32),
      user: e.user && typeof e.user === 'object' ? { name: str(e.user.name, 80), city: str(e.user.city, 60) } : null,
    },
  };
}

/** Junk filter: valid input that is not consumer spending. */
function filterReason(v, knownVpas) {
  if (v.direction === 'credit') return 'credit_ignored';
  if (v.status === 'pending') return 'pending_ignored';
  if (Date.now() - v.ts.getTime() > MAX_AGE_MS) return 'too_old';
  if (v.payeeVpa && (v.payeeVpa === v.payerVpa || knownVpas.has(v.payeeVpa))) return 'self_transfer';
  if (v.amount <= 1 && /\b(test|verify|verification|penny|validation)\b/i.test(`${v.note} ${v.payeeName || ''}`)) return 'test_payment';
  return null;
}

/** Categorise: user rules > known merchant (name/VPA) > MCC > keywords > person/P2P heuristics. */
export function classify(v, rules) {
  const merchantName = cleanMerchantName(v.payeeName, v.payeeVpa);
  const handle = v.payeeVpa ? v.payeeVpa.split('@')[0].replace(/[._-]+/g, ' ') : '';
  const base = categorize({ merchantName, description: `${v.note} ${handle}`, amount: v.amount }, rules);
  if (base.source === 'user') return { ...base, merchantName };
  // Merchant UPI IDs start with the brand (hm.payu@…, swiggy.rzp@…): an exact match on the first token is decisive.
  const brand = v.payeeVpa?.split('@')[0].split(/[._-]/)[0];
  if (brand && MERCHANT[brand] && brand !== base.merchantId) {
    const M = MERCHANT[brand];
    return { category: M.category, sub: M.sub, confidence: 0.98, source: 'rule', merchantId: brand, reasoning: `UPI ID belongs to ${M.name}.`, merchantName: M.name };
  }
  if (base.merchantId) return { ...base, merchantName: MERCHANT[base.merchantId]?.name || merchantName };
  const m = v.mcc && MCC_MAP[v.mcc];
  if (m) return { category: m.category, sub: m.sub, confidence: 0.93, source: 'mcc', merchantId: null, reasoning: `MCC ${v.mcc} → ${CATEGORY[m.category].subs[m.sub]}.`, merchantName };
  // A phone-number VPA with no business signal is a person.
  if (base.needsReview && /^\d{10}$/.test(v.payeeVpa?.split('@')[0] || '')) return { category: 'p2p', sub: 'friends', confidence: 0.75, source: 'rule', merchantId: null, reasoning: 'Paid to a mobile-number UPI ID.', merchantName };
  return { ...base, merchantName };
}

export const linkOf = (userId, partnerId) => db.prepare('SELECT * FROM user_partners WHERE user_id = ? AND partner_id = ?').get(userId, partnerId);
export function link(userId, partnerId, { owner = false, via }) {
  db.prepare('INSERT INTO user_partners (user_id, partner_id, owner, linked_via) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, partner_id) DO NOTHING').run(userId, partnerId, owner ? 1 : 0, via);
}

/** Existing users must already be linked to this partner — a partner cannot attach itself to someone else's user. */
function findOrCreateUser(phone, hint, partner) {
  const u = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (u && !linkOf(u.id, partner.id)) return { notLinked: true };
  if (u) {
    if (hint?.name && /^UPI user/.test(u.name)) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(hint.name, u.id);
    if (hint?.city && !u.city) db.prepare('UPDATE users SET city = ? WHERE id = ?').run(hint.city, u.id);
    return { user: u, created: false };
  }
  const id = uid();
  db.prepare(`INSERT INTO users (id, email, name, password_hash, phone, source, city, period_months, data_source, settings)
    VALUES (?, ?, ?, '!', ?, 'partner', ?, 12, ?, ?)`).run(id, `${phone}@phone.spendtracker.local`, hint?.name || `UPI user ${maskPhone(phone)}`, phone, hint?.city || null, partner.slug, json.str(DEFAULT_SETTINGS));
  link(id, partner.id, { owner: true, via: 'ingest' });
  return { user: db.prepare('SELECT * FROM users WHERE id = ?').get(id), created: true };
}

/**
 * Process events for one partner inside a single DB transaction.
 * Each result: { id, status: accepted|updated|duplicate|filtered|rejected, code?, message?, param?, transaction? }
 */
export function ingest(partner, events) {
  const results = [];
  const ruleCache = new Map(), vpaCache = new Map();
  const rulesFor = (userId) => ruleCache.get(userId) || ruleCache.set(userId, userRules(userId)).get(userId);
  const vpasFor = (userId) => vpaCache.get(userId) || vpaCache.set(userId, new Set(db.prepare('SELECT vpa FROM user_vpas WHERE user_id = ?').all(userId).map((r) => r.vpa))).get(userId);
  const byExt = db.prepare('SELECT id, user_id, status FROM transactions WHERE partner_id = ? AND external_id = ?');
  const byRrn = db.prepare('SELECT id FROM transactions WHERE user_id = ? AND rrn = ?');
  const ins = db.prepare(`INSERT INTO transactions (id, user_id, ts, amount, merchant_name, merchant_id, category, sub, confidence, cat_source, description, payment_method, status, partner_id, external_id, rrn, payer_vpa, payee_vpa, mcc)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'UPI', ?, ?, ?, ?, ?, ?, ?)`);
  const upVpa = db.prepare(`INSERT INTO user_vpas (user_id, vpa, first_seen, last_seen, payments) VALUES (?, ?, ?, ?, 1)
    ON CONFLICT(user_id, vpa) DO UPDATE SET payments = payments + 1, last_seen = MAX(last_seen, excluded.last_seen), first_seen = MIN(first_seen, excluded.first_seen)`);
  const newUsers = new Set();

  tx(() => {
    for (const raw of events) {
      const ref = raw && typeof raw === 'object' && raw.id != null ? String(raw.id).slice(0, 64) : null;
      const v = validate(raw);
      if (!v.ok) { results.push({ id: ref, status: 'rejected', code: v.code, param: v.param, message: REJECT_CODES[v.code] }); continue; }
      const e = v.value;
      const found = findOrCreateUser(e.phone, e.user, partner);
      if (found.notLinked) { results.push({ id: e.id, status: 'rejected', code: 'user_not_linked', param: 'phone', message: REJECT_CODES.user_not_linked }); continue; }
      const { user, created } = found;
      if (created) newUsers.add(user.id);
      const known = vpasFor(user.id);

      // Status transitions for a payment we already have (e.g. success → reversed).
      const prior = byExt.get(partner.id, e.id);
      if (prior) {
        const next = e.status === 'reversed' ? 'failed' : e.status;
        if (e.status !== 'pending' && next !== prior.status) {
          db.prepare("UPDATE transactions SET status = ?, updated_at = datetime('now') WHERE id = ?").run(next, prior.id);
          results.push({ id: e.id, status: 'updated', message: `Status changed to ${e.status}.`, transaction: { transaction_id: prior.id } });
        } else results.push({ id: e.id, status: 'duplicate', message: 'Already received with this id.', transaction: { transaction_id: prior.id } });
        continue;
      }
      if (e.rrn && byRrn.get(user.id, e.rrn)) { results.push({ id: e.id, status: 'duplicate', code: 'rrn_seen', message: 'A payment with this RRN is already stored.' }); continue; }

      if (e.payerVpa) { upVpa.run(user.id, e.payerVpa, e.ts.toISOString(), e.ts.toISOString()); known.add(e.payerVpa); }
      const why = filterReason(e, known);
      if (why) { results.push({ id: e.id, status: 'filtered', code: why, message: FILTER_CODES[why] }); continue; }

      const c = classify(e, rulesFor(user.id));
      const id = uid();
      ins.run(id, user.id, e.ts.toISOString(), e.amount, c.merchantName, c.merchantId, c.category, c.sub, c.confidence, c.source, e.note, e.status === 'reversed' ? 'failed' : e.status, partner.id, e.id, e.rrn || null, e.payerVpa || null, e.payeeVpa || null, e.mcc || null);
      if (!db.prepare('SELECT data_source FROM users WHERE id = ?').get(user.id).data_source) db.prepare('UPDATE users SET data_source = ? WHERE id = ?').run(partner.slug, user.id);
      results.push({ id: e.id, status: 'accepted', transaction: { transaction_id: id, user: { phone: maskPhone(e.phone), created }, merchant: c.merchantName, category: c.category, subcategory: c.sub, confidence: +c.confidence.toFixed(2), categorised_by: c.source } });
    }
  });

  const count = (s) => results.filter((r) => r.status === s).length;
  return {
    received: events.length, accepted: count('accepted'), updated: count('updated'), duplicates: count('duplicate'), filtered: count('filtered'), rejected: count('rejected'),
    users_created: newUsers.size, results,
  };
}
