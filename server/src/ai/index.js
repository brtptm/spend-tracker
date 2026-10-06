// AI layer. The engine computes every number; Claude reads compact aggregates
// and adds language, judgement and categorisation for unknown merchants.
// Any failure returns the engine result so the UI never waits on the model.
import crypto from 'node:crypto';
import { db, json } from '../db.js';
import { askJSON, aiStatus, SYSTEM } from './claude.js';
import { serverModelJSON, serverModelStatus } from './serverModel.js';
import { checkSmallModelOutput } from './grounding.js';
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
/**
 * Provider chain for one AI task: Claude (API or local login) → in-process server model (if this task has a
 * small-model prompt) → engine. Results are cached per provider, so Claude output replaces a small-model
 * draft once Claude is back. `small` returns the promptFor() prompt for the small-model path.
 */
async function withAI(label, key, base, fn, { ttl, small } = {}) {
  const claude = aiStatus().enabled;
  const local = !!small && serverModelStatus().ready;
  if (!claude && !local) return { data: base, source: 'engine' };
  const provider = claude ? 'claude' : 'server-model';
  const pkey = key && (provider === 'claude' ? key : `${key}:server-model`);
  const hit = pkey && cacheGet(pkey, ttl);
  if (hit) return { data: hit.value, source: provider, model: provider === 'server-model' ? serverModelStatus().model : undefined, cached: true, generatedAt: hit.at };
  if (inflight.has(pkey)) return inflight.get(pkey);
  const runSmall = async () => {
    const prompt = small();
    const data = checkSmallModelOutput(prompt, await serverModelJSON(prompt));
    if (key) cacheSet(`${key}:server-model`, data);
    return { data, source: 'server-model', model: serverModelStatus().model, generatedAt: new Date().toISOString() };
  };
  const p = (async () => {
    try {
      if (provider === 'server-model') return await runSmall();
      const data = await fn();
      if (key) cacheSet(key, data);
      return { data, source: 'claude', generatedAt: new Date().toISOString() };
    } catch (err) {
      console.warn(`[ai] ${label}: ${provider} failed (${err.message.split('\n')[0]})`);
      if (provider === 'claude' && local) {
        try { return await runSmall(); } catch (e2) { console.warn(`[ai] ${label}: server model failed too (${e2.message})`); }
      }
      return { data: base, source: 'engine' };
    } finally { inflight.delete(pkey); }
  })();
  if (pkey) inflight.set(pkey, p);
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

// ── Prompts (shared by Claude on the server and the on-device model in the browser) ──
const briefingTask = (ctx) => `Write the top-of-dashboard briefing for this Paytm user from their aggregated data.

Data: ${J(ctx)}

Return JSON:
{"headline": "max 12 words, personal, mentions the biggest saving opportunity in ₹",
 "summary": "2 sentences on what happened in the last 30 days, with exact numbers",
 "observations": ["3 sharp, specific observations a friend would notice (patterns, times, merchants)"],
 "personality": "1 sentence describing their spending personality kindly"}`;
const askTask = (ctx, question) => `Answer the user's question about their money using only this data. If the data can't answer it, say so and suggest what would.

Data: ${J(ctx)}
Question: "${question}"

Return JSON: {"answer": "2-4 sentences, specific numbers, friendly", "followUps": ["3 short follow-up questions they might ask next"]}`;

function briefingBase(ctx, A, recs, profile, baseInsights) {
  const total = recs.filter((r) => !r.oneTime).reduce((a, r) => a + r.savingsMonthly, 0);
  return {
    headline: `${ctx.user.firstName}, you could keep ₹${total.toLocaleString('en-IN')} more every month.`,
    summary: `Your last 30 days came to ₹${A.s30.totalSpending.toLocaleString('en-IN')} across ${A.s30.transactionCount} payments. ${baseInsights[0]?.title || ''}`.trim(),
    observations: baseInsights.slice(0, 3).map((i) => i.description), personality: `${profile.spenderLabel}: ${profile.patterns.peakTimes.join(' & ')} is when you spend most.`,
  };
}
const ASK_BASE = { answer: 'I can answer questions about your spending once AI is enabled. Meanwhile, your dashboard and deep dives have the full breakdown.', followUps: ['Where do I overspend?', 'How much do I spend on food delivery?', 'Which subscriptions should I cancel?'] };

/**
 * Everything an on-device model needs to do the same job as Claude: the same system prompt and task,
 * the engine's fallback text, and the cache key. Numbers are computed here; the model only writes words.
 */
export function promptFor(kind, { user, A, recs, profile, insights: baseInsights, question }) {
  const ctx = contextFor(user, A, recs, profile);
  // Small on-device models paraphrase far better than they compose: give them the engine's accurate draft
  // (briefing) or a short fact sheet (ask), with no placeholder text they could echo back.
  const facts = J({ name: ctx.user.firstName, last30Days: ctx.last30Days, topMerchants: ctx.topMerchants.slice(0, 5), food: { deliveryOrdersPerMonth: ctx.food?.ordersPerMonth, estimatedDeliveryFeesMonthly: ctx.food?.estDeliveryFeesMonthly, averageOrder: ctx.food?.avgOrder, deliveryShareOfFoodPct: ctx.food?.deliveryShare }, subscriptions: ctx.subscriptions, peers: ctx.peers.filter((p) => p.you > p.average), peakTimes: ctx.profile.peakTimes, savings: ctx.recommendations });
  if (kind === 'briefing') {
    const base = briefingBase(ctx, A, recs, profile, baseInsights);
    return { kind, system: SYSTEM, task: briefingTask(ctx), max_tokens: 700, base, cache_key: dataFingerprint(user.id),
      task_small: `Rewrite this money briefing for ${ctx.user.firstName} so it sounds warm, personal and specific, like a friend who is good with money. Keep every rupee amount and number exactly as written. Do not add new numbers.

Draft: ${J(base)}

Return the same four fields: headline (one short sentence), summary (two sentences), observations (three short sentences), personality (one sentence).` };
  }
  return { kind, system: SYSTEM, task: askTask(ctx, question), max_tokens: 400, base: ASK_BASE, cache_key: hash('ask', user.id, ctx, question),
    // The engine has already done the reasoning; a small model only has to pick and phrase the right finding.
    task_small: `Key findings about ${ctx.user.firstName}'s money, most important first:
${(baseInsights || []).slice(0, 6).map((i, n) => `${n + 1}. ${i.title}. ${i.description}${i.potentialSavings ? ` Possible saving: ₹${i.potentialSavings.toLocaleString('en-IN')} a month.` : ''}`).join('\n')}

More facts: ${facts}

Question: ${question}

Answer in two or three friendly sentences, talking to ${ctx.user.firstName} as "you". Base the answer on the key findings above, most important first, and copy their numbers exactly — never move a number from one item to another. If nothing above answers the question, say so. Then suggest three short follow-up questions.` };
}

export async function aiNarrative(user, A, recs, profile, baseInsights) {
  const ctx = contextFor(user, A, recs, profile);
  const base = briefingBase(ctx, A, recs, profile, baseInsights);
  // Re-written only when the user's data changes (new/removed payments, re-categorisation).
  return withAI('narrative', hash('narr-v2', user.id, dataFingerprint(user.id)), base, async () => {
    const r = await askJSON(briefingTask(ctx), { effort: 'low', maxTokens: 2500 });
    return { headline: str(r.headline, base.headline), summary: str(r.summary, base.summary), observations: arr(r.observations, base.observations).slice(0, 4), personality: str(r.personality, base.personality) };
  }, { ttl: Infinity, small: () => promptFor('briefing', { user, A, recs, profile, insights: baseInsights }) });
}

export async function askMoney(user, A, recs, profile, question, insights) {
  const ctx = contextFor(user, A, recs, profile);
  const base = ASK_BASE;
  return withAI('ask', hash('ask', user.id, ctx, question), base, async () => {
    const r = await askJSON(askTask(ctx, question), { effort: 'low', maxTokens: 1500 });
    return { answer: str(r.answer, base.answer), followUps: arr(r.followUps, base.followUps).slice(0, 3) };
  }, { small: () => promptFor('ask', { user, A, recs, profile, insights, question }) });
}
