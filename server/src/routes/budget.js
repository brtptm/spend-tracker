import { Router } from 'express';
import { db, uid } from '../db.js';
import { requireAuth, HttpError } from '../lib/auth.js';
import { context, budgetStatus, syncAlerts } from '../lib/context.js';
import { loadTxns } from '../lib/store.js';
import { CATEGORY, CATEGORIES } from '../data/catalog.js';

const r = Router();
r.use(requireAuth);
const r100 = (n) => Math.round(n / 100) * 100;

function feasibility(current, target) {
  if (!current) return { level: 'easy', reduction: 0, note: 'No spending here yet.' };
  const cut = (current - target) / current;
  if (cut <= 0) return { level: 'easy', reduction: 0, note: 'Above your current average — comfortable.' };
  const level = cut < 0.1 ? 'easy' : cut < 0.25 ? 'moderate' : cut < 0.4 ? 'hard' : 'very_hard';
  return { level, reduction: Math.round(cut * 100), note: { easy: 'A small trim — very achievable.', moderate: 'Doable with one or two habit changes.', hard: 'Needs real changes; pair it with a recommendation.', very_hard: 'More than a 40% cut — consider a gentler first month.' }[level] };
}

r.get('/suggest', (req, res) => {
  const ctx = context(req.user);
  res.json({ suggestions: CATEGORIES.map((c) => {
    const current = ctx.A.s90.byCategory.find((x) => x.id === c.id)?.monthly || 0;
    const recSave = ctx.recs.filter((x) => x.category === c.id && !x.oneTime).reduce((s, x) => s + x.savingsMonthly, 0);
    const peer = ctx.A.peers.rows.find((x) => x.id === c.id)?.average || 0;
    const suggested = current ? r100(Math.max(current - recSave * 0.8, Math.min(current, peer), current * 0.7)) : 0;
    return { category: c.id, name: c.name, color: c.color, current, peerAverage: peer, suggested, feasibility: feasibility(current, suggested) };
  }).filter((s) => s.current > 0) });
});

r.post('/create', (req, res) => {
  const list = Array.isArray(req.body?.budgets) ? req.body.budgets : [req.body];
  const ctx = context(req.user);
  for (const b of list) {
    if (!(b?.category === 'total' || CATEGORY[b?.category])) throw new HttpError(400, 'Pick a valid category.');
    const amount = Number(b.amount);
    if (!Number.isFinite(amount) || amount < 100 || amount > 1e7) throw new HttpError(400, 'Budget must be between ₹100 and ₹1 crore.');
    db.prepare("INSERT INTO budgets (id, user_id, category, amount) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, category) DO UPDATE SET amount = excluded.amount, updated_at = datetime('now')").run(uid(), req.user.id, b.category, Math.round(amount));
  }
  const status = budgetStatus(req.user.id, ctx.txns);
  res.status(201).json({ ...status, feasibility: status.items.map((i) => ({ category: i.category, ...feasibility(ctx.A.s90.byCategory.find((x) => x.id === i.category)?.monthly || 0, i.budget) })) });
});

r.get('/status', (req, res) => res.json(budgetStatus(req.user.id, loadTxns(req.user.id, { months: 2 }))));

r.post('/alerts', (req, res) => {
  const ctx = context(req.user);
  syncAlerts(ctx);
  res.json({ alerts: db.prepare("SELECT * FROM alerts WHERE user_id = ? AND type = 'budget' ORDER BY created_at DESC").all(req.user.id) });
});

const own = (req) => { const b = db.prepare('SELECT * FROM budgets WHERE id = ? AND user_id = ?').get(req.params.budgetId, req.user.id); if (!b) throw new HttpError(404, 'Budget not found.'); return b; };
r.get('/:budgetId', (req, res) => { const b = own(req); res.json({ budget: budgetStatus(req.user.id, loadTxns(req.user.id, { months: 2 })).items.find((i) => i.budgetId === b.id) }); });
r.put('/:budgetId', (req, res) => {
  own(req);
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount < 100) throw new HttpError(400, 'Budget must be at least ₹100.');
  db.prepare("UPDATE budgets SET amount = ?, updated_at = datetime('now') WHERE id = ?").run(Math.round(amount), req.params.budgetId);
  res.json(budgetStatus(req.user.id, loadTxns(req.user.id, { months: 2 })));
});
r.delete('/:budgetId', (req, res) => { own(req); db.prepare('DELETE FROM budgets WHERE id = ?').run(req.params.budgetId); res.json({ ok: true }); });

export default r;
