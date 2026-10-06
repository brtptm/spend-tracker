// Partner Integration API v1 — for partners (Paytm first), not end users.
// Auth: `Authorization: Bearer stk_live_…` (or `X-Api-Key`). Users are identified by phone number.
import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import { db, json } from '../db.js';
import { verifyKey, touchKey, newId } from '../partner/keys.js';
import { ingest, normalizePhone, MAX_BATCH, maskPhone, linkOf } from '../partner/ingest.js';
import { loadTxns, profileFor, adState } from '../lib/store.js';
import { summarize, subscriptions } from '../engine/analytics.js';
import { buildAnalysis, insights, recommendations, rankOffers } from '../engine/insights.js';
import { CATEGORIES, CATEGORY, MERCHANT } from '../data/catalog.js';
import { CAMPAIGNS } from '../data/offers.js';
import { SPEC, openapi } from '../partner/spec.js';

const r = Router();
const DAY = 864e5, MONTH_DAYS = 30.44;
const DOCS = '/docs';

// ── Plumbing: request ids, error envelope, body parsing (JSON or beacon text/plain) ──
export class ApiError extends Error {
  constructor(status, type, code, message, param) { super(message); Object.assign(this, { status, type, code, param }); }
}
const err = {
  invalid: (code, message, param) => new ApiError(400, 'invalid_request_error', code, message, param),
  auth: (message) => new ApiError(401, 'authentication_error', 'invalid_api_key', message),
  scope: (scope) => new ApiError(403, 'permission_error', 'missing_scope', `This key lacks the \`${scope}\` scope.`),
  consent: () => new ApiError(403, 'permission_error', 'consent_required', 'This user has not consented to share spending insights.'),
  notFound: (code, message) => new ApiError(404, 'not_found_error', code, message),
};

r.use((req, res, next) => {
  req.id = `req_${crypto.randomBytes(9).toString('base64url')}`;
  res.set('X-Request-Id', req.id);
  res.set('Cache-Control', 'no-store');
  next();
});
r.use(express.json({ limit: '6mb' }));
r.use(express.text({ type: ['text/plain', 'application/x-ndjson'], limit: '6mb' }));
r.use((req, _res, next) => {
  if (typeof req.body === 'string' && req.body.trim()) {
    const t = req.body.trim();
    const ndjson = req.is('application/x-ndjson') || (!t.startsWith('[') && t.includes('\n'));
    try { req.body = ndjson ? t.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l)) : JSON.parse(t); }
    catch { return next(err.invalid('invalid_json', 'Body is not valid JSON.')); }
  }
  next();
});

// Public: machine-readable spec for the docs site and OpenAPI tooling.
r.get('/spec', (_req, res) => res.json(SPEC));
r.get('/openapi.json', (_req, res) => res.json(openapi()));

// ── Auth + per-key rate limits ──
function authenticate(req, _res, next) {
  const h = req.get('authorization') || '';
  const secret = h.startsWith('Bearer ') ? h.slice(7).trim() : (req.get('x-api-key') || '').trim();
  if (!secret) return next(err.auth('Send your API key as `Authorization: Bearer stk_live_…`.'));
  const k = verifyKey(secret);
  if (!k) return next(err.auth('This API key is invalid or revoked.'));
  req.key = k; req.partner = { id: k.partner_id, slug: k.partner_slug, name: k.partner_name };
  req.scopes = new Set(json.parse(k.scopes, []));
  touchKey(k.id);
  next();
}
const need = (scope) => (req, _res, next) => next(req.scopes.has(scope) ? undefined : err.scope(scope));
const perKey = (limit, windowMs = 60_000) => rateLimit({
  windowMs, limit, standardHeaders: 'draft-8', legacyHeaders: false, keyGenerator: (req) => req.key.id,
  handler: (req, res) => res.status(429).json({ error: { type: 'rate_limit_error', code: 'rate_limited', message: `Too many requests for this key. Limit: ${limit} per minute.`, doc_url: `${DOCS}#rate-limits` }, request_id: req.id }),
});

r.use(authenticate);

