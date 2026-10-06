import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, HttpError } from '../lib/auth.js';
import { importTransactions, loadTxns, txnOut, recategorize, requireData } from '../lib/store.js';
import { context, summarize, periodRange } from '../lib/context.js';
import { parseCsv } from '../engine/categorize.js';
import { generateTransactions, PERSONAS } from '../data/generator.js';
import { CATEGORIES, CATEGORY } from '../data/catalog.js';
import { aiCategorize } from '../ai/index.js';

const r = Router();
r.get('/categories', (_req, res) => res.json({ categories: CATEGORIES.map((c) => ({ id: c.id, name: c.name, emoji: c.emoji, color: c.color, subcategories: Object.entries(c.subs).map(([id, name]) => ({ id, name })) })) }));
r.use(requireAuth);

/** Connect data: simulated Paytm feed (consented) or a CSV export. */
r.post('/import', async (req, res) => {
  const { source = 'paytm', months = 6, persona = 'convenience', csv, replace = true } = req.body || {};
  const m = [3, 6, 12].includes(Number(months)) ? Number(months) : 6;
  let rows;
  if (source === 'csv') {
    if (typeof csv !== 'string' || csv.length > 5_000_000) throw new HttpError(400, 'Upload a CSV export up to 5 MB.');
    rows = parseCsv(csv);
  } else {
    const p = PERSONAS[persona] ? persona : 'convenience';
    rows = generateTransactions(p, { months: m, seed: `${req.user.id}:${p}` });
    const P = PERSONAS[p];
    db.prepare('UPDATE users SET persona = ?, city = COALESCE(city, ?), income = COALESCE(income, ?), household = COALESCE(household, ?), age = COALESCE(age, ?) WHERE id = ?').run(p, P.city, P.income, P.household, P.age, req.user.id);
  }
  const started = Date.now();
  const result = importTransactions(req.user.id, rows, { replace });
  db.prepare('UPDATE users SET data_source = ?, period_months = ? WHERE id = ?').run(source, m, req.user.id);
  // Ask AI about merchants the rules couldn't place (bounded wait so onboarding stays fast).
  let aiReviewed = 0;
  if (result.needsReview.length) {
    const ai = await Promise.race([aiCategorize(result.needsReview), new Promise((ok) => setTimeout(() => ok({ data: [] }), 20000))]);
    for (const u of ai.data || []) { db.prepare("UPDATE transactions SET category = ?, sub = ?, confidence = ?, cat_source = 'ai' WHERE id = ? AND user_id = ?").run(u.category, u.sub, u.confidence, u.id, req.user.id); aiReviewed++; }
  }
  res.status(201).json({ imported: result.imported, needsReview: result.needsReview.length - aiReviewed, aiCategorized: aiReviewed, ms: Date.now() - started });
});

r.get('/transactions', (req, res) => {
  requireData(req.user.id);
  const { q = '', category, sub, merchant, status, from, to, sort = 'date_desc', limit = 50, offset = 0 } = req.query;
  let list = loadTxns(req.user.id, { months: 12 });
  if (category) list = list.filter((t) => t.category === category);
  if (sub) list = list.filter((t) => t.sub === sub);
  if (merchant) list = list.filter((t) => t.merchant === merchant || t.merchantId === merchant);
  if (status) list = list.filter((t) => t.status === status);
  if (from) list = list.filter((t) => t.ts >= new Date(from));
  if (to) list = list.filter((t) => t.ts <= new Date(to));
  if (q) { const s = String(q).toLowerCase(); list = list.filter((t) => `${t.merchant} ${t.description} ${t.category} ${t.sub}`.toLowerCase().includes(s)); }
  const cmp = { date_desc: (a, b) => b.ts - a.ts, date_asc: (a, b) => a.ts - b.ts, amount_desc: (a, b) => b.amount - a.amount, amount_asc: (a, b) => a.amount - b.amount }[sort] || ((a, b) => b.ts - a.ts);
  list.sort(cmp);
  const lim = Math.min(200, Number(limit) || 50), off = Math.max(0, Number(offset) || 0);
  res.json({ total: list.length, totalAmount: Math.round(list.filter((t) => t.status === 'completed').reduce((s, t) => s + t.amount, 0)), transactions: list.slice(off, off + lim).map(txnOut) });
});

r.get('/summary', (req, res) => {
  const ctx = context(req.user, { period: req.query.period });
  res.json({ summary: ctx.A.summary });
});
r.get('/by-category', (req, res) => {
  const ctx = context(req.user, { period: req.query.period });
  res.json({ period: ctx.A.summary.label, categories: ctx.A.summary.byCategory });
});
r.get('/by-merchant', (req, res) => {
  const ctx = context(req.user, { period: req.query.period });
  res.json({ period: ctx.A.summary.label, merchants: summarize(ctx.txns, periodRange(req.query.period)).byMerchant });
});

r.put('/:transactionId/categorize', (req, res) => {
  const { category, subcategory, applyToMerchant = true } = req.body || {};
  if (!CATEGORY[category] || !CATEGORY[category].subs[subcategory]) throw new HttpError(400, 'Pick a valid category and subcategory.');
  const t = recategorize(req.user.id, req.params.transactionId, category, subcategory, { applyToMerchant });
  res.json({ transaction: txnOut(t), learned: applyToMerchant });
});

r.delete('/:transactionId', (req, res) => {
  const out = db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?').run(req.params.transactionId, req.user.id);
  if (!out.changes) throw new HttpError(404, 'Transaction not found.');
  res.json({ ok: true });
});

export default r;
