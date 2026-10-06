// Partner API keys: shown once, stored as SHA-256 hashes, scoped, revocable.
import crypto from 'node:crypto';
import { db, json, uid } from '../db.js';

export const SCOPES = {
  'transactions:write': 'Send UPI payments (events and batches).',
  'users:read': 'Read user summaries, reports, behaviour, merchants, UPI IDs and transactions.',
  'users:write': 'Update consent and erase a user’s data.',
  'segments:read': 'Read aggregated audience segments.',
  'offers:read': 'Read spend-based offer recommendations for a user.',
  'offers:write': 'Report offer impressions, clicks and conversions.',
};
export const ALL_SCOPES = Object.keys(SCOPES);

const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
// Rejection sampling: bytes ≥ 248 are discarded so every character is equally likely.
const random62 = (n) => { let s = ''; while (s.length < n) for (const b of crypto.randomBytes(n * 2)) { if (b < 248 && s.length < n) s += B62[b % 62]; } return s; };
export const hashKey = (secret) => crypto.createHash('sha256').update(secret).digest('hex');

/** Create a key; returns the plaintext secret exactly once. */
export function createKey(partnerId, { name, scopes = ALL_SCOPES, createdBy = null }) {
  const bad = scopes.filter((s) => !SCOPES[s]);
  if (bad.length) throw Object.assign(new Error(`Unknown scope: ${bad.join(', ')}`), { status: 400 });
  if (!scopes.length) throw Object.assign(new Error('Choose at least one scope.'), { status: 400 });
  const secret = `stk_live_${random62(32)}`;
  const id = `key_${random62(14)}`;
  const prefix = `${secret.slice(0, 13)}…${secret.slice(-4)}`;
  db.prepare('INSERT INTO partner_keys (id, partner_id, name, prefix, secret_hash, scopes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, partnerId, String(name || 'Untitled key').slice(0, 60), prefix, hashKey(secret), json.str(scopes), createdBy);
  return { key: keyOut(db.prepare('SELECT * FROM partner_keys WHERE id = ?').get(id)), secret };
}

export const keyOut = (k) => k && ({ id: k.id, name: k.name, prefix: k.prefix, scopes: json.parse(k.scopes, []), created_at: k.created_at, last_used_at: k.last_used_at, revoked_at: k.revoked_at, status: k.revoked_at ? 'revoked' : 'active' });

export function revokeKey(partnerId, keyId) {
  const r = db.prepare("UPDATE partner_keys SET revoked_at = datetime('now') WHERE id = ? AND partner_id = ? AND revoked_at IS NULL").run(keyId, partnerId);
  return r.changes > 0;
}

/** Look up an active key by its plaintext secret (constant-time on the hash). */
export function verifyKey(secret) {
  if (typeof secret !== 'string' || !/^stk_live_[0-9A-Za-z]{32}$/.test(secret)) return null;
  const h = hashKey(secret);
  const k = db.prepare('SELECT k.*, p.status partner_status, p.slug partner_slug, p.name partner_name FROM partner_keys k JOIN partners p ON p.id = k.partner_id WHERE k.secret_hash = ?').get(h);
  if (!k || !crypto.timingSafeEqual(Buffer.from(k.secret_hash), Buffer.from(h))) return null;
  if (k.revoked_at || k.partner_status !== 'active') return null;
  return k;
}

export function touchKey(id) {
  db.prepare("UPDATE partner_keys SET last_used_at = datetime('now') WHERE id = ?").run(id);
}

export const newId = (p) => `${p}_${random62(18)}`;
export { uid };
