import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import { db, json } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const secretFile = path.resolve(__dirname, '..', '..', 'data', '.jwt-secret');

// Use JWT_SECRET if provided, otherwise persist a random one so sessions survive restarts.
const SECRET = process.env.JWT_SECRET || (() => {
  if (fs.existsSync(secretFile)) return fs.readFileSync(secretFile, 'utf8').trim();
  const s = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(secretFile, s, { mode: 0o600 });
  return s;
})();

export const signToken = (user) => jwt.sign({ sub: user.id }, SECRET, { expiresIn: '30d' });

export const publicUser = (u) => u && ({
  id: u.id, email: u.email, name: u.name, persona: u.persona, city: u.city, age: u.age, income: u.income, household: u.household,
  periodMonths: u.period_months, consentPartner: !!u.consent_partner, adPersonalization: !!u.ad_personalization, dataSource: u.data_source,
  settings: json.parse(u.settings, {}), createdAt: u.created_at,
});

export function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Sign in to continue.' });
  try {
    const { sub } = jwt.verify(token, SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(sub);
    if (!user) return res.status(401).json({ error: 'Your session has ended. Sign in again.' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Your session has ended. Sign in again.' });
  }
}

/** Route params like /:userId must refer to the signed-in user. */
export function selfOnly(param = 'userId') {
  return (req, res, next) => {
    const v = req.params[param];
    if (v && v !== 'me' && v !== req.user.id) return res.status(403).json({ error: 'You can only access your own data.' });
    next();
  };
}

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
