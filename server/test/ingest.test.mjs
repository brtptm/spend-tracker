// Ingestion pipeline tests — run with `pnpm --filter ./server test`. Uses a throwaway database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'st-test-'));
process.env.DB_FILE = path.join(dir, 'test.db');
const { db, uid } = await import('../src/db.js');
const { ingest, validate, normalizePhone, cleanMerchantName, classify, linkOf } = await import('../src/partner/ingest.js');

const partner = (slug) => {
  const id = uid();
  db.prepare('INSERT INTO partners (id, slug, name) VALUES (?, ?, ?)').run(id, slug, slug);
  return { id, slug };
};
const PAYTM = partner('paytm-test'), ACME = partner('acme-test');
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
let n = 0;
const ev = (o = {}) => ({ id: `T-${++n}`, phone: '9876511111', amount: 250, timestamp: ago(2), payee_vpa: 'shop@ybl', ...o });

test('phone normalisation', () => {
  for (const p of ['9876543210', '+91 98765 43210', '919876543210', '09876543210', '98765-43210']) assert.equal(normalizePhone(p), '9876543210');
  for (const p of ['5876543210', '98765', '+1 9876543210', null, '']) assert.equal(normalizePhone(p), null);
});

test('merchant name cleaning', () => {
  assert.equal(cleanMerchantName('PAYTM*SWIGGY LIMITED 4412093'), 'Swiggy');
  assert.equal(cleanMerchantName('UPI-ZOMATO PVT LTD'), 'Zomato');
  assert.equal(cleanMerchantName('SHARMA SWEETS CORNER'), 'Sharma Sweets Corner');
  assert.equal(cleanMerchantName('', '9812345678@ybl'), 'Mobile ••••••5678');
  assert.match(cleanMerchantName('', 'swiggy.payu@hdfcbank'), /^Swiggy/);
});

test('classification priority: catalog > MCC > keywords > P2P', () => {
  const c = (o) => classify(validate(ev(o)).value, new Map());
  assert.deepEqual([c({ payee_vpa: 'swiggy.payu@hdfcbank' }).merchantName, c({ payee_vpa: 'swiggy.payu@hdfcbank' }).sub], ['Swiggy', 'food_delivery']);
  assert.equal(c({ payee_name: 'RAJ ELECTRONICS', payee_vpa: 'rajelec@okaxis', mcc: '5732' }).sub, 'electronics');
  assert.equal(c({ payee_name: 'RAJ ELECTRONICS', payee_vpa: 'rajelec@okaxis', mcc: '5732' }).source, 'mcc');
  assert.equal(c({ payee_vpa: '9812345678@ybl' }).category, 'p2p');
  assert.equal(c({ payee_name: 'PAYTM*H&M 4412093', payee_vpa: 'hm.payu@hdfcbank' }).merchantName, 'H&M');
  // A known merchant wins over a conflicting MCC.
  assert.equal(c({ payee_vpa: 'uber@axisbank', mcc: '5411' }).sub, 'cabs');
});

test('validation rejects with code and param', () => {
  const cases = [[{ phone: '123' }, 'invalid_phone', 'phone'], [{ amount: -5 }, 'invalid_amount', 'amount'], [{ amount: 2_000_000 }, 'invalid_amount', 'amount'],
    [{ timestamp: '2099-01-01T00:00:00Z' }, 'invalid_timestamp', 'timestamp'], [{ payee_vpa: 'not a vpa' }, 'invalid_vpa', 'payee_vpa'],
    [{ status: 'maybe' }, 'invalid_status', 'status'], [{ currency: 'USD' }, 'invalid_currency', 'currency'], [{ mcc: '12a' }, 'invalid_mcc', 'mcc'],
    [{ id: undefined }, 'missing_field', 'id'], [{ payee_vpa: undefined }, 'missing_field', 'payee_vpa']];
  for (const [o, code, param] of cases) { const r = validate(ev(o)); assert.equal(r.ok, false, code); assert.equal(r.code, code); assert.equal(r.param, param); }
  assert.equal(validate(ev({ amount: '₹1,249.50' })).value.amount, 1249.5);
});

