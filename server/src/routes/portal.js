// Integration Portal API (partner admins, not end users): keys, ingestion health, test events, ad revenue.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, json } from '../db.js';
import { signPortalToken, requirePortal, HttpError } from '../lib/auth.js';
import { createKey, revokeKey, keyOut, ALL_SCOPES, SCOPES, newId } from '../partner/keys.js';
import { ingest, normalizePhone } from '../partner/ingest.js';
import { adPerformance } from './ads.js';
import { linkedTo } from './v1.js';

const r = Router();
const isoz = (s) => (s ? s.replace(' ', 'T') + 'Z' : s);
const memberOut = (m) => ({ id: m.id, email: m.email, name: m.name, role: m.role, partner: { id: m.partner_id, name: m.partner_name, slug: m.partner_slug } });

r.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const m = typeof email === 'string' && db.prepare('SELECT m.*, p.name partner_name, p.slug partner_slug FROM portal_members m JOIN partners p ON p.id = m.partner_id WHERE m.email = ?').get(email.trim().toLowerCase());
  if (!m || !(await bcrypt.compare(String(password || ''), m.password_hash))) throw new HttpError(401, 'Email or password is incorrect.');
  res.json({ token: signPortalToken(m), member: memberOut(m) });
});

// Demo sign-in: no credentials ever reach the browser. Requires PORTAL_DEMO=1 and is never available in production.
const DEMO_SIGNIN = process.env.PORTAL_DEMO === '1' && process.env.NODE_ENV !== 'production';
r.get('/config', (_req, res) => res.json({ demo: DEMO_SIGNIN }));
r.post('/demo', (_req, res) => {
  if (!DEMO_SIGNIN) throw new HttpError(404, 'Demo sign-in is disabled.');
  const m = db.prepare("SELECT m.*, p.name partner_name, p.slug partner_slug FROM portal_members m JOIN partners p ON p.id = m.partner_id WHERE p.slug = 'paytm' ORDER BY m.created_at LIMIT 1").get();
  if (!m) throw new HttpError(404, 'No demo member.');
  res.json({ token: signPortalToken(m), member: memberOut(m) });
});

r.use(requirePortal);
r.get('/me', (req, res) => res.json({ member: memberOut(req.member), scopes: SCOPES }));

r.get('/keys', (req, res) => res.json({ keys: db.prepare('SELECT * FROM partner_keys WHERE partner_id = ? ORDER BY revoked_at IS NOT NULL, created_at DESC').all(req.member.partner_id).map((k) => ({ ...keyOut(k), created_at: isoz(k.created_at), last_used_at: isoz(k.last_used_at), revoked_at: isoz(k.revoked_at) })) }));
r.post('/keys', (req, res) => {
  const { name, scopes } = req.body || {};
  if (!String(name || '').trim()) throw new HttpError(400, 'Name the key after the system that will use it.');
  try { res.status(201).json(createKey(req.member.partner_id, { name: String(name).trim(), scopes: Array.isArray(scopes) ? scopes : ALL_SCOPES, createdBy: req.member.id })); }
  catch (e) { throw new HttpError(e.status || 400, e.message); }
});
r.delete('/keys/:id', (req, res) => {
  if (!revokeKey(req.member.partner_id, req.params.id)) throw new HttpError(404, 'Key not found or already revoked.');
  res.json({ revoked: true });
});

/** Ingestion health for the overview: totals, 14-day series, outcome mix, recent deliveries. */
r.get('/stats', (req, res) => {
  const pid = req.member.partner_id, slug = req.member.partner_slug;
  const sum = (since) => db.prepare(`SELECT COUNT(*) requests, COALESCE(SUM(received),0) received, COALESCE(SUM(accepted),0) accepted, COALESCE(SUM(duplicates),0) duplicates, COALESCE(SUM(filtered),0) filtered, COALESCE(SUM(rejected),0) rejected, COALESCE(AVG(duration_ms),0) avg_ms
    FROM ingest_log WHERE partner_id = ? AND created_at >= datetime('now', ?)`).get(pid, since);
  const days = db.prepare(`SELECT date(created_at) day, SUM(received) received, SUM(accepted) accepted, SUM(filtered) filtered, SUM(rejected) rejected, SUM(duplicates) duplicates FROM ingest_log WHERE partner_id = ? AND date(created_at) >= date('now','-13 days') GROUP BY day`).all(pid);
  const byDay = new Map(days.map((d) => [d.day, d]));
  const series = Array.from({ length: 14 }, (_, i) => { const d = new Date(Date.now() - (13 - i) * 864e5).toISOString().slice(0, 10); return { day: d, ...(byDay.get(d) || { received: 0, accepted: 0, filtered: 0, rejected: 0, duplicates: 0 }) }; });
  res.json({
    last24h: sum('-1 day'), last7d: sum('-7 days'), series,
    users: db.prepare('SELECT COUNT(*) n FROM user_partners WHERE partner_id = ?').get(pid).n,
    transactions: db.prepare('SELECT COUNT(*) n FROM transactions WHERE partner_id = ?').get(pid).n,
    keys: db.prepare('SELECT COUNT(*) n FROM partner_keys WHERE partner_id = ? AND revoked_at IS NULL').get(pid).n,
    includes_simulated: !!db.prepare("SELECT 1 FROM ingest_log WHERE partner_id = ? AND kind = 'simulated' LIMIT 1").get(pid),
    recent: db.prepare('SELECT id, kind, received, accepted, duplicates, filtered, rejected, duration_ms, created_at FROM ingest_log WHERE partner_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 8').all(pid).map((x) => ({ ...x, created_at: isoz(x.created_at) })),
  });
});

