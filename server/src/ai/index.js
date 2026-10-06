// AI layer. The engine computes every number; Claude reads compact aggregates
// and adds language, judgement and categorisation for unknown merchants.
// Any failure returns the engine result so the UI never waits on the model.
import crypto from 'node:crypto';
import { db, json } from '../db.js';
import { askJSON, aiStatus } from './claude.js';
import { CATEGORIES, CATEGORY } from '../data/catalog.js';

export { aiStatus };
const TTL_MS = 12 * 3600 * 1000;
const hash = (...p) => crypto.createHash('sha1').update(JSON.stringify(p)).digest('hex');
const J = (v) => JSON.stringify(v);
const str = (v, fb) => (typeof v === 'string' && v.trim() ? v.trim() : fb);
const arr = (v, fb = []) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()) : fb);

function cacheGet(key, ttl = TTL_MS) {
  const r = db.prepare('SELECT value, created_at FROM ai_cache WHERE key = ?').get(key);
  if (!r || Date.now() - new Date(r.created_at + 'Z').getTime() > ttl) return null;
  return { value: json.parse(r.value), at: new Date(r.created_at.replace(' ', 'T') + 'Z').toISOString() };
}

/**
 * Fingerprint of the user's underlying data: every transaction's id, category and
 * status, plus their learned merchant rules. It only changes when payments are
 * imported/deleted or re-categorised — not as the clock moves rolling windows.
 */
export function dataFingerprint(userId) {
  const tx = db.prepare('SELECT id, category, sub, status FROM transactions WHERE user_id = ? ORDER BY id').all(userId);
  const rules = db.prepare('SELECT merchant_key, category, sub FROM merchant_rules WHERE user_id = ? ORDER BY merchant_key').all(userId);
  return hash(tx.map((t) => `${t.id}:${t.category}:${t.sub}:${t.status}`), rules);
}
const cacheSet = (key, value) => db.prepare("INSERT INTO ai_cache (key, value, created_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, created_at = excluded.created_at").run(key, json.str(value));

const inflight = new Map();
async function withAI(label, key, base, fn, { ttl } = {}) {
  if (!aiStatus().enabled) return { data: base, source: 'engine' };
  const hit = key && cacheGet(key, ttl);
  if (hit) return { data: hit.value, source: 'claude', cached: true, generatedAt: hit.at };
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      const data = await fn();
      if (key) cacheSet(key, data);
      return { data, source: 'claude', generatedAt: new Date().toISOString() };
    } catch (err) {
      console.warn(`[ai] ${label} fell back to engine: ${err.message.split('\n')[0]}`);
      return { data: base, source: 'engine' };
    } finally { inflight.delete(key); }
  })();
  if (key) inflight.set(key, p);
  return p;
}

const TAXONOMY = CATEGORIES.map((c) => `${c.id}: ${Object.keys(c.subs).join(', ')}`).join('\n');

/** Categorise merchants the rules couldn't place. */
export async function aiCategorize(rows) {
  if (!rows.length) return { data: [], source: 'engine' };
  const items = rows.slice(0, 60).map((r, i) => ({ i, merchant: r.merchantName, note: r.description || '', amount: r.amount }));
  return withAI('categorize', hash('cat', items), [], async () => {
    const r = await askJSON(`Categorise these Indian payment transactions.

Allowed categories and subcategories:
${TAXONOMY}

Transactions: ${J(items)}

Return JSON: {"results": [{"i": 0, "category": "food", "subcategory": "restaurants", "confidence": 0.0-1.0, "reasoning": "short"}]}
Use only the ids above. If a merchant is a person's name, use p2p.`, { effort: 'low', maxTokens: 4000 });
    return (r.results || []).filter((x) => CATEGORY[x.category]?.subs?.[x.subcategory] && Number.isInteger(x.i) && items[x.i])
      .map((x) => ({ id: rows[x.i].id, category: x.category, sub: x.subcategory, confidence: Math.max(0.5, Math.min(0.95, Number(x.confidence) || 0.7)), reasoning: str(x.reasoning, '') }));
  });
}

/** Compact, number-only context so the model never sees raw transactions. */
export function contextFor(user, A, recs, profile) {
  return {
    user: { firstName: user.name.split(' ')[0], city: user.city, incomeMonthly: user.income, household: user.household },
    last30Days: { total: A.s30.totalSpending, transactions: A.s30.transactionCount, avgDaily: A.s30.averageDailySpend },
    monthlyAverage3m: { total: A.s90.monthlyEquivalent, byCategory: Object.fromEntries(A.s90.byCategory.map((c) => [c.id, c.monthly])) },
    topMerchants: A.s90.byMerchant.slice(0, 8).map((m) => ({ name: m.name, monthly: m.monthly, ordersPerMonth: Math.round(m.count / 3) })),
    food: A.food, subscriptions: A.subs.list.map((s) => ({ name: s.merchant, monthly: s.monthly })), overlaps: A.subs.overlaps,
    peers: A.peers.rows.map((r) => ({ category: r.id, you: r.you, average: r.average })),
    anomalies: A.anomalies.slice(0, 4).map((a) => a.description),
    profile: { type: profile.spenderLabel, peakTimes: profile.patterns.peakTimes, couponUsage: profile.couponUsageRate },
    recommendations: recs.slice(0, 6).map((r) => ({ id: r.id, title: r.title, savingsMonthly: r.savingsMonthly })),
  };
}

