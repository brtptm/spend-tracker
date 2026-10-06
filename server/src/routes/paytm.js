// Partner (B2B) API for Paytm. Authenticated with an API key, and it only ever
// returns data for users who consented to sharing insights with Paytm.
import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { HttpError } from '../lib/auth.js';
import { context } from '../lib/context.js';
import { adPerformance } from './ads.js';
import { CAMPAIGNS } from '../data/offers.js';
import { aiAdStrategy } from '../ai/index.js';

export const PARTNER_KEY = process.env.PAYTM_API_KEY || 'demo-paytm-partner-key';
const r = Router();

r.use((req, _res, next) => {
  const key = req.get('x-api-key') || '';
  const a = Buffer.from(key), b = Buffer.from(PARTNER_KEY);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpError(401, 'Missing or invalid x-api-key.');
  next();
});

function consented(userId) {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!u) throw new HttpError(404, 'User not found.');
  if (!u.consent_partner) throw new HttpError(403, 'This user has not consented to share spending insights with Paytm.');
  return context(u);
}
const tier = (m) => (m >= 80000 ? 'high' : m >= 35000 ? 'medium' : 'low');

r.get('/user/:userId/spending-summary', (req, res) => {
  const c = consented(req.params.userId);
  res.json({ user_id: c.user.id, total_monthly: c.A.s90.monthlyEquivalent, last_30_days: c.A.s30.totalSpending, top_category: c.A.s90.byCategory[0]?.id, spending_tier: tier(c.A.s90.monthlyEquivalent), primary_merchants: c.A.s90.topMerchants, transactions_per_month: c.profile.patterns.transactionsPerMonth, last_updated: c.txns.at(-1)?.ts.toISOString() });
});
r.get('/user/:userId/category-breakdown', (req, res) => {
  const c = consented(req.params.userId);
  res.json({ user_id: c.user.id, period: 'monthly_average_3m', ...Object.fromEntries(c.A.s90.byCategory.map((x) => [x.id, x.monthly])) });
});
r.get('/user/:userId/merchant-behavior', (req, res) => {
  const c = consented(req.params.userId);
  const ms = c.A.s90.byMerchant.filter((m) => m.category !== 'p2p').slice(0, 10);
  const max = ms[0]?.monthly || 1;
  res.json({ user_id: c.user.id, merchants: ms.map((m) => ({ name: m.name, spending: m.monthly, frequency: Math.round(m.count / 3), preference_score: +(0.4 + 0.6 * (m.monthly / max)).toFixed(2) })), brand_loyalty: c.profile.brandLoyalty, price_sensitivity: c.profile.sensitivity.toPrice });
});
r.get('/user/:userId/behavioral-profile', (req, res) => {
  const c = consented(req.params.userId);
  const p = c.profile;
  res.json({ user_id: c.user.id, spender_type: p.spenderType, primary_motivation: p.primaryMotivation, discount_sensitivity: p.sensitivity.toDiscounts, deal_response: p.sensitivity.toDiscounts > 0.7 ? 'high' : p.sensitivity.toDiscounts > 0.45 ? 'medium' : 'low', recommendation_acceptance: p.sensitivity.toRecommendations, churn_risk: p.churnRisk, peak_times: p.patterns.peakTimes, peak_days: p.patterns.peakDays, lifetime_value_estimate: p.lifetimeValueEstimate, ad_monetization_potential: c.offers.top.some((o) => o.tier === 1) ? 'high' : 'medium' });
});
r.get('/user/:userId/ad-recommendations', async (req, res) => {
  const c = consented(req.params.userId);
  const fmt = (o) => ({ ad_id: o.adId, category: o.targetSub, suggested_merchant: o.advertiser, suggested_offer: o.title, relevance: o.relevanceScore, reason: o.relevanceReason, expected_conversion: o.expectedCTR, estimated_cpm: o.impressionValue });
  const body = { user_id: c.user.id, personalization_allowed: !!c.user.ad_personalization, high_relevance: c.offers.all.filter((o) => o.tier === 1).map(fmt), medium_relevance: c.offers.all.filter((o) => o.tier === 2).map(fmt), low_relevance: c.offers.all.filter((o) => o.tier === 3).slice(0, 5).map(fmt) };
  if (req.query.ai === '1') body.strategy = (await aiAdStrategy(c.user, c.A, c.profile, c.offers.all)).data;
  res.json(body);
});