// ── Ingest ───────────────────────────────────────────────────────────────────
function logIngest(req, kind, out, ms, idem) {
  const id = newId('ing');
  db.prepare(`INSERT INTO ingest_log (id, partner_id, key_id, kind, idempotency_key, received, accepted, duplicates, filtered, rejected, results, duration_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(id, req.partner.id, req.key.id, kind, idem || null, out.received, out.accepted + out.updated, out.duplicates, out.filtered, out.rejected, json.str(out), ms);
  return id;
}

/** Single payment — webhook / beacon style. 202 unless the event itself is invalid (422, do not retry). */
r.post('/events', perKey(1200), need('transactions:write'), (req, res) => {
  const t0 = performance.now();
  const body = req.body && req.body.object === 'event' && req.body.data ? req.body.data : req.body; // accept {type, data} envelopes too
  const out = ingest(req.partner, [body]);
  const ingestId = logIngest(req, 'event', out, Math.round(performance.now() - t0));
  const result = out.results[0];
  res.status(result.status === 'rejected' ? 422 : 202).json({ object: 'ingest_result', ingest_id: ingestId, ...result });
});

/** Batch up to 1,000 payments. Idempotent with the `Idempotency-Key` header. */
r.post('/transactions/batch', perKey(120), need('transactions:write'), (req, res) => {
  const idem = req.get('idempotency-key')?.slice(0, 120);
  if (idem) {
    const prev = db.prepare('SELECT id, results FROM ingest_log WHERE partner_id = ? AND idempotency_key = ?').get(req.partner.id, idem);
    if (prev) { res.set('Idempotent-Replayed', 'true'); return res.json({ object: 'batch_result', batch_id: prev.id, ...json.parse(prev.results) }); }
  }
  const list = Array.isArray(req.body) ? req.body : req.body?.transactions;
  if (!Array.isArray(list)) throw err.invalid('invalid_body', 'Send `{ "transactions": [ … ] }`, a JSON array, or NDJSON.', 'transactions');
  if (!list.length) throw err.invalid('empty_batch', 'The batch is empty.', 'transactions');
  if (list.length > MAX_BATCH) throw err.invalid('batch_too_large', `A batch can hold at most ${MAX_BATCH} transactions; this one has ${list.length}.`, 'transactions');
  const t0 = performance.now();
  const out = ingest(req.partner, list);
  const batchId = logIngest(req, 'batch', out, Math.round(performance.now() - t0), idem);
  res.json({ object: 'batch_result', batch_id: batchId, ...out });
});

r.get('/ingest/logs', perKey(300), need('transactions:write'), (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const rows = db.prepare('SELECT id, kind, received, accepted, duplicates, filtered, rejected, duration_ms, created_at FROM ingest_log WHERE partner_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?').all(req.partner.id, limit);
  res.json({ object: 'list', data: rows.map((x) => ({ object: 'ingest_log', ...x, created_at: x.created_at.replace(' ', 'T') + 'Z' })) });
});
r.get('/ingest/logs/:id', perKey(300), need('transactions:write'), (req, res) => {
  const x = db.prepare('SELECT * FROM ingest_log WHERE id = ? AND partner_id = ?').get(req.params.id, req.partner.id);
  if (!x) throw err.notFound('ingest_log_not_found', 'No ingest log with this id.');
  res.json({ object: 'ingest_log', id: x.id, kind: x.kind, created_at: x.created_at.replace(' ', 'T') + 'Z', duration_ms: x.duration_ms, ...json.parse(x.results) });
});

// ── Users (by phone) ─────────────────────────────────────────────────────────
/**
 * Tenant scoping: a partner only sees users linked to it — users it onboarded (data_source) or whose
 * payments it sent. Anyone else is reported as not found, so existence never leaks across partners.
 */
export const linkedTo = (u, partner) => !!(u && linkOf(u.id, partner.id));
/** Effective consent = the user's own switch in the app AND this partner's link. */
const consentFor = (u, partner) => !!u.consent_partner && !!linkOf(u.id, partner.id)?.consent;
function userByPhone(req, { consent = true } = {}) {
  const phone = normalizePhone(req.params.phone);
  if (!phone) throw err.invalid('invalid_phone', 'Phone must be a 10-digit Indian mobile number.', 'phone');
  const u = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!u || !linkedTo(u, req.partner)) throw err.notFound('user_not_found', 'No user with this phone number. Send their payments first.');
  if (consent && !consentFor(u, req.partner)) throw err.consent();
  return u;
}
/** Users this partner onboarded itself (it is their consent controller). */
const ownedBy = (u, partner) => !!linkOf(u.id, partner.id)?.owner;

/** Window from ?period= or ?from=&to= (inclusive dates). Default: last 30 days. */
function windowFrom(q, txns) {
  const now = new Date();
  const mk = (start, end, period, label) => {
    const days = Math.max(1, (end - start) / DAY);
    return { period, label, start, end, days, monthsEq: days / MONTH_DAYS };
  };
  if (q.from || q.to) {
    const from = q.from ? new Date(q.from) : null, to = q.to ? new Date(q.to) : now;
    if ((q.from && Number.isNaN(from?.getTime())) || Number.isNaN(to.getTime())) throw err.invalid('invalid_range', '`from` and `to` must be ISO dates (YYYY-MM-DD).', q.from ? 'from' : 'to');
    if (/^\d{4}-\d{2}-\d{2}$/.test(q.to || '')) to.setUTCHours(23, 59, 59, 999);
    const start = from || new Date(to - 30 * DAY);
    if (start > to) throw err.invalid('invalid_range', '`from` must be before `to`.', 'from');
    if (to - start > 731 * DAY) throw err.invalid('range_too_long', 'A range can span at most 24 months.', 'from');
    return mk(start, to, 'custom', `${start.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}`);
  }
  if (q.month) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(q.month)) throw err.invalid('invalid_month', '`month` must look like 2026-09.', 'month');
    const [y, m] = q.month.split('-').map(Number);
    const start = new Date(y, m - 1, 1), end = new Date(Math.min(new Date(y, m, 1) - 1, now));
    if (start > now) throw err.invalid('invalid_month', '`month` is in the future.', 'month');
    return mk(start, end, 'month', start.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }));
  }
  const p = q.period || '30d';
  const y = now.getFullYear(), m = now.getMonth();
  if (p === 'overall') return mk(txns[0]?.ts || now, now, 'overall', 'All time');
  if (p === 'month') return mk(new Date(y, m, 1), now, 'month', 'This month');
  if (p === 'last_month') return mk(new Date(y, m - 1, 1), new Date(new Date(y, m, 1) - 1), 'last_month', 'Last month');
  if (/^(3|6|12)m$/.test(p)) return mk(new Date(y, m - parseInt(p, 10), now.getDate()), now, p, `Last ${parseInt(p, 10)} months`);
  if (p === '7d' || p === '30d' || p === '90d') return mk(new Date(now - parseInt(p, 10) * DAY), now, p, `Last ${parseInt(p, 10)} days`);
  throw err.invalid('invalid_period', '`period` must be one of 7d, 30d, 90d, month, last_month, 3m, 6m, 12m, overall.', 'period');
}
const iso = (d) => new Date(d).toISOString();
const windowOut = (R) => ({ period: R.period, label: R.label, from: iso(R.start), to: iso(R.end), days: Math.round(R.days) });
const money = (n) => Math.round(n);

function categoriesOut(S, prev) {
  return S.byCategory.map((c) => ({
    category: c.id, name: c.name, amount: c.amount, share: c.percentage / 100, transactions: c.count,
    change_vs_previous: prev ? changeOf(c.amount, prev.byCategory.find((p) => p.id === c.id)?.amount) : undefined,
  }));
}
const changeOf = (now, before) => (before ? +((now - before) / before).toFixed(3) : null);
function previousOf(txns, R) {
  const len = R.end - R.start;
  return summarize(txns, { ...R, start: new Date(R.start - len), end: new Date(R.start - 1), monthsEq: len / (MONTH_DAYS * DAY) });
}
const userRow = (u, partner) => {
  const st = db.prepare("SELECT COUNT(*) n, MIN(ts) first, MAX(ts) last FROM transactions WHERE user_id = ?").get(u.id);
  return {
    object: 'user', phone: u.phone, name: /^UPI user/.test(u.name) ? null : u.name, city: u.city, source: u.source,
    consent: { share_insights: consentFor(u, partner), ad_personalization: !!u.ad_personalization },
    transactions: st.n, first_payment_at: st.first, last_payment_at: st.last, created_at: u.created_at.replace(' ', 'T') + 'Z',
    upi_ids: db.prepare('SELECT vpa, payments, first_seen, last_seen FROM user_vpas WHERE user_id = ? ORDER BY last_seen DESC').all(u.id),
  };
};

const read = [perKey(600), need('users:read')];

r.get('/users/:phone', ...read, (req, res) => res.json(userRow(userByPhone(req), req.partner)));

r.get('/users/:phone/summary', ...read, (req, res) => {
  const u = userByPhone(req);
  const txns = loadTxns(u.id);
  const R = windowFrom(req.query, txns);
  const S = summarize(txns, R), P = previousOf(txns, R);
  res.json({
    object: 'summary', phone: u.phone, currency: 'INR', window: windowOut(R),
    total_spent: S.totalSpending, transactions: S.transactionCount, failed_transactions: S.failedCount,
    average_daily: S.averageDailySpend, average_ticket: S.averageTicket, monthly_equivalent: S.monthlyEquivalent,
    previous_window: { total_spent: P.totalSpending, change: changeOf(S.totalSpending, P.totalSpending) },
    top_category: S.byCategory[0]?.id || null, categories: categoriesOut(S, P),
    top_merchants: S.byMerchant.slice(0, 5).map((m) => ({ name: m.name, merchant_id: MERCHANT[m.id] ? m.id : null, amount: m.amount, transactions: m.count })),
  });
});

r.get('/users/:phone/categories', ...read, (req, res) => {
  const u = userByPhone(req);
  const txns = loadTxns(u.id);
  const R = windowFrom(req.query, txns);
  const S = summarize(txns, R), P = previousOf(txns, R);
  const inR = txns.filter((t) => t.status === 'completed' && t.ts >= R.start && t.ts <= R.end);
  res.json({
    object: 'category_breakdown', phone: u.phone, currency: 'INR', window: windowOut(R), total_spent: S.totalSpending,
    categories: categoriesOut(S, P).map((c) => {
      const subs = new Map();
      for (const t of inR.filter((t) => t.category === c.category)) { const s = subs.get(t.sub) || { amount: 0, n: 0 }; s.amount += t.amount; s.n++; subs.set(t.sub, s); }
      return { ...c, subcategories: [...subs.entries()].sort((a, b) => b[1].amount - a[1].amount).map(([id, s]) => ({ subcategory: id, name: CATEGORY[c.category].subs[id] || id, amount: money(s.amount), transactions: s.n })) };
    }),
  });
});

/** Merchants and apps the user pays, with preference within each subcategory (e.g. Swiggy vs Zomato). */
r.get('/users/:phone/merchants', ...read, (req, res) => {
  const u = userByPhone(req);
  const txns = loadTxns(u.id);
  const R = windowFrom(req.query, txns);
  const inR = txns.filter((t) => t.status === 'completed' && t.ts >= R.start && t.ts <= R.end);
  const includeP2P = req.query.include_p2p === 'true';
  const by = new Map();
  for (const t of inR) {
    if (!includeP2P && t.category === 'p2p') continue;
    const k = t.merchantId || t.merchant;
    const m = by.get(k) || { name: MERCHANT[t.merchantId]?.name || t.merchant, merchant_id: t.merchantId || null, category: t.category, subcategory: t.sub, amount: 0, transactions: 0, first: t.ts, last: t.ts };
    m.amount += t.amount; m.transactions++; if (t.ts < m.first) m.first = t.ts; if (t.ts > m.last) m.last = t.ts;
    by.set(k, m);
  }
  const list = [...by.values()].sort((a, b) => b.amount - a.amount);
  const subTotals = new Map(); for (const m of list) subTotals.set(m.subcategory, (subTotals.get(m.subcategory) || 0) + m.amount);
  const total = list.reduce((s, m) => s + m.amount, 0) || 1;
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
  res.json({
    object: 'merchant_list', phone: u.phone, currency: 'INR', window: windowOut(R),
    data: list.slice(0, limit).map((m) => ({
      name: m.name, merchant_id: m.merchant_id, is_known_app: !!m.merchant_id, category: m.category, subcategory: m.subcategory,
      amount: money(m.amount), transactions: m.transactions, average_ticket: money(m.amount / m.transactions), share_of_spend: +(m.amount / total).toFixed(3),
      share_of_subcategory: +(m.amount / subTotals.get(m.subcategory)).toFixed(3), first_payment_at: iso(m.first), last_payment_at: iso(m.last),
      frequency_per_month: +(m.transactions / R.monthsEq).toFixed(1),
    })),
    has_more: list.length > limit,
  });
});

/** Behaviour & preferences: who this user is as a spender. Deterministic. */
r.get('/users/:phone/behavior', ...read, (req, res) => {
  const u = userByPhone(req);
  const txns = loadTxns(u.id);
  if (!txns.length) throw err.notFound('no_data', 'This user has no payments yet.');
  const p = profileFor(u, txns);
  const R = windowFrom({ period: '3m' }, txns);
  const inR = txns.filter((t) => t.status === 'completed' && t.ts >= R.start && t.ts <= R.end);
  // Preferred app per subcategory (e.g. food_delivery → Swiggy 58%).
  const bySub = new Map();
  for (const t of inR) { if (!t.merchantId) continue; const s = bySub.get(t.sub) || new Map(); s.set(t.merchantId, (s.get(t.merchantId) || 0) + t.amount); bySub.set(t.sub, s); }
  const preferred = [...bySub.entries()].map(([sub, m]) => {
    const tot = [...m.values()].reduce((a, b) => a + b, 0);
    const ranked = [...m.entries()].sort((a, b) => b[1] - a[1]);
    return { subcategory: sub, category: MERCHANT[ranked[0][0]].category, apps: ranked.slice(0, 4).map(([id, amt]) => ({ merchant_id: id, name: MERCHANT[id].name, share: +(amt / tot).toFixed(2) })), total: money(tot) };
  }).sort((a, b) => b.total - a.total);
  const subs = subscriptions(txns);
  res.json({
    object: 'behavior', phone: u.phone, as_of: iso(new Date()), basis: 'last 3 months of completed payments',
    spender_type: p.spenderType, spender_label: p.spenderLabel, primary_motivation: p.primaryMotivation,
    monthly_spend: p.monthlySpend, spend_to_income: p.spendToIncome,
    top_categories: p.topCategories, preferred_apps: preferred,
    timing: { peak_hours: p.patterns.peakTimes, peak_days: p.patterns.peakDays, frequency: p.patterns.frequency, transactions_per_month: p.patterns.transactionsPerMonth },
    food: { delivery_orders_per_month: p.food.ordersPerMonth, delivery_share: p.food.deliveryShare, top_dish: p.food.topDish },
    subscriptions: { count: subs.count, monthly: money(subs.total), list: subs.list.map((s) => { const n = new Date(s.lastCharged); n.setMonth(n.getMonth() + 1); return { name: s.merchant, merchant_id: s.merchantId || null, monthly: money(s.monthly), last_charged_at: s.lastCharged, next_charge_estimate: n.toISOString().slice(0, 10) }; }) },
    sensitivity: { discounts: p.sensitivity.toDiscounts, convenience: p.sensitivity.toConvenience, price: p.sensitivity.toPrice },
    coupon_usage_rate: p.couponUsageRate, brand_loyalty: p.brandLoyalty, churn_risk: p.churnRisk,
    predicted: { will_use_discount: p.predictedBehavior.willUseDiscount, will_reduce_spending: p.predictedBehavior.willReduceSpending, will_try_new_service: p.predictedBehavior.willTryNewService },
    upi_ids: db.prepare('SELECT vpa FROM user_vpas WHERE user_id = ? ORDER BY last_seen DESC').all(u.id).map((x) => x.vpa),
  });
});

/** Monthly report: totals, daily series, categories, merchants, subscriptions and deterministic insights. */
r.get('/users/:phone/report', ...read, (req, res) => {
  const u = userByPhone(req);
  const txns = loadTxns(u.id);
  const now = new Date();
  const month = req.query.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const R = windowFrom({ month }, txns);
  const S = summarize(txns, R), P = previousOf(txns, R);
  const daily = new Map();
  for (const t of txns) if (t.status === 'completed' && t.ts >= R.start && t.ts <= R.end) { const d = t.ts.toISOString().slice(0, 10); daily.set(d, (daily.get(d) || 0) + t.amount); }
  // Insights and savings are computed as of the end of the report month, so past reports stay true to that month.
  const asOf = new Date(R.end);
  const A = buildAnalysis(txns.filter((t) => t.ts <= asOf), u, { period: '30d', now: asOf });
  const recs = recommendations(A);
  res.json({
    object: 'monthly_report', phone: u.phone, month, currency: 'INR', window: windowOut(R), complete: R.end < now,
    total_spent: S.totalSpending, transactions: S.transactionCount, failed_transactions: S.failedCount, average_daily: S.averageDailySpend,
    previous_month: { total_spent: P.totalSpending, change: changeOf(S.totalSpending, P.totalSpending) },
    daily: [...daily.entries()].sort().map(([date, amount]) => ({ date, amount: money(amount) })),
    categories: categoriesOut(S, P), top_merchants: S.byMerchant.slice(0, 10).map((m) => ({ name: m.name, merchant_id: MERCHANT[m.id] ? m.id : null, amount: m.amount, transactions: m.count })),
    insights: insights(A, recs).slice(0, 6).map((i) => ({ type: i.type, severity: i.severity, category: i.category, title: i.title, detail: i.description, potential_monthly_saving: i.potentialSavings || 0 })),
    savings_opportunities: recs.filter((x) => !x.oneTime).slice(0, 5).map((x) => ({ id: x.id, title: x.title, category: x.category, monthly_saving: money(x.savingsMonthly) })),
  });
});

r.get('/users/:phone/upi-ids', ...read, (req, res) => {
  const u = userByPhone(req);
  res.json({ object: 'list', phone: u.phone, data: db.prepare('SELECT vpa, payments, first_seen, last_seen FROM user_vpas WHERE user_id = ? ORDER BY last_seen DESC').all(u.id).map((v) => ({ object: 'upi_id', ...v })) });
});

/** Cursor-paginated cleaned transactions (newest first). */
r.get('/users/:phone/transactions', ...read, (req, res) => {
  const u = userByPhone(req);
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 50));
  const conds = ['user_id = ?'], args = [u.id];
  if (req.query.from) { const d = new Date(req.query.from); if (Number.isNaN(d.getTime())) throw err.invalid('invalid_range', '`from` must be an ISO date.', 'from'); conds.push('ts >= ?'); args.push(d.toISOString()); }
  if (req.query.to) { const d = new Date(req.query.to); if (Number.isNaN(d.getTime())) throw err.invalid('invalid_range', '`to` must be an ISO date.', 'to'); if (/^\d{4}-\d{2}-\d{2}$/.test(req.query.to)) d.setUTCHours(23, 59, 59, 999); conds.push('ts <= ?'); args.push(d.toISOString()); }
  if (req.query.category) { if (!CATEGORY[req.query.category]) throw err.invalid('invalid_category', `Unknown category. Use one of ${Object.keys(CATEGORY).join(', ')}.`, 'category'); conds.push('category = ?'); args.push(req.query.category); }
  if (req.query.cursor) {
    let c; try { c = JSON.parse(Buffer.from(req.query.cursor, 'base64url').toString()); } catch { throw err.invalid('invalid_cursor', 'The cursor is not valid.', 'cursor'); }
    conds.push('(ts < ? OR (ts = ? AND id < ?))'); args.push(c.ts, c.ts, c.id);
  }
  const rows = db.prepare(`SELECT * FROM transactions WHERE ${conds.join(' AND ')} ORDER BY ts DESC, id DESC LIMIT ?`).all(...args, limit + 1);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  res.json({
    object: 'list', phone: u.phone, has_more: rows.length > limit, next_cursor: rows.length > limit ? Buffer.from(JSON.stringify({ ts: last.ts, id: last.id })).toString('base64url') : null,
    data: page.map((t) => ({
      object: 'transaction', id: t.id, external_id: t.external_id, timestamp: t.ts, amount: t.amount, currency: 'INR', status: t.status === 'completed' ? 'success' : t.status,
      merchant: { name: t.merchant_name, merchant_id: t.merchant_id }, category: t.category, subcategory: t.sub, confidence: t.confidence, categorised_by: t.cat_source,
      payer_vpa: t.payer_vpa, payee_vpa: t.payee_vpa, mcc: t.mcc, rrn: t.rrn, note: t.description || null,
    })),
  });
});

r.get('/users/:phone/offers', perKey(600), need('offers:read'), (req, res) => {
  const u = userByPhone(req);
  if (!u.ad_personalization) return res.json({ object: 'list', phone: u.phone, personalization: false, data: [] });
  const txns = loadTxns(u.id);
  const A = buildAnalysis(txns, u);
  const o = rankOffers(A, profileFor(u, txns), { personalization: true, ...adState(u.id) });
  res.json({ object: 'list', phone: u.phone, personalization: true, data: o.all.filter((x) => x.personalized).slice(0, Number(req.query.limit) || 10).map((x) => ({ object: 'offer', id: x.adId, advertiser: x.advertiser, title: x.title, category: x.targetSub, relevance: x.relevanceScore, reason: x.relevanceReason, expected_ctr: x.expectedCTR })) });
});

/** Report what happened to an offer you showed (feeds relevance learning and revenue reporting). */
r.post('/offers/events', perKey(1200), need('offers:write'), (req, res) => {
  const b = req.body || {};
  if (!CAMPAIGNS.some((c) => c.id === b.offer_id)) throw err.invalid('invalid_offer', 'Unknown `offer_id` — use an id from `/users/{phone}/offers`.', 'offer_id');
  const TYPES = { impression: 'view', click: 'click', conversion: 'convert', dismiss: 'dismiss' };
  if (!TYPES[b.event]) throw err.invalid('invalid_event', '`event` must be impression, click, conversion or dismiss.', 'event');
  const phone = b.phone != null ? normalizePhone(b.phone) : null;
  if (b.phone != null && !phone) throw err.invalid('invalid_phone', 'Phone must be a 10-digit Indian mobile number.', 'phone');
  // Attribute to a user only if they are linked to this partner and allow ad personalisation; otherwise
  // the event is recorded anonymously and the response reveals nothing about whether the phone exists.
  const found = phone ? db.prepare('SELECT * FROM users WHERE phone = ?').get(phone) : null;
  const u = found && linkedTo(found, req.partner) && found.ad_personalization ? found : null;
  const value = b.event === 'conversion' ? Math.max(0, Number(b.value) || 0) : 0;
  db.prepare("INSERT INTO ad_events (user_id, ad_id, type, value, source) VALUES (?, ?, ?, ?, ?)").run(u?.id || null, b.offer_id, TYPES[b.event], value, req.partner.slug);
  res.status(202).json({ object: 'offer_event', offer_id: b.offer_id, event: b.event, recorded: true });
});

r.put('/users/:phone/consent', perKey(120), need('users:write'), (req, res) => {
  const u = userByPhone(req, { consent: false });
  const b = req.body || {};
  for (const f of ['share_insights', 'ad_personalization']) if (b[f] !== undefined && typeof b[f] !== 'boolean') throw err.invalid('invalid_consent', `\`${f}\` must be true or false.`, f);
  // Partners can always withdraw consent; granting it is reserved for users the partner onboarded.
  // People who signed up in the app grant consent themselves, in the app.
  const L = linkOf(u.id, req.partner.id);
  if ((b.share_insights === true && !L.consent) || (b.ad_personalization === true && !u.ad_personalization)) {
    if (!L.owner) throw new ApiError(403, 'permission_error', 'consent_owned_by_user', 'This user manages their own consent in the Spend Tracker app. Partners can withdraw consent, not grant it.');
  }
  // share_insights is per partner (this link); ad_personalization is the user's own setting.
  if (b.share_insights !== undefined) db.prepare('UPDATE user_partners SET consent = ? WHERE user_id = ? AND partner_id = ?').run(b.share_insights ? 1 : 0, u.id, req.partner.id);
  if (b.ad_personalization !== undefined) db.prepare('UPDATE users SET ad_personalization = ? WHERE id = ?').run(b.ad_personalization ? 1 : 0, u.id);
  const x = db.prepare('SELECT * FROM users WHERE id = ?').get(u.id);
  res.json({ object: 'consent', phone: u.phone, share_insights: consentFor(x, req.partner), ad_personalization: !!x.ad_personalization });
});

