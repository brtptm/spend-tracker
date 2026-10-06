import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, json, uid } from '../db.js';
import { signToken, publicUser, requireAuth, HttpError } from '../lib/auth.js';
import { DEMO_USERS, ensureDemoUser, isDemoEmail, DEFAULT_SETTINGS } from '../seed.js';

const r = Router();
const emailOk = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const me = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);

r.post('/register', async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!emailOk(email)) throw new HttpError(400, 'Enter a valid email address.');
  if (!password || password.length < 8) throw new HttpError(400, 'Use a password with at least 8 characters.');
  if (!name?.trim()) throw new HttpError(400, 'Tell us your name.');
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email.toLowerCase())) throw new HttpError(409, 'An account with this email already exists. Sign in instead.');
  const id = uid();
  db.prepare('INSERT INTO users (id, email, name, password_hash, settings) VALUES (?, ?, ?, ?, ?)').run(id, email.toLowerCase(), name.trim(), await bcrypt.hash(password, 10), json.str(DEFAULT_SETTINGS));
  res.status(201).json({ token: signToken({ id }), user: publicUser(me(id)) });
});

r.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const u = emailOk(email) && db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!u || !(await bcrypt.compare(password || '', u.password_hash))) throw new HttpError(401, 'Email or password is incorrect.');
  res.json({ token: signToken(u), user: publicUser(u) });
});

/** "Continue with Paytm" for the demo: signs into one of the seeded profiles. */
r.post('/demo', async (req, res) => {
  const persona = DEMO_USERS[req.body?.persona] ? req.body.persona : 'convenience';
  const id = await ensureDemoUser(persona);
  res.json({ token: signToken({ id }), user: publicUser(me(id)) });
});

r.post('/logout', (_req, res) => res.json({ ok: true }));
r.get('/profile', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

r.put('/settings', requireAuth, (req, res) => {
  const b = req.body || {};
  const u = req.user;
  const settings = { ...DEFAULT_SETTINGS, ...json.parse(u.settings, {}) };
  for (const k of ['budgetAlerts', 'unusualSpending', 'dealAlerts', 'weeklySummary', 'theme']) if (k in b) settings[k] = b[k];
  const num = (v, lo, hi) => (v === null || v === '' ? null : Math.max(lo, Math.min(hi, Number(v))));
  db.prepare(`UPDATE users SET name = ?, city = ?, income = ?, age = ?, household = ?, period_months = ?, consent_partner = ?, ad_personalization = ?, settings = ? WHERE id = ?`).run(
    typeof b.name === 'string' && b.name.trim() ? b.name.trim() : u.name,
    'city' in b ? String(b.city || '').slice(0, 60) || null : u.city,
    'income' in b ? num(b.income, 0, 1e8) : u.income,
    'age' in b ? num(b.age, 16, 100) : u.age,
    'household' in b ? String(b.household || '').slice(0, 60) || null : u.household,
    [3, 6, 12].includes(Number(b.periodMonths)) ? Number(b.periodMonths) : u.period_months,
    'consentPartner' in b ? (b.consentPartner ? 1 : 0) : u.consent_partner,
    'adPersonalization' in b ? (b.adPersonalization ? 1 : 0) : u.ad_personalization,
    json.str(settings), u.id,
  );
  res.json({ user: publicUser(me(u.id)) });
});

r.delete('/account', requireAuth, (req, res) => {
  if (isDemoEmail(req.user.email)) throw new HttpError(400, 'Demo accounts can be reset with `pnpm seed`, not deleted.');
  db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
  res.json({ ok: true });
});

export default r;
