import { Router } from 'express';
import { db, json } from '../db.js';
import { requireAuth, HttpError } from '../lib/auth.js';
import { context, syncAlerts } from '../lib/context.js';

const r = Router();
r.use(requireAuth);
const out = (a) => ({ alertId: a.id, type: a.type, severity: a.severity, title: a.title, body: a.body, link: a.link, read: !!a.read, createdAt: a.created_at });

r.get('/all', (req, res) => {
  try { syncAlerts(context(req.user)); } catch { /* no data yet */ }
  const rows = db.prepare('SELECT * FROM alerts WHERE user_id = ? ORDER BY read, created_at DESC LIMIT 100').all(req.user.id);
  res.json({ alerts: rows.map(out), unread: rows.filter((a) => !a.read).length, settings: json.parse(req.user.settings, {}) });
});
r.post('/settings', (req, res) => {
  const s = { ...json.parse(req.user.settings, {}) };
  for (const k of ['budgetAlerts', 'unusualSpending', 'dealAlerts', 'weeklySummary']) if (k in (req.body || {})) s[k] = Boolean(req.body[k]);
  db.prepare('UPDATE users SET settings = ? WHERE id = ?').run(json.str(s), req.user.id);
  res.json({ settings: s });
});
r.put('/read/:alertId', (req, res) => {
  if (req.params.alertId === 'all') db.prepare('UPDATE alerts SET read = 1 WHERE user_id = ?').run(req.user.id);
  else if (!db.prepare('UPDATE alerts SET read = 1 WHERE id = ? AND user_id = ?').run(req.params.alertId, req.user.id).changes) throw new HttpError(404, 'Alert not found.');
  res.json({ ok: true });
});
r.delete('/:alertId', (req, res) => {
  if (!db.prepare('DELETE FROM alerts WHERE id = ? AND user_id = ?').run(req.params.alertId, req.user.id).changes) throw new HttpError(404, 'Alert not found.');
  res.json({ ok: true });
});

export default r;
