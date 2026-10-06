import { Router } from 'express';
import { db } from '../db.js';
import { requireAuth, HttpError, publicUser } from '../lib/auth.js';
import { context, syncAlerts } from '../lib/context.js';
import { monthlySeries, heatmap, periodRange, summarize, foodStats, WEEKDAYS } from '../engine/analytics.js';
import { CATEGORY, CATEGORIES } from '../data/catalog.js';
import { txnOut } from '../lib/store.js';
import { aiNarrative, askMoney, aiStatus, promptFor } from '../ai/index.js';

const r = Router();
r.use(requireAuth);
const r0 = Math.round;

// Same-length window immediately before the selected one, for "vs previous" context.
function previousPeriod(txns, S) {
  const start = new Date(S.start), end = new Date(S.end), len = end - start;
  const R = { start: new Date(start - len), end: new Date(start - 1), monthsEq: len / (30.44 * 864e5) };
  const P = summarize(txns, R);
  const change = P.totalSpending ? Math.round(((S.totalSpending - P.totalSpending) / P.totalSpending) * 100) : null;
  return { totalSpending: P.totalSpending, change, byCategory: Object.fromEntries(P.byCategory.map((c) => [c.id, c.amount])) };
}

r.get('/dashboard', (req, res) => {
  const ctx = context(req.user, { period: req.query.period });
  syncAlerts(ctx);
  const series = monthlySeries(ctx.txns, 6);
  const active = ctx.recs.filter((x) => x.status !== 'declined' && !x.oneTime);
  res.json({
    user: publicUser(ctx.user),
    summary: ctx.A.summary,
    previous: previousPeriod(ctx.txns, ctx.A.summary),
    series,
    insights: ctx.insights.slice(0, 5),
    offers: ctx.offers.top,
    carousel: ctx.offers.all.filter((o) => o.personalized).slice(0, 5).concat(ctx.offers.all.some((o) => o.personalized) ? [] : ctx.offers.generic.slice(0, 4)),
    recommendations: ctx.recs.filter((x) => x.status === 'active').slice(0, 3),
    savingsPotential: { monthly: active.reduce((s, x) => s + x.savingsMonthly, 0), annual: active.reduce((s, x) => s + x.savingsAnnual, 0) },
    budget: ctx.budgets,
    profile: { spenderType: ctx.profile.spenderType, spenderLabel: ctx.profile.spenderLabel, peakTimes: ctx.profile.patterns.peakTimes },
    subscriptions: { count: ctx.A.subs.count, monthly: ctx.A.subs.total },
    unreadAlerts: db.prepare('SELECT COUNT(*) n FROM alerts WHERE user_id = ? AND read = 0').get(ctx.user.id).n,
    ai: aiStatus(),
  });
});

r.get('/trends', (req, res) => {
  const months = [3, 6, 12].includes(Number(req.query.months)) ? Number(req.query.months) : 6;
  const ctx = context(req.user);
  const R = periodRange(`${months}m`);
  const grid = heatmap(ctx.txns, R);
  const weekday = WEEKDAYS.map((d, i) => ({ day: d.slice(0, 3), amount: grid[i].reduce((a, b) => a + b, 0) }));
  const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, amount: grid.reduce((s, row) => s + row[h], 0) }));
  res.json({ months, series: monthlySeries(ctx.txns, months), heatmap: grid, weekday, hourly, anomalies: ctx.A.anomalies, subscriptions: ctx.A.subs });
});

r.get('/insights', async (req, res) => {
  const ctx = context(req.user);
  const body = { insights: ctx.insights, anomalies: ctx.A.anomalies };
  if (req.query.ai === '1') body.briefing = await aiNarrative(ctx.user, ctx.A, ctx.recs, ctx.profile, ctx.insights);
  res.json(body);
});

r.get('/category/:categoryId', (req, res) => {
  const C = CATEGORY[req.params.categoryId];
  if (!C) throw new HttpError(404, 'Category not found.');
  const ctx = context(req.user, { period: req.query.period || '3m' });
  const R = ctx.A.R;
  const sum = summarize(ctx.txns.filter((t) => t.category === C.id), R);
  const merchants = sum.byMerchant;
  const subs = Object.entries(C.subs).map(([id, name]) => {
    const ms = merchants.filter((m) => m.sub === id);
    const amount = ms.reduce((s, m) => s + m.amount, 0);
    const count = ms.reduce((s, m) => s + m.count, 0);
    return { id, name, amount, monthly: r0(amount / R.monthsEq), count, perMonth: r0(count / R.monthsEq), avgTicket: count ? r0(amount / count) : 0, percentage: sum.totalSpending ? r0((amount / sum.totalSpending) * 100) : 0, merchants: ms.slice(0, 5) };
  }).filter((s) => s.amount > 0).sort((a, b) => b.amount - a.amount);
  const S = ctx.txns.filter((t) => t.category === C.id && t.status === 'completed' && t.ts >= R.start);
  const hours = Array(24).fill(0); for (const t of S) hours[t.ts.getHours()]++;
  const peak = hours.map((v, h) => [h, v]).sort((a, b) => b[1] - a[1]).slice(0, 2).filter(([, v]) => v).map(([h]) => `${h}:00–${h + 1}:00`);
  const keyInsights = [];
  if (C.id === 'food') {
    const f = foodStats(ctx.txns, R);
    keyInsights.push(`You order delivery ${f.ordersPerMonth} times a month (${f.ordersPerDay}/day).`, `${f.deliveryShare}% of food spending goes to delivery apps.`, `Estimated delivery & platform fees: ₹${f.estDeliveryFeesMonthly.toLocaleString('en-IN')}/month (≈₹45/order).`);
    if (f.peakTimes.length) keyInsights.push(`Peak order times: ${f.peakTimes.join(' and ')}.`);
    if (f.topDish) keyInsights.push(`Most ordered: ${f.topDish.name} (~${f.topDish.timesPerMonth} times a month).`);
  } else {
    if (merchants[0]) keyInsights.push(`${merchants[0].name} is ${sum.totalSpending ? r0((merchants[0].amount / sum.totalSpending) * 100) : 0}% of your ${C.name.toLowerCase()} spend.`);
    keyInsights.push(`${r0(S.length / R.monthsEq)} payments a month, average ₹${sum.averageTicket.toLocaleString('en-IN')}.`);
    if (peak.length) keyInsights.push(`You usually spend here at ${peak.join(' and ')}.`);
  }
  const series = monthlySeries(ctx.txns, 6).months.map((m) => ({ month: m.month, label: m.label, amount: m[C.id], partial: m.partial }));
  res.json({
    category: { id: C.id, name: C.name, emoji: C.emoji, color: C.color }, period: R.label,
    total: sum.totalSpending, monthly: sum.monthlyEquivalent, count: sum.transactionCount, avgTicket: sum.averageTicket,
    subcategories: subs, merchants: merchants.slice(0, 12), keyInsights, series,
    opportunities: ctx.recs.filter((x) => x.category === C.id),
    offers: ctx.offers.all.filter((o) => o.targetCategory === C.id).slice(0, 4),
    comparison: ctx.A.peers.rows.find((x) => x.id === C.id), cohort: ctx.A.peers.cohort,
    recent: S.slice(-8).reverse().map(txnOut),
  });
});