r.get('/logs', (req, res) => {
  const limit = Math.min(200, Number(req.query.limit) || 50);
  res.json({ logs: db.prepare('SELECT l.id, l.kind, l.received, l.accepted, l.duplicates, l.filtered, l.rejected, l.duration_ms, l.created_at, k.name key_name, k.prefix key_prefix FROM ingest_log l LEFT JOIN partner_keys k ON k.id = l.key_id WHERE l.partner_id = ? ORDER BY l.created_at DESC, l.rowid DESC LIMIT ?').all(req.member.partner_id, limit).map((x) => ({ ...x, created_at: isoz(x.created_at) })) });
});
r.get('/logs/:id', (req, res) => {
  const x = db.prepare('SELECT * FROM ingest_log WHERE id = ? AND partner_id = ?').get(req.params.id, req.member.partner_id);
  if (!x) throw new HttpError(404, 'Log not found.');
  res.json({ id: x.id, kind: x.kind, created_at: isoz(x.created_at), duration_ms: x.duration_ms, ...json.parse(x.results) });
});

/** Run a sample payment through the real pipeline (logged as kind "test"). */
r.post('/test-event', (req, res) => {
  const partner = { id: req.member.partner_id, slug: req.member.partner_slug };
  const event = req.body?.event && typeof req.body.event === 'object' ? req.body.event : {
    id: `TEST-${Date.now()}`, phone: '9876500001', amount: 249, timestamp: new Date().toISOString(), status: 'success',
    payer_vpa: 'rohan.v@paytm', payee_vpa: 'swiggy.payu@hdfcbank', payee_name: 'PAYTM*SWIGGY LIMITED 4412093', mcc: '5814',
  };
  const t0 = performance.now();
  const out = ingest(partner, [event]);
  const id = newId('ing');
  db.prepare('INSERT INTO ingest_log (id, partner_id, key_id, kind, received, accepted, duplicates, filtered, rejected, results, duration_ms) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, partner.id, 'test', out.received, out.accepted + out.updated, out.duplicates, out.filtered, out.rejected, json.str(out), Math.round(performance.now() - t0));
  res.json({ ingest_id: id, event, result: out.results[0] });
});

/** Phone lookup for support: identity, UPI IDs and data freshness — no spending details. */
r.get('/users/:phone', (req, res) => {
  const phone = normalizePhone(req.params.phone);
  if (!phone) throw new HttpError(400, 'Enter a 10-digit mobile number.');
  const u = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  // Same tenant scoping as the API: only users linked to this partner, and no details without consent.
  if (!u || !linkedTo(u, { id: req.member.partner_id, slug: req.member.partner_slug })) throw new HttpError(404, 'No user with this phone yet.');
  const L = db.prepare('SELECT * FROM user_partners WHERE user_id = ? AND partner_id = ?').get(u.id, req.member.partner_id);
  const consent = { share_insights: !!u.consent_partner && !!L?.consent, ad_personalization: !!u.ad_personalization };
  if (!consent.share_insights) return res.json({ phone, consent, restricted: true });
  const st = db.prepare('SELECT COUNT(*) n, MIN(ts) first, MAX(ts) last FROM transactions WHERE user_id = ?').get(u.id);
  res.json({ phone, name: /^UPI user/.test(u.name) ? null : u.name, source: u.source, consent, transactions: st.n, first_payment_at: st.first, last_payment_at: st.last, upi_ids: db.prepare('SELECT vpa, payments, last_seen FROM user_vpas WHERE user_id = ? ORDER BY last_seen DESC').all(u.id) });
});

r.get('/ads', (_req, res) => res.json(adPerformance(null)));

export default r;
