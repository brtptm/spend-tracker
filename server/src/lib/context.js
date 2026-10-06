import { db, json, uid } from '../db.js';
import { loadTxns, getUser, profileFor, adState, recStates, requireData } from './store.js';
import { buildAnalysis, recommendations, insights, rankOffers, challenges } from '../engine/insights.js';
import { periodRange, summarize } from '../engine/analytics.js';
import { CATEGORY, categoryName } from '../data/catalog.js';

const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

/** Lazily computed per-request view of one user's money. */
export function context(userOrId, { period = '30d' } = {}) {
  const user = typeof userOrId === 'string' ? getUser(userOrId) : userOrId;
  requireData(user.id);
  const txns = loadTxns(user.id, { months: Math.max(12, user.period_months || 6) });
  const memo = {};
  const once = (k, fn) => (k in memo ? memo[k] : (memo[k] = fn()));
  const ctx = {
    user, txns,
    get A() { return once('A', () => buildAnalysis(txns, user, { period })); },
    get profile() { return once('profile', () => profileFor(user, txns)); },
    get recs() {
      return once('recs', () => {
        const st = recStates(user.id);
        return recommendations(ctx.A).map((r) => ({ ...r, recommendationId: r.id, status: st.get(r.id)?.status || 'active', acceptedAt: st.get(r.id)?.status === 'accepted' ? st.get(r.id).updated_at : null }));
      });
    },
    get insights() { return once('insights', () => insights(ctx.A, ctx.recs.filter((r) => r.status !== 'declined'))); },
    get offers() { return once('offers', () => rankOffers(ctx.A, ctx.profile, { personalization: !!user.ad_personalization, ...adState(user.id) })); },
    get challenges() {
      return once('challenges', () => {
        const rows = new Map(db.prepare('SELECT * FROM challenges WHERE user_id = ?').all(user.id).map((r) => [r.challenge_id, r]));
        return challenges(ctx.A).map((c) => ({ ...c, ...challengeProgress(ctx, c, rows.get(c.id)) }));
      });
    },
    get budgets() { return once('budgets', () => budgetStatus(user.id, txns)); },
  };
  return ctx;
}

function challengeProgress(ctx, c, row) {
  if (!row) return { status: 'available' };
  const R = periodRange('month');
  const cur = ctx.txns.filter((t) => t.ts >= R.start && t.status === 'completed');
  let value = 0;
  if (c.metric === 'category_spend') value = cur.filter((t) => t.category === c.category).reduce((s, t) => s + t.amount, 0);
  if (c.metric === 'delivery_orders') value = cur.filter((t) => t.sub === 'food_delivery').length;
  if (c.metric === 'subscription_count') value = ctx.A.subs.count;
  if (c.metric === 'weekend_spend') { const sat = cur.filter((t) => [0, 6].includes(t.ts.getDay())); value = sat.reduce((s, t) => s + t.amount, 0); }
  const dayFrac = new Date().getDate() / new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const onTrack = c.metric === 'subscription_count' ? value <= row.target : value <= row.target * Math.max(dayFrac, 0.05);
  return { status: row.status, startedAt: row.started_at, current: Math.round(value), onTrack, progress: Math.min(100, Math.round((1 - Math.max(0, value - row.target * dayFrac) / Math.max(1, row.baseline)) * 100)) };
}

export function budgetStatus(userId, txns, now = new Date()) {
  const rows = db.prepare('SELECT * FROM budgets WHERE user_id = ? ORDER BY category').all(userId);
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const day = Math.max(1, now.getDate());
  const cur = txns.filter((t) => t.ts >= start && t.status === 'completed');
  const items = rows.map((b) => {
    const spent = cur.filter((t) => b.category === 'total' || t.category === b.category).reduce((s, t) => s + t.amount, 0);
    const expected = (b.amount * day) / daysInMonth;
    const projected = (spent / day) * daysInMonth;
    const status = spent > b.amount ? 'over' : projected > b.amount * 1.05 ? 'at_risk' : 'on_track';
    return {
      budgetId: b.id, category: b.category, name: b.category === 'total' ? 'Total' : categoryName(b.category), color: CATEGORY[b.category]?.color || '#c6f432',
      budget: b.amount, spent: Math.round(spent), remaining: Math.round(b.amount - spent), expectedByToday: Math.round(expected), projected: Math.round(projected),
      percentUsed: Math.round((spent / b.amount) * 100), status, dailyAllowance: Math.max(0, Math.round((b.amount - spent) / Math.max(1, daysInMonth - day + 1))),
    };
  });
  return { month: start.toISOString().slice(0, 7), dayOfMonth: day, daysInMonth, items, overCount: items.filter((i) => i.status !== 'on_track').length };
}

/** Create alerts from the latest analysis (idempotent per key). */
export function syncAlerts(ctx) {
  const settings = json.parse(ctx.user.settings, {});
  const ins = db.prepare('INSERT OR IGNORE INTO alerts (id, user_id, key, type, severity, title, body, link) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const week = (() => { const d = new Date(); const onejan = new Date(d.getFullYear(), 0, 1); return `${d.getFullYear()}-w${Math.ceil(((d - onejan) / 86400000 + onejan.getDay() + 1) / 7)}`; })();
  const month = new Date().toISOString().slice(0, 7);
  if (settings.unusualSpending !== false) for (const a of ctx.A.anomalies) {
    ins.run(uid(), ctx.user.id, `anomaly:${a.type}:${a.merchant || a.category}:${(a.at || month).slice(0, 10)}`, 'unusual', a.severity === 'high' ? 'critical' : a.severity === 'medium' ? 'warning' : 'info', a.type === 'duplicate' ? 'Possible duplicate charge' : a.type === 'fraud_risk' ? 'Unusual late-night payment' : a.type === 'spike' ? `${categoryName(a.category)} spending spiked` : a.type === 'new_merchant' ? 'New merchant' : 'Large purchase', a.description, a.category && a.category !== 'all' ? `/category/${a.category}` : '/trends');
  }
  if (settings.budgetAlerts !== false) for (const b of ctx.budgets.items.filter((i) => i.status !== 'on_track')) {
    ins.run(uid(), ctx.user.id, `budget:${b.category}:${month}:${b.status}`, 'budget', b.status === 'over' ? 'critical' : 'warning', b.status === 'over' ? `${b.name} budget exceeded` : `${b.name} budget at risk`, `${inr(b.spent)} of ${inr(b.budget)} spent; on pace for ${inr(b.projected)} this month.`, '/budget');
  }
  for (const o of ctx.A.subs.overlaps) ins.run(uid(), ctx.user.id, `overlap:${o.sub}:${month}`, 'subscription', 'warning', `Overlapping ${o.label.toLowerCase()} subscriptions`, `${o.services.join(' + ')} cost ${inr(o.monthly)}/month.`, '/recommendations');
  if (settings.dealAlerts !== false && ctx.user.ad_personalization) { const top = ctx.offers.top.find((o) => o.tier === 1); if (top) ins.run(uid(), ctx.user.id, `deal:${top.adId}:${week}`, 'deal', 'info', `${top.advertiser}: ${top.title}`, top.relevanceReason, '/offers'); }
  if (settings.weeklySummary !== false) ins.run(uid(), ctx.user.id, `weekly:${week}`, 'summary', 'info', 'Your weekly summary is ready', `Last 30 days: ${inr(ctx.A.s30.totalSpending)} across ${ctx.A.s30.transactionCount} payments.`, '/trends');
}

export { summarize, periodRange };
