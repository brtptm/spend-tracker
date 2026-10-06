import { db, json, uid, tx } from '../db.js';
import { categorize, merchantKey } from '../engine/categorize.js';
import { behavioralProfile } from '../engine/analytics.js';
import { HttpError } from './auth.js';

export const getUser = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);

export function userRules(userId) {
  return new Map(db.prepare('SELECT merchant_key, category, sub FROM merchant_rules WHERE user_id = ?').all(userId).map((r) => [r.merchant_key, r]));
}

/** Load a user's transactions as plain objects with Date timestamps. */
export function loadTxns(userId, { months } = {}) {
  const since = months ? new Date(new Date().getFullYear(), new Date().getMonth() - months, new Date().getDate()).toISOString() : '0000';
  return db.prepare('SELECT * FROM transactions WHERE user_id = ? AND ts >= ? ORDER BY ts').all(userId, since).map(rowOut);
}

export const rowOut = (r) => ({
  id: r.id, ts: new Date(r.ts), amount: r.amount, merchant: r.merchant_name, merchantId: r.merchant_id, category: r.category, sub: r.sub,
  confidence: r.confidence, catSource: r.cat_source, originalCategory: r.original_category, description: r.description, paymentMethod: r.payment_method,
  status: r.status, location: r.location, couponUsed: !!r.coupon_used, isRecurring: !!r.is_recurring, tags: json.parse(r.tags, []),
});

export const txnOut = (t) => ({
  transactionId: t.id, timestamp: t.ts.toISOString(), amount: t.amount, merchantName: t.merchant, merchantId: t.merchantId, merchantCategory: t.sub,
  categoryAssigned: t.category, subcategory: t.sub, categoryConfidence: t.confidence, categorySource: t.catSource, originalCategory: t.originalCategory,
  description: t.description, paymentMethod: t.paymentMethod, status: t.status, location: t.location, couponUsed: t.couponUsed, isRecurring: t.isRecurring, tags: t.tags,
});

/** Categorise and store raw transactions. Returns counts and rows that need review. */
export function importTransactions(userId, rows, { replace = false } = {}) {
  const rules = userRules(userId);
  const ins = db.prepare(`INSERT INTO transactions (id, user_id, ts, amount, merchant_name, merchant_id, category, sub, confidence, cat_source, description, payment_method, status, location, coupon_used, is_recurring)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const review = [];
  let count = 0;
  tx(() => {
    if (replace) db.prepare('DELETE FROM transactions WHERE user_id = ?').run(userId);
    for (const r of rows) {
      const c = categorize(r, rules);
      const id = uid();
      ins.run(id, userId, r.timestamp, r.amount, r.merchantName, c.merchantId, c.category, c.sub, c.confidence, c.source, r.description || '', r.paymentMethod || 'UPI', r.status || 'completed', r.location || null, r.couponUsed ? 1 : 0, r.isRecurring ? 1 : 0);
      if (c.needsReview) review.push({ id, merchantName: r.merchantName, description: r.description, amount: r.amount });
      count++;
    }
  });
  return { imported: count, needsReview: review };
}

/** A user's correction updates the transaction and teaches the merchant rule. */
export function recategorize(userId, txnId, category, sub, { applyToMerchant = true } = {}) {
  const t = db.prepare('SELECT * FROM transactions WHERE id = ? AND user_id = ?').get(txnId, userId);
  if (!t) throw new HttpError(404, 'Transaction not found.');
  tx(() => {
    db.prepare("UPDATE transactions SET category = ?, sub = ?, confidence = 1, cat_source = 'user', original_category = COALESCE(original_category, ?), updated_at = datetime('now') WHERE id = ?").run(category, sub, t.category, txnId);
    if (applyToMerchant) {
      const key = merchantKey(t.merchant_name);
      db.prepare('INSERT INTO merchant_rules (user_id, merchant_key, category, sub) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, merchant_key) DO UPDATE SET category = excluded.category, sub = excluded.sub').run(userId, key, category, sub);
      db.prepare("UPDATE transactions SET category = ?, sub = ?, confidence = 0.99, cat_source = 'user', original_category = COALESCE(original_category, category), updated_at = datetime('now') WHERE user_id = ? AND merchant_name = ? AND id != ? AND cat_source != 'user'").run(category, sub, userId, t.merchant_name, txnId);
    }
  });
  return rowOut(db.prepare('SELECT * FROM transactions WHERE id = ?').get(txnId));
}

export function requireData(userId) {
  const n = db.prepare('SELECT COUNT(*) n FROM transactions WHERE user_id = ?').get(userId).n;
  if (!n) throw new HttpError(409, 'Connect your Paytm history or upload a CSV first.');
}

export function profileFor(user, txns) {
  return behavioralProfile(txns ?? loadTxns(user.id), { income: user.income });
}

/** Dismissed/clicked ad state for relevance learning. */
export function adState(userId) {
  const dismissed = new Map(db.prepare("SELECT ad_id, MAX(created_at) at FROM ad_events WHERE user_id = ? AND type = 'dismiss' GROUP BY ad_id").all(userId).map((r) => [r.ad_id, new Date(r.at + 'Z').getTime()]));
  const clicked = new Set(db.prepare("SELECT DISTINCT ad_id FROM ad_events WHERE user_id = ? AND type = 'click'").all(userId).map((r) => r.ad_id));
  return { dismissed, clicked };
}

export const recStates = (userId) => new Map(db.prepare('SELECT rec_id, status, baseline, updated_at FROM rec_state WHERE user_id = ?').all(userId).map((r) => [r.rec_id, r]));
