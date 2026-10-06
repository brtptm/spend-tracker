import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, json, uid } from '../db.js';
import { signToken, publicUser, requireAuth, HttpError } from '../lib/auth.js';
import crypto from 'node:crypto';
import { DEMO_USERS, DEMO_PHONES, ensureDemoUser, isDemoEmail, DEFAULT_SETTINGS } from '../seed.js';
import { normalizePhone, link } from '../partner/ingest.js';

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

// ── Continue with Paytm: phone + OTP. The phone links the user to payments Paytm already sent us. ──
const OTPS = new Map(); // request_id → { phone, hash, exp, tries }
const isProd = process.env.NODE_ENV === 'production';
// No SMS provider in the demo: with OTP_DEMO=1 the code is shown on screen. Off unless explicitly enabled
// (fail closed); in production it is further limited to the seeded demo numbers.
const DEMO_OTP = process.env.OTP_DEMO === '1';
const demoPhones = new Set(Object.values(DEMO_PHONES));
const showCode = (phone) => DEMO_OTP && (!isProd || demoPhones.has(phone));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
r.post('/paytm/start', (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  if (!phone) throw new HttpError(400, 'Enter your 10-digit mobile number.');
  for (const [k, v] of OTPS) if (v.exp < Date.now()) OTPS.delete(k);
  const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
  const requestId = crypto.randomUUID();
  OTPS.set(requestId, { phone, hash: sha(code), exp: Date.now() + 5 * 60_000, tries: 0 });
  // A real deployment sends the code via Paytm's SMS/OTP service; the demo returns it.
  res.json({ request_id: requestId, phone: `••••••${phone.slice(-4)}`, expires_in: 300, ...(showCode(phone) ? { demo_code: code } : {}) });
});
r.post('/paytm/verify', (req, res) => {
  const { request_id: rid, code } = req.body || {};
  const o = OTPS.get(rid);
  if (!o || o.exp < Date.now()) { OTPS.delete(rid); throw new HttpError(400, 'This code has expired. Request a new one.'); }
  if (++o.tries > 5) { OTPS.delete(rid); throw new HttpError(429, 'Too many attempts. Request a new code.'); }
  const a = Buffer.from(sha(String(code || ''))), b = Buffer.from(o.hash);
  if (!crypto.timingSafeEqual(a, b)) throw new HttpError(401, 'That code is not right. Check it and try again.');
  OTPS.delete(rid);
  let u = db.prepare('SELECT * FROM users WHERE phone = ?').get(o.phone);
  if (!u) {
    const id = uid();
    db.prepare("INSERT INTO users (id, email, name, password_hash, phone, source, settings) VALUES (?, ?, ?, '!', ?, 'app', ?)").run(id, `${o.phone}@phone.spendtracker.local`, 'Paytm user', o.phone, json.str(DEFAULT_SETTINGS));
    u = me(id);
  }
  // Signing in with Paytm links this person to the Paytm partner (consent captured by the sign-in).
  const paytm = db.prepare("SELECT id FROM partners WHERE slug = 'paytm'").get();
  if (paytm) link(u.id, paytm.id, { via: 'paytm_login' });
  res.json({ token: signToken(u), user: publicUser(u), linked: db.prepare('SELECT COUNT(*) n FROM transactions WHERE user_id = ?').get(u.id).n });
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