const SEGMENTS = {
  high_food_spenders: { label: 'High food-delivery spenders', test: (c) => c.A.food.ordersPerMonth >= 25 },
  fashion_shoppers: { label: 'Frequent fashion shoppers', test: (c) => c.A.s90.byMerchant.filter((m) => ['fashion', 'beauty'].includes(m.sub)).reduce((s, m) => s + m.monthly, 0) >= 2500 },
  subscription_heavy: { label: 'Subscription-heavy users', test: (c) => c.A.subs.count >= 5 },
  deal_hunters: { label: 'Deal hunters', test: (c) => c.profile.couponUsageRate >= 0.4 },
  frequent_riders: { label: 'Frequent cab riders', test: (c) => c.A.s90.byMerchant.filter((m) => m.sub === 'cabs').reduce((s, m) => s + m.count, 0) / 3 >= 15 },
};
r.get('/users/segment/:segmentId', (req, res) => {
  const S = SEGMENTS[req.params.segmentId];
  if (!S) throw new HttpError(404, `Unknown segment. Try: ${Object.keys(SEGMENTS).join(', ')}`);
  const users = db.prepare('SELECT * FROM users WHERE consent_partner = 1').all().filter((u) => db.prepare('SELECT 1 FROM transactions WHERE user_id = ? LIMIT 1').get(u.id));
  const members = users.map((u) => context(u)).filter((c) => S.test(c));
  const avg = members.length ? Math.round(members.reduce((s, c) => s + c.A.s90.monthlyEquivalent, 0) / members.length) : 0;
  const merchants = new Map(); for (const c of members) for (const m of c.A.s90.byMerchant.slice(0, 5)) merchants.set(m.name, (merchants.get(m.name) || 0) + m.monthly);
  const campaigns = new Map(); for (const c of members) for (const o of c.offers.top) campaigns.set(o.adId, { ad_id: o.adId, advertiser: o.advertiser, title: o.title, users: (campaigns.get(o.adId)?.users || 0) + 1 });
  res.json({ segment: req.params.segmentId, label: S.label, user_count: members.length, consented_population: users.length, avg_monthly_spend: avg, top_merchants: [...merchants.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n]) => n), recommended_campaigns: [...campaigns.values()].sort((a, b) => b.users - a.users).slice(0, 5), note: 'Aggregated over consented users only; no individual identities are returned.' });
});
r.get('/segments', (_req, res) => res.json({ segments: Object.entries(SEGMENTS).map(([id, s]) => ({ id, label: s.label })) }));

r.post('/feedback/ad-performance', (req, res) => {
  const { ad_id, user_id, shown, clicked, converted, conversion_amount = 0 } = req.body || {};
  if (!CAMPAIGNS.some((c) => c.id === ad_id)) throw new HttpError(400, 'Unknown ad_id.');
  const ins = db.prepare("INSERT INTO ad_events (user_id, ad_id, type, value, source) VALUES (?, ?, ?, ?, 'paytm')");
  const uidOk = user_id && db.prepare('SELECT 1 FROM users WHERE id = ?').get(user_id) ? user_id : null;
  if (shown) ins.run(uidOk, ad_id, 'view', 0);
  if (clicked) ins.run(uidOk, ad_id, 'click', 0);
  if (converted) ins.run(uidOk, ad_id, 'convert', Number(conversion_amount) || 0);
  res.json({ status: 'recorded' });
});
r.get('/ads/performance', (_req, res) => res.json(adPerformance(null)));

export default r;