/** Right to erasure: removes the user and everything derived from their payments. */
r.delete('/users/:phone', perKey(60), need('users:write'), (req, res) => {
  const u = userByPhone(req, { consent: false });
  // Users this partner onboarded are erased completely; app users keep their account and lose only this partner's data.
  if (ownedBy(u, req.partner)) {
    const n = db.prepare('SELECT COUNT(*) n FROM transactions WHERE user_id = ?').get(u.id).n;
    db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
    return res.json({ object: 'deletion', phone: u.phone, scope: 'user', deleted: true, transactions_deleted: n });
  }
  const n = db.prepare('DELETE FROM transactions WHERE user_id = ? AND partner_id = ?').run(u.id, req.partner.id).changes;
  db.prepare('DELETE FROM user_partners WHERE user_id = ? AND partner_id = ?').run(u.id, req.partner.id);
  res.json({ object: 'deletion', phone: u.phone, scope: 'partner_data', deleted: true, transactions_deleted: n });
});

// ── Segments (aggregate only) ────────────────────────────────────────────────
const SEGMENTS = {
  high_food_delivery: { label: 'High food-delivery users', rule: '≥ 25 delivery orders a month', test: (A) => A.food.ordersPerMonth >= 25 },
  fashion_shoppers: { label: 'Frequent fashion & beauty shoppers', rule: '≥ ₹2,500 a month on fashion and beauty', test: (A) => A.s90.byMerchant.filter((m) => ['fashion', 'beauty'].includes(m.sub)).reduce((s, m) => s + m.monthly, 0) >= 2500 },
  subscription_heavy: { label: 'Subscription-heavy users', rule: '≥ 5 active subscriptions', test: (A) => A.subs.count >= 5 },
  frequent_riders: { label: 'Frequent cab riders', rule: '≥ 15 cab rides a month', test: (A) => A.s90.byMerchant.filter((m) => m.sub === 'cabs').reduce((s, m) => s + m.count, 0) / 3 >= 15 },
  high_spenders: { label: 'High spenders', rule: '≥ ₹80,000 a month', test: (A) => A.s90.monthlyEquivalent >= 80000 },
};
r.get('/segments', perKey(120), need('segments:read'), (_req, res) => res.json({ object: 'list', data: Object.entries(SEGMENTS).map(([id, s]) => ({ object: 'segment', id, label: s.label, rule: s.rule })) }));
r.get('/segments/:id', perKey(60), need('segments:read'), (req, res) => {
  const S = SEGMENTS[req.params.id];
  if (!S) throw err.notFound('segment_not_found', `Unknown segment. Use one of ${Object.keys(SEGMENTS).join(', ')}.`);
  const users = db.prepare('SELECT u.* FROM users u JOIN user_partners l ON l.user_id = u.id AND l.partner_id = ? AND l.consent = 1 WHERE u.consent_partner = 1 AND EXISTS (SELECT 1 FROM transactions t WHERE t.user_id = u.id)').all(req.partner.id);
  const members = users.map((u) => ({ u, A: buildAnalysis(loadTxns(u.id, { months: 4 }), u) })).filter((x) => S.test(x.A));
  const merchants = new Map(); for (const { A } of members) for (const m of A.s90.byMerchant.slice(0, 5)) merchants.set(m.name, (merchants.get(m.name) || 0) + m.monthly);
  res.json({
    object: 'segment', id: req.params.id, label: S.label, rule: S.rule, size: members.length, population: users.length,
    average_monthly_spend: members.length ? money(members.reduce((s, x) => s + x.A.s90.monthlyEquivalent, 0) / members.length) : 0,
    top_merchants: [...merchants.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name]) => name),
    note: 'Aggregated over consenting users only. Segments never return individual users.',
  });
});