test('ingest: accepts, filters junk, de-duplicates and updates status', () => {
  const T = ago(5);
  const out = ingest(PAYTM, [
    ev({ id: 'A1', payer_vpa: 'me@paytm', payee_vpa: 'zomato@hdfcbank', rrn: 'R1', timestamp: T }),
    ev({ id: 'A2', direction: 'credit' }),
    ev({ id: 'A3', status: 'pending' }),
    ev({ id: 'A4', payer_vpa: 'me@paytm', payee_vpa: 'me@paytm' }),
    ev({ id: 'A5', amount: 1, note: 'penny drop verification' }),
    ev({ id: 'A6', payee_vpa: 'zomato@hdfcbank', rrn: 'R1' }),
    ev({ id: 'A7', timestamp: new Date(Date.now() - 4 * 365 * 864e5).toISOString() }),
    ev({ id: 'A8', phone: 'bad' }),
  ]);
  const by = Object.fromEntries(out.results.map((r) => [r.id, r]));
  assert.equal(by.A1.status, 'accepted'); assert.equal(by.A1.transaction.merchant, 'Zomato');
  assert.equal(by.A2.code, 'credit_ignored'); assert.equal(by.A3.code, 'pending_ignored');
  assert.equal(by.A4.code, 'self_transfer'); assert.equal(by.A5.code, 'test_payment');
  assert.equal(by.A6.status, 'duplicate'); assert.equal(by.A7.code, 'too_old');
  assert.equal(by.A8.status, 'rejected'); assert.equal(out.users_created, 1);
  // Same id again: duplicate; new final status: update.
  assert.equal(ingest(PAYTM, [ev({ id: 'A1', payee_vpa: 'zomato@hdfcbank', timestamp: T })]).results[0].status, 'duplicate');
  assert.equal(ingest(PAYTM, [ev({ id: 'A1', status: 'reversed', payee_vpa: 'zomato@hdfcbank', timestamp: T })]).results[0].status, 'updated');
  assert.equal(db.prepare("SELECT status FROM transactions WHERE external_id = 'A1'").get().status, 'failed');
});

test('ingest records every payer UPI ID for the phone', () => {
  ingest(PAYTM, [ev({ phone: '9876522222', payer_vpa: 'old@ybl' }), ev({ phone: '9876522222', payer_vpa: 'new@paytm' }), ev({ phone: '9876522222', payer_vpa: 'new@paytm' })]);
  const u = db.prepare("SELECT id FROM users WHERE phone = '9876522222'").get();
  const vpas = Object.fromEntries(db.prepare('SELECT vpa, payments FROM user_vpas WHERE user_id = ?').all(u.id).map((r) => [r.vpa, r.payments]));
  assert.deepEqual(vpas, { 'old@ybl': 1, 'new@paytm': 2 });
});

test('tenant isolation: a partner cannot attach to another partner’s user', () => {
  ingest(PAYTM, [ev({ phone: '9876533333' })]);
  const u = db.prepare("SELECT id FROM users WHERE phone = '9876533333'").get();
  assert.ok(linkOf(u.id, PAYTM.id)?.owner);
  const r = ingest(ACME, [ev({ phone: '9876533333' })]).results[0];
  assert.equal(r.status, 'rejected'); assert.equal(r.code, 'user_not_linked');
  assert.equal(linkOf(u.id, ACME.id), undefined);
});

test('batch is atomic per call and reports per item', () => {
  const out = ingest(PAYTM, Array.from({ length: 200 }, (_, i) => ev({ phone: '9876544444', amount: 100 + i })));
  assert.equal(out.received, 200); assert.equal(out.accepted, 200);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM transactions t JOIN users u ON u.id = t.user_id WHERE u.phone = '9876544444'").get().n, 200);
});

test.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
