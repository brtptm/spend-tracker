// Calls the running API and saves trimmed real responses as docs examples.
// Usage: node scripts/capture-examples.mjs [baseUrl]   (server must be running; uses the demo portal admin)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.argv[2] || 'http://localhost:4400';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../src/partner/examples.json');
const { ENDPOINTS } = await import('../src/partner/spec.js');
const { PORTAL_DEMO } = await import('../src/seed.js');
const EMAIL = process.env.PORTAL_EMAIL || PORTAL_DEMO.email, PASSWORD = process.env.PORTAL_PASSWORD || process.env.PORTAL_ADMIN_PASSWORD || PORTAL_DEMO.password;

const j = async (url, opts = {}) => { const r = await fetch(BASE + url, opts); return { status: r.status, body: await r.json() }; };
const login = await j('/api/portal/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) });
const portal = { authorization: `Bearer ${login.body.token}`, 'content-type': 'application/json' };
const created = await j('/api/portal/keys', { method: 'POST', headers: portal, body: JSON.stringify({ name: 'Docs example capture' }) });
const H = { authorization: `Bearer ${created.body.secret}`, 'content-type': 'application/json' };

// Keep examples readable: arrays to 3 items, long strings intact.
const trim = (v) => Array.isArray(v) ? v.slice(0, 3).map(trim) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, trim(x)])) : v;
const ep = Object.fromEntries(ENDPOINTS.map((e) => [e.id, e]));
const now = Date.now();
const fresh = (o, i = 0) => ({ ...o, id: `${o.id}-${now}-${i}`, timestamp: new Date(now - (i + 1) * 3600e3).toISOString() });
const restoreIds = (body, src) => { if (body?.results) body.results.forEach((r, i) => { if (src[i]) r.id = src[i].id; }); else if (body?.id && src[0]) body.id = src[0].id; return body; };

const ex = {};
// Ingest examples use the documented request bodies (with unique ids so they are accepted).
{ const b = ep['send-event'].bodyExample; const r = await j('/v1/events', { method: 'POST', headers: H, body: JSON.stringify(fresh(b)) }); ex['send-event'] = restoreIds(r.body, [b]); }
{ const list = ep['send-batch'].bodyExample.transactions; const r = await j('/v1/transactions/batch', { method: 'POST', headers: H, body: JSON.stringify({ transactions: list.map(fresh) }) }); ex['send-batch'] = restoreIds(r.body, list); }
const logs = await j('/v1/ingest/logs?limit=3', { headers: H });
ex['list-ingest-logs'] = logs.body;
ex['get-ingest-log'] = (await j(`/v1/ingest/logs/${ex['send-batch'].batch_id}`, { headers: H })).body;

const P = '9876500001';
const reads = {
  'get-user': `/v1/users/${P}`, 'get-summary': `/v1/users/${P}/summary?period=month`, 'get-categories': `/v1/users/${P}/categories?period=3m`,
  'get-merchants': `/v1/users/${P}/merchants?period=3m&limit=3`, 'get-behavior': `/v1/users/${P}/behavior`,
  'get-report': `/v1/users/${P}/report?month=${new Date(new Date().getFullYear(), new Date().getMonth() - 1, 15).toISOString().slice(0, 7)}`,
  'list-upi-ids': `/v1/users/${P}/upi-ids`, 'list-transactions': `/v1/users/${P}/transactions?limit=2`, 'get-offers': `/v1/users/${P}/offers?limit=2`,
  'list-segments': '/v1/segments', 'get-segment': '/v1/segments/high_food_delivery', 'list-categories': '/v1/categories',
};
for (const [id, url] of Object.entries(reads)) ex[id] = (await j(url, { headers: H })).body;
ex['offer-event'] = (await j('/v1/offers/events', { method: 'POST', headers: H, body: JSON.stringify(ep['offer-event'].bodyExample) })).body;
// Consent: write the current values back so the demo user is unchanged.
ex['update-consent'] = (await j(`/v1/users/${P}/consent`, { method: 'PUT', headers: H, body: JSON.stringify({ share_insights: true, ad_personalization: true }) })).body;
// The ingest examples used a sandbox phone; erasing it gives a real deletion example and leaves no trace.
ex['delete-user'] = (await j('/v1/users/9876500009', { method: 'DELETE', headers: H })).body;

// Leave no trace: remove the capture key and the deliveries it made (the examples are what we keep).
await j(`/api/portal/keys/${created.body.key.id}`, { method: 'DELETE', headers: portal });
const { db } = await import('../src/db.js');
db.prepare('DELETE FROM ingest_log WHERE key_id = ?').run(created.body.key.id);
db.prepare('DELETE FROM partner_keys WHERE id = ?').run(created.body.key.id);
for (const k of Object.keys(ex)) ex[k] = trim(ex[k]);
fs.writeFileSync(OUT, JSON.stringify(ex, null, 2));
console.log(`Captured ${Object.keys(ex).length} examples → ${path.relative(process.cwd(), OUT)}`);
