import { Router } from 'express';
import { db, json } from '../db.js';
import { requireAuth, HttpError } from '../lib/auth.js';
import { context } from '../lib/context.js';
import { CAMPAIGNS } from '../data/offers.js';

const r = Router();
const CAMP = Object.fromEntries(CAMPAIGNS.map((c) => [c.id, c]));

/** Revenue & funnel stats; scoped to one user or (partner view) everyone. */
export function adPerformance(userId) {
  const where = userId ? 'WHERE user_id = ?' : '';
  const rows = db.prepare(`SELECT ad_id, type, COUNT(*) n, SUM(value) v FROM ad_events ${where} GROUP BY ad_id, type`).all(...(userId ? [userId] : []));
  const by = new Map();
  for (const x of rows) {
    const e = by.get(x.ad_id) || { adId: x.ad_id, advertiser: CAMP[x.ad_id]?.advertiser || x.ad_id, title: CAMP[x.ad_id]?.title || '', views: 0, clicks: 0, dismissals: 0, conversions: 0, conversionValue: 0, helpful: 0, notRelevant: 0 };
    if (x.type === 'view') e.views += x.n; if (x.type === 'click') e.clicks += x.n; if (x.type === 'dismiss') e.dismissals += x.n;
    if (x.type === 'convert') { e.conversions += x.n; e.conversionValue += x.v || 0; }
    if (x.type === 'feedback_helpful') e.helpful += x.n; if (x.type === 'feedback_not_relevant') e.notRelevant += x.n;
    by.set(x.ad_id, e);
  }
  const ads = [...by.values()].map((e) => {
    const c = CAMP[e.adId] || { cpm: 0, cpc: 0, cpa: 0 };
    const byModel = { cpm: (e.views * c.cpm) / 1000, cpc: e.clicks * c.cpc, cpa: e.conversions * c.cpa };
    const revenue = byModel.cpm + byModel.cpc + byModel.cpa;
    return { ...e, ctr: e.views ? +(e.clicks / e.views).toFixed(3) : 0, conversionRate: e.clicks ? +(e.conversions / e.clicks).toFixed(3) : 0, revenue: +revenue.toFixed(2), byModel, revenuePer1kViews: e.views ? +((revenue / e.views) * 1000).toFixed(0) : 0 };
  }).sort((a, b) => b.revenue - a.revenue);
  const t = ads.reduce((a, e) => ({ views: a.views + e.views, clicks: a.clicks + e.clicks, conversions: a.conversions + e.conversions, dismissals: a.dismissals + e.dismissals, revenue: a.revenue + e.revenue, cpm: a.cpm + e.byModel.cpm, cpc: a.cpc + e.byModel.cpc, cpa: a.cpa + e.byModel.cpa }), { views: 0, clicks: 0, conversions: 0, dismissals: 0, revenue: 0, cpm: 0, cpc: 0, cpa: 0 });
  for (const e of ads) for (const k of Object.keys(e.byModel)) e.byModel[k] = +e.byModel[k].toFixed(2);
  const simulated = db.prepare(`SELECT COUNT(*) n FROM ad_events ${where ? where + ' AND' : 'WHERE'} source = 'simulated'`).get(...(userId ? [userId] : [])).n;
  const { cpm, cpc, cpa, ...rest } = t;
  return { totals: { ...rest, revenue: +t.revenue.toFixed(2), revenueByModel: { cpm: +cpm.toFixed(2), cpc: +cpc.toFixed(2), cpa: +cpa.toFixed(2) }, ctr: t.views ? +(t.clicks / t.views).toFixed(3) : 0, conversionRate: t.clicks ? +(t.conversions / t.clicks).toFixed(3) : 0, revenuePer1kViews: t.views ? Math.round((t.revenue / t.views) * 1000) : 0, industryCtrBaseline: 0.015 }, includesSimulated: simulated > 0, ads };
}

r.use(requireAuth);
const valid = (id) => { if (!CAMP[id]) throw new HttpError(404, 'Offer not found.'); };
const log = (userId, adId, type, value = 0, meta = null) => db.prepare('INSERT INTO ad_events (user_id, ad_id, type, value, meta) VALUES (?, ?, ?, ?, ?)').run(userId, adId, type, value, meta ? json.str(meta) : null);

r.get('/relevant', (req, res) => {
  const ctx = context(req.user);
  const limit = Math.min(12, Number(req.query.limit) || 4);
  const personalized = ctx.offers.all.filter((o) => o.personalized);
  res.json({
    personalization: !!req.user.ad_personalization,
    offers: limit > 4 ? personalized.slice(0, limit) : ctx.offers.top,
    personalized, // ranked by this user's spending
    generic: [...ctx.offers.all.filter((o) => !o.personalized), ...ctx.offers.generic], // everything else, after
  });
});
r.post('/:adId/view', (req, res) => {
  valid(req.params.adId);
  // De-duplicate impressions: one per ad per user per 30 minutes.
  const recent = db.prepare("SELECT 1 FROM ad_events WHERE user_id = ? AND ad_id = ? AND type = 'view' AND created_at > datetime('now', '-30 minutes')").get(req.user.id, req.params.adId);
  if (!recent) log(req.user.id, req.params.adId, 'view');
  res.json({ recorded: !recent });
});
r.post('/:adId/click', (req, res) => {
  valid(req.params.adId);
  log(req.user.id, req.params.adId, 'click');
  const c = CAMP[req.params.adId];
  res.json({ couponCode: c.code, advertiser: c.advertiser, title: c.title });
});
r.get('/performance', (req, res) => res.json(adPerformance(req.user.id)));
r.post('/feedback', (req, res) => {
  const { adId, feedback } = req.body || {};
  valid(adId);
  const type = { dismiss: 'dismiss', not_relevant: 'feedback_not_relevant', helpful: 'feedback_helpful', converted: 'convert' }[feedback];
  if (!type) throw new HttpError(400, 'Feedback must be dismiss, not_relevant, helpful or converted.');
  log(req.user.id, adId, type);
  if (type === 'feedback_not_relevant') log(req.user.id, adId, 'dismiss');
  res.json({ recorded: true, offers: context(req.user).offers.top });
});

export default r;