export async function aiNarrative(user, A, recs, profile, baseInsights) {
  const ctx = contextFor(user, A, recs, profile);
  const total = recs.filter((r) => !r.oneTime).reduce((a, r) => a + r.savingsMonthly, 0);
  const base = {
    headline: `${ctx.user.firstName}, you could keep ₹${total.toLocaleString('en-IN')} more every month.`,
    summary: `Your last 30 days came to ₹${A.s30.totalSpending.toLocaleString('en-IN')} across ${A.s30.transactionCount} payments. ${baseInsights[0]?.title || ''}`.trim(),
    observations: baseInsights.slice(0, 3).map((i) => i.description), personality: `${profile.spenderLabel}: ${profile.patterns.peakTimes.join(' & ')} is when you spend most.`,
  };
  // Re-written only when the user's data changes (new/removed payments, re-categorisation).
  return withAI('narrative', hash('narr-v2', user.id, dataFingerprint(user.id)), base, async () => {
    const r = await askJSON(`Write the top-of-dashboard briefing for this Paytm user from their aggregated data.

Data: ${J(ctx)}

Return JSON:
{"headline": "max 12 words, personal, mentions the biggest saving opportunity in ₹",
 "summary": "2 sentences on what happened in the last 30 days, with exact numbers",
 "observations": ["3 sharp, specific observations a friend would notice (patterns, times, merchants)"],
 "personality": "1 sentence describing their spending personality kindly"}`, { effort: 'low', maxTokens: 2500 });
    return { headline: str(r.headline, base.headline), summary: str(r.summary, base.summary), observations: arr(r.observations, base.observations).slice(0, 4), personality: str(r.personality, base.personality) };
  }, { ttl: Infinity });
}

export async function askMoney(user, A, recs, profile, question) {
  const ctx = contextFor(user, A, recs, profile);
  const base = { answer: 'I can answer questions about your spending once AI is enabled. Meanwhile, your dashboard and deep dives have the full breakdown.', followUps: ['Where do I overspend?', 'How much do I spend on food delivery?', 'Which subscriptions should I cancel?'] };
  return withAI('ask', hash('ask', user.id, ctx, question), base, async () => {
    const r = await askJSON(`Answer the user's question about their money using only this data. If the data can't answer it, say so and suggest what would.

Data: ${J(ctx)}
Question: "${question}"

Return JSON: {"answer": "2-4 sentences, specific numbers, friendly", "followUps": ["3 short follow-up questions they might ask next"]}`, { effort: 'low', maxTokens: 1500 });
    return { answer: str(r.answer, base.answer), followUps: arr(r.followUps, base.followUps).slice(0, 3) };
  });
}

/** Partner-facing ad persona (Paytm B2B). */
export async function aiAdStrategy(user, A, profile, offers) {
  const base = null;
  const ctx = { profile: { type: profile.spenderType, sensitivity: profile.sensitivity, loyalty: profile.brandLoyalty, favorites: profile.favorites }, monthly: A.s90.byCategory.map((c) => ({ id: c.id, monthly: c.monthly })), candidates: offers.slice(0, 8).map((o) => ({ id: o.adId, advertiser: o.advertiser, title: o.title, relevance: o.relevanceScore, ctr: o.expectedCTR, cpm: o.impressionValue })) };
  return withAI('adStrategy', hash('ads', user.id, ctx), base, async () => {
    const r = await askJSON(`You are an ad strategist. Classify this user's behaviour for relevant (never generic) offers.

Data: ${J(ctx)}

Return JSON: {"adPersona": "convenience_spender|deal_hunter|luxury_buyer|budget_conscious|subscription_collector", "summary": "1 sentence", "bestPlacement": "dashboard_card|notification|feed", "recommendedDiscountRange": "₹X–₹Y", "adsToAvoid": ["short"], "notes": "1 sentence on timing (use their peak times)"}`, { effort: 'low', maxTokens: 1200 });
    return { adPersona: str(r.adPersona, profile.spenderType), summary: str(r.summary, ''), bestPlacement: str(r.bestPlacement, 'dashboard_card'), recommendedDiscountRange: str(r.recommendedDiscountRange, ''), adsToAvoid: arr(r.adsToAvoid), notes: str(r.notes, '') };
  });
}
