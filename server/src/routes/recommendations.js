import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, HttpError } from '../lib/auth.js';
import { context } from '../lib/context.js';
import { periodRange } from '../engine/analytics.js';

const r = Router();
r.use(requireAuth);

const monthlyIn = (ctx, category) => {
  const R = periodRange('30d');
  return ctx.txns.filter((t) => t.status === 'completed' && t.ts >= R.start && (category === 'all' || t.category === category)).reduce((s, t) => s + t.amount, 0);
};

r.get('/all', (req, res) => {
  const ctx = context(req.user);
  res.json({ recommendations: ctx.recs, challenges: ctx.challenges });
});

r.get('/impact', (req, res) => {
  const ctx = context(req.user);
  const active = ctx.recs.filter((x) => x.status !== 'declined' && !x.oneTime);
  const accepted = ctx.recs.filter((x) => x.status === 'accepted');
  const states = new Map(db.prepare("SELECT rec_id, baseline FROM rec_state WHERE user_id = ? AND status = 'accepted'").all(req.user.id).map((x) => [x.rec_id, x.baseline]));
  const tracking = accepted.map((x) => {
    const baseline = states.get(x.id) ?? x.currentSpending;
    const now = monthlyIn(ctx, x.category);
    return { id: x.id, title: x.title, category: x.category, target: x.savingsMonthly, baseline: Math.round(baseline), current: Math.round(now), achieved: Math.max(0, Math.round(baseline - now)) };
  });
  res.json({
    potential: { monthly: active.reduce((s, x) => s + x.savingsMonthly, 0), annual: active.reduce((s, x) => s + x.savingsAnnual, 0), count: active.length },
    committed: { monthly: accepted.reduce((s, x) => s + x.savingsMonthly, 0), count: accepted.length },
    achieved: { monthly: tracking.reduce((s, t) => s + t.achieved, 0) },
    tracking,
  });
});

r.get('/:categoryId', (req, res) => {
  const ctx = context(req.user);
  res.json({ recommendations: ctx.recs.filter((x) => x.category === req.params.categoryId) });
});

function setState(req, status) {
  const ctx = context(req.user);
  const rec = ctx.recs.find((x) => x.id === req.params.id);
  if (!rec) throw new HttpError(404, 'Recommendation not found.');
  const baseline = monthlyIn(ctx, rec.category);
  db.prepare("INSERT INTO rec_state (user_id, rec_id, status, baseline) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, rec_id) DO UPDATE SET status = excluded.status, baseline = excluded.baseline, updated_at = datetime('now')").run(req.user.id, rec.id, status, baseline);
  return { ...rec, status };
}
r.post('/:id/accept', (req, res) => res.json({ recommendation: setState(req, 'accepted') }));
r.post('/:id/dismiss', (req, res) => res.json({ recommendation: setState(req, 'declined') }));
r.post('/:id/reset', (req, res) => { db.prepare('DELETE FROM rec_state WHERE user_id = ? AND rec_id = ?').run(req.user.id, req.params.id); res.json({ ok: true }); });

r.post('/challenges/:id/accept', (req, res) => {
  const ctx = context(req.user);
  const c = ctx.challenges.find((x) => x.id === req.params.id);
  if (!c) throw new HttpError(404, 'Challenge not found.');
  db.prepare("INSERT INTO challenges (user_id, challenge_id, status, baseline, target) VALUES (?, ?, 'active', ?, ?) ON CONFLICT(user_id, challenge_id) DO UPDATE SET status = 'active', started_at = datetime('now')").run(req.user.id, c.id, c.baseline, c.target);
  res.json({ challenges: context(req.user).challenges });
});
r.post('/challenges/:id/leave', (req, res) => {
  db.prepare('DELETE FROM challenges WHERE user_id = ? AND challenge_id = ?').run(req.user.id, req.params.id);
  res.json({ challenges: context(req.user).challenges });
});

export default r;