r.get('/merchant/:merchantId', (req, res) => {
  const ctx = context(req.user, { period: req.query.period || '6m' });
  const id = req.params.merchantId;
  const T = ctx.txns.filter((t) => (t.merchantId === id || t.merchant.toLowerCase().replace(/\W+/g, '-') === id) && t.status === 'completed');
  if (!T.length) throw new HttpError(404, 'No payments to this merchant yet.');
  const R = ctx.A.R;
  const inR = T.filter((t) => t.ts >= R.start);
  const total = inR.reduce((s, t) => s + t.amount, 0);
  const sub = T[0].sub, cat = T[0].category;
  const peers = summarize(ctx.txns.filter((t) => t.sub === sub), R).byMerchant.map((m) => ({ ...m, isThis: m.name === T[0].merchant }));
  const hours = Array(24).fill(0), days = Array(7).fill(0); for (const t of inR) { hours[t.ts.getHours()]++; days[t.ts.getDay()]++; }
  res.json({
    merchant: { id, name: T[0].merchant, category: cat, sub, categoryName: CATEGORY[cat].name, subName: CATEGORY[cat].subs[sub], color: CATEGORY[cat].color },
    period: R.label, total: r0(total), monthly: r0(total / R.monthsEq), count: inR.length, perMonth: +(inR.length / R.monthsEq).toFixed(1), avgTicket: inR.length ? r0(total / inR.length) : 0,
    firstSeen: T[0].ts.toISOString(), lastSeen: T.at(-1).ts.toISOString(), couponRate: inR.length ? +(inR.filter((t) => t.couponUsed).length / inR.length).toFixed(2) : 0,
    hours, days, series: monthlySeries(T, 6).months.map((m) => ({ label: m.label, amount: m.total, partial: m.partial })),
    compare: peers, offers: ctx.offers.all.filter((o) => o.targetSub === sub || o.targetCategory === cat).slice(0, 3), recent: inR.slice(-10).reverse().map(txnOut),
  });
});

r.get('/comparison', (req, res) => {
  const ctx = context(req.user);
  res.json({ ...ctx.A.peers, challenges: ctx.challenges, note: 'Cohort averages are illustrative benchmarks for this demo.' });
});

r.get('/behavioral-profile', (req, res) => res.json({ profile: context(req.user).profile }));

/** Prompt for the on-device model (used when Claude is unavailable or the user prefers on-device AI). */
r.post('/ai/prompt', (req, res) => {
  const kind = req.body?.kind;
  if (!['briefing', 'ask'].includes(kind)) throw new HttpError(400, 'kind must be briefing or ask.');
  const question = String(req.body?.question || '').trim();
  if (kind === 'ask' && (question.length < 3 || question.length > 300)) throw new HttpError(400, 'Ask a question between 3 and 300 characters.');
  const ctx = context(req.user);
  res.json(promptFor(kind, { user: ctx.user, A: ctx.A, recs: ctx.recs, profile: ctx.profile, insights: ctx.insights, question }));
});

r.post('/ask', async (req, res) => {
  const q = String(req.body?.question || '').trim();
  if (q.length < 3 || q.length > 300) throw new HttpError(400, 'Ask a question between 3 and 300 characters.');
  // engine_only: the user chose "Prefer on-device" — never send their summary to Claude.
  if (req.body?.engine_only === true) return res.json({ source: 'engine', data: { answer: 'The on-device model couldn’t answer this one, and you’ve chosen not to send your data to Claude. Your dashboard and the category deep dives have the full breakdown.', followUps: ['Where do I overspend?', 'How much do I spend on food delivery?', 'Which subscriptions should I cancel?'] } });
  const ctx = context(req.user);
  res.json(await askMoney(ctx.user, ctx.A, ctx.recs, ctx.profile, q, ctx.insights));
});

export default r;