r.get('/categories', (_req, res) => res.json({ object: 'list', data: CATEGORIES.map((c) => ({ object: 'category', id: c.id, name: c.name, subcategories: Object.entries(c.subs).map(([id, name]) => ({ id, name })) })) }));

r.use((req, _res, next) => next(err.notFound('route_not_found', `No route for ${req.method} ${req.originalUrl.split('?')[0]}.`)));

// Error envelope for everything under /v1.
// eslint-disable-next-line no-unused-vars
r.use((e, req, res, _next) => {
  if (e instanceof ApiError) return res.status(e.status).json({ error: { type: e.type, code: e.code, message: e.message, param: e.param, doc_url: `${DOCS}#errors` }, request_id: req.id });
  if (e.type === 'entity.parse.failed') return res.status(400).json({ error: { type: 'invalid_request_error', code: 'invalid_json', message: 'Body is not valid JSON.', doc_url: `${DOCS}#errors` }, request_id: req.id });
  if (e.type === 'entity.too.large') return res.status(413).json({ error: { type: 'invalid_request_error', code: 'payload_too_large', message: 'Body exceeds 6 MB.', doc_url: `${DOCS}#errors` }, request_id: req.id });
  console.error(`[v1 ${req.id}]`, e);
  res.status(500).json({ error: { type: 'api_error', code: 'internal_error', message: 'Something went wrong on our side. Retry with backoff.', doc_url: `${DOCS}#errors` }, request_id: req.id });
});

export { maskPhone };
export default r;
