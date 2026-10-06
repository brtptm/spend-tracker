import { CATEGORIES, CATEGORY, MERCHANT, DISHES } from '../data/catalog.js';
import { BENCHMARKS, incomeBand } from '../data/offers.js';

const DAY_MS = 86400000;
const MONTH_DAYS = 30.44;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DELIVERY_FEE_EST = 45; // ₹ per delivery order (platform + delivery + packaging, estimated)
const r0 = (n) => Math.round(n);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const ym = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export const PERIODS = {
  '30d': 'Last 30 days', month: 'This month', last_month: 'Last month', '3m': 'Last 3 months', '6m': 'Last 6 months', '12m': 'Last 12 months',
};

export function periodRange(period = '30d', now = new Date()) {
  const end = new Date(now);
  let start;
  if (period === 'month') start = new Date(now.getFullYear(), now.getMonth(), 1);
  else if (period === 'last_month') { start = new Date(now.getFullYear(), now.getMonth() - 1, 1); end.setTime(new Date(now.getFullYear(), now.getMonth(), 1).getTime() - 1); }
  else if (/^\d+m$/.test(period)) start = new Date(now.getFullYear(), now.getMonth() - parseInt(period, 10), now.getDate());
  else start = new Date(now.getTime() - 30 * DAY_MS);
  const days = Math.max(1, (end - start) / DAY_MS);
  return { period: PERIODS[period] ? period : '30d', label: PERIODS[period] || PERIODS['30d'], start, end, days, monthsEq: days / MONTH_DAYS };
}

const inRange = (t, R) => t.ts >= R.start && t.ts <= R.end;
const spend = (txns) => txns.filter((t) => t.status === 'completed');

function group(txns, keyFn) {
  const m = new Map();
  for (const t of txns) { const k = keyFn(t); const g = m.get(k) || { amount: 0, count: 0, items: [] }; g.amount += t.amount; g.count += 1; g.items.push(t); m.set(k, g); }
  return m;
}

export function summarize(txns, R) {
  const S = spend(txns).filter((t) => inRange(t, R));
  const total = S.reduce((s, t) => s + t.amount, 0);
  const byCat = group(S, (t) => t.category);
  const byCategory = CATEGORIES.map((c) => {
    const g = byCat.get(c.id) || { amount: 0, count: 0, items: [] };
    return { id: c.id, name: c.name, emoji: c.emoji, color: c.color, amount: r0(g.amount), monthly: r0(g.amount / R.monthsEq), percentage: pct(g.amount, total), count: g.count };
  }).filter((c) => c.amount > 0).sort((a, b) => b.amount - a.amount);
  const byMerchant = [...group(S, (t) => t.merchant).entries()].map(([name, g]) => ({
    name, id: g.items[0].merchantId || name.toLowerCase().replace(/\W+/g, '-'), category: g.items[0].category, sub: g.items[0].sub,
    amount: r0(g.amount), monthly: r0(g.amount / R.monthsEq), count: g.count, avgTicket: r0(g.amount / g.count),
  })).sort((a, b) => b.amount - a.amount);
  const failed = txns.filter((t) => inRange(t, R) && t.status === 'failed').length;
  return {
    period: R.period, label: R.label, start: R.start.toISOString(), end: R.end.toISOString(),
    totalSpending: r0(total), monthlyEquivalent: r0(total / R.monthsEq), transactionCount: S.length, failedCount: failed,
    averageDailySpend: r0(total / R.days), averageTicket: S.length ? r0(total / S.length) : 0,
    categoriesCount: byCategory.length, byCategory, byMerchant: byMerchant.slice(0, 25), topMerchants: byMerchant.slice(0, 3).map((m) => m.name),
  };
}

export function monthlySeries(txns, months = 6, now = new Date()) {
  const out = [];
  for (let k = months - 1; k >= 0; k--) {
    const s = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const e = new Date(now.getFullYear(), now.getMonth() - k + 1, 1);
    const rows = spend(txns).filter((t) => t.ts >= s && t.ts < e);
    const row = { month: ym(s), label: s.toLocaleDateString('en-IN', { month: 'short' }), partial: k === 0, total: 0 };
    for (const c of CATEGORIES) row[c.id] = 0;
    for (const t of rows) { row[t.category] += t.amount; row.total += t.amount; }
    for (const k2 of Object.keys(row)) if (typeof row[k2] === 'number') row[k2] = r0(row[k2]);
    if (k === 0) {
      // Extrapolate everyday spending only; one-off big purchases (≥ ₹10k) count once.
      const oneOff = rows.filter((t) => t.amount >= 10000).reduce((a, t) => a + t.amount, 0);
      row.projected = r0(((row.total - oneOff) / Math.max(1, now.getDate())) * new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() + oneOff);
    }
    out.push(row);
  }
  const full = out.filter((m) => !m.partial).slice(-3).map((m) => m.total);
  const trend = full.length >= 2 ? (full.at(-1) - full[0]) / Math.max(1, full[0]) : 0;
  return { months: out, trend: { change: Math.round(trend * 100), direction: trend > 0.08 ? 'rising' : trend < -0.08 ? 'falling' : 'stable' } };
}

export function heatmap(txns, R) {
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const t of spend(txns).filter((x) => inRange(x, R))) grid[t.ts.getDay()][t.ts.getHours()] += t.amount;
  return grid.map((row) => row.map(r0));
}

function peaks(items) {
  const hours = Array(24).fill(0), days = Array(7).fill(0);
  for (const t of items) { hours[t.ts.getHours()] += 1; days[t.ts.getDay()] += 1; }
  const topHours = hours.map((v, h) => [h, v]).sort((a, b) => b[1] - a[1]).slice(0, 2).filter(([, v]) => v > 0).map(([h]) => `${String(h).padStart(2, '0')}:00–${String((h + 1) % 24).padStart(2, '0')}:00`);
  const topDays = days.map((v, d) => [d, v]).sort((a, b) => b[1] - a[1]).slice(0, 3).filter(([, v]) => v > 0).map(([d]) => WEEKDAYS[d]);
  return { topHours, topDays, hours, days };
}

/** Recurring charges: same merchant billed in ≥2 distinct months with similar amounts. */
export function subscriptions(txns, now = new Date()) {
  const since = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const recent = spend(txns).filter((t) => t.ts >= since && (t.isRecurring || MERCHANT[t.merchantId]?.subscription));
  const byM = group(recent, (t) => t.merchant);
  const subs = [];
  for (const [name, g] of byM) {
    const months = new Set(g.items.map((t) => ym(t.ts)));
    if (months.size < 2 && !g.items.some((t) => t.isRecurring)) continue;
    const latest = g.items.at(-1);
    const amounts = g.items.map((t) => t.amount);
    const monthly = r0(amounts.reduce((a, b) => a + b, 0) / Math.max(1, months.size));
    if (latest.category === 'bills' && !['internet'].includes(latest.sub)) continue; // utilities aren't optional subscriptions
    subs.push({ merchant: name, merchantId: latest.merchantId, category: latest.category, sub: latest.sub, monthly: r0(latest.amount), avgMonthly: monthly, lastCharged: latest.ts.toISOString(), months: months.size });
  }
  subs.sort((a, b) => b.monthly - a.monthly);
  const bySub = group(subs.map((s) => ({ ...s, amount: s.monthly, ts: new Date() })), (s) => s.sub);
  const overlaps = [...bySub.entries()].filter(([sub, g]) => g.count >= 2 && ['streaming', 'music', 'fitness'].includes(sub))
    .map(([sub, g]) => ({ sub, label: CATEGORY.entertainment.subs[sub], services: g.items.map((s) => s.merchant), monthly: r0(g.amount), cheapestKeep: Math.min(...g.items.map((s) => s.monthly)) }));
  return { list: subs, total: r0(subs.reduce((s, x) => s + x.monthly, 0)), count: subs.length, overlaps };
}

export function duplicates(txns, R) {
  const S = spend(txns).filter((t) => inRange(t, R)).sort((a, b) => a.ts - b.ts);
  const out = [];
  for (let i = 1; i < S.length; i++) {
    const a = S[i - 1], b = S[i];
    if (a.merchant === b.merchant && a.amount === b.amount && b.ts - a.ts < 10 * 60 * 1000) out.push({ merchant: b.merchant, amount: b.amount, at: b.ts.toISOString(), ids: [a.id, b.id] });
  }
  // Same subscription charged twice in one month
  const subs = S.filter((t) => t.isRecurring || MERCHANT[t.merchantId]?.subscription);
  const seen = new Map();
  for (const t of subs) {
    const k = `${t.merchant}|${ym(t.ts)}`;
    if (seen.has(k) && !out.some((d) => d.ids.includes(t.id))) out.push({ merchant: t.merchant, amount: t.amount, at: t.ts.toISOString(), ids: [seen.get(k).id, t.id], recurring: true });
    else seen.set(k, t);
  }
  return out;
}

export function anomalies(txns, now = new Date()) {
  const R30 = periodRange('30d', now);
  const cur = spend(txns).filter((t) => inRange(t, R30));
  const prevStart = new Date(R30.start.getTime() - 90 * DAY_MS);
  const prev = spend(txns).filter((t) => t.ts >= prevStart && t.ts < R30.start);
  const out = [];
  // Big one-off purchases are reported on their own; keep them out of the category spike maths.
  const outlier = (t) => t.amount >= 10000;
  for (const c of CATEGORIES) {
    const now30 = cur.filter((t) => t.category === c.id && !outlier(t)).reduce((s, t) => s + t.amount, 0);
    const avg = prev.filter((t) => t.category === c.id).reduce((s, t) => s + t.amount, 0) / 3;
    if (avg > 500 && now30 - avg > 2000 && now30 / avg > 1.35) out.push({ type: 'spike', category: c.id, severity: now30 / avg > 2 ? 'high' : 'medium', amount: r0(now30), baseline: r0(avg), percentageChange: Math.round((now30 / avg - 1) * 100), description: `${c.name} is up ${Math.round((now30 / avg - 1) * 100)}% vs your 3-month average (₹${r0(now30).toLocaleString('en-IN')} vs ₹${r0(avg).toLocaleString('en-IN')}).`, action: `Open ${c.name} to see which merchants drove it.` });
  }
  const medians = new Map();
  for (const c of CATEGORIES) { const a = prev.filter((t) => t.category === c.id).map((t) => t.amount).sort((x, y) => x - y); medians.set(c.id, a[Math.floor(a.length / 2)] || 0); }
  for (const t of cur) {
    const med = medians.get(t.category) || 0;
    const night = t.ts.getHours() < 5;
    if (t.amount >= 10000 && med && t.amount > med * 6) out.push({ type: night ? 'fraud_risk' : 'large_purchase', category: t.category, severity: night ? 'high' : 'medium', amount: r0(t.amount), merchant: t.merchant, at: t.ts.toISOString(), description: `${night ? 'Late-night' : 'Unusually large'} payment of ₹${r0(t.amount).toLocaleString('en-IN')} at ${t.merchant}${night ? ` at ${t.ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ''}.`, action: night ? 'If you don’t recognise it, block your card and report it in Paytm.' : 'Was this planned? Tag it so it doesn’t skew your averages.' });
  }
  const prevMerchants = new Set(prev.map((t) => t.merchant));
  const flagged = new Set(out.map((a) => a.merchant).filter(Boolean));
  for (const [name, g] of group(cur.filter((t) => !prevMerchants.has(t.merchant) && t.category !== 'p2p' && !flagged.has(t.merchant)), (t) => t.merchant)) {
    if (g.amount >= 3000) out.push({ type: 'new_merchant', category: g.items[0].category, severity: 'low', amount: r0(g.amount), merchant: name, description: `New merchant: ₹${r0(g.amount).toLocaleString('en-IN')} at ${name} this month.`, action: 'Check it’s a one-off and not a new recurring charge.' });
  }
  for (const d of duplicates(txns, R30)) out.push({ type: 'duplicate', category: 'all', severity: 'medium', amount: d.amount, merchant: d.merchant, at: d.at, description: `Possible duplicate charge: ₹${d.amount.toLocaleString('en-IN')} at ${d.merchant}${d.recurring ? ' twice this month' : ' twice within minutes'}.`, action: 'Raise a refund request with the merchant from your Paytm history.' });
  const rank = { critical: 0, high: 1, medium: 2, low: 3 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export function foodStats(txns, R) {
  const F = spend(txns).filter((t) => inRange(t, R) && t.category === 'food');
  const delivery = F.filter((t) => t.sub === 'food_delivery');
  const ordersPerMonth = delivery.length / R.monthsEq;
  const dishes = new Map();
  for (const t of delivery) { const d = DISHES.find((x) => t.description?.startsWith(x)); if (d) dishes.set(d.replace(/^(Chicken|Mutton) /, ''), (dishes.get(d.replace(/^(Chicken|Mutton) /, '')) || 0) + 1); }
  const topDish = [...dishes.entries()].sort((a, b) => b[1] - a[1])[0];
  const pk = peaks(delivery);
  return {
    deliveryOrders: delivery.length, ordersPerMonth: Math.round(ordersPerMonth), ordersPerDay: +(ordersPerMonth / 30.44).toFixed(1),
    deliveryShare: pct(delivery.reduce((s, t) => s + t.amount, 0), F.reduce((s, t) => s + t.amount, 0)),
    avgOrder: delivery.length ? r0(delivery.reduce((s, t) => s + t.amount, 0) / delivery.length) : 0,
    estDeliveryFeesMonthly: r0(ordersPerMonth * DELIVERY_FEE_EST), peakTimes: pk.topHours, peakDays: pk.topDays,
    topDish: topDish ? { name: topDish[0], timesPerMonth: Math.round(topDish[1] / R.monthsEq) } : null,
  };
}

export function peerComparison(summary, income) {
  const band = incomeBand(income);
  const B = BENCHMARKS[band];
  const rows = CATEGORIES.map((c) => {
    const you = summary.byCategory.find((x) => x.id === c.id)?.monthly || 0;
    const avg = B[c.id];
    return { id: c.id, name: c.name, color: c.color, you, average: avg, difference: you - avg, percentageDifference: avg ? Math.round(((you - avg) / avg) * 100) : 0 };
  });
  const youTotal = rows.reduce((s, r) => s + r.you, 0), avgTotal = rows.reduce((s, r) => s + r.average, 0);
  const ratio = youTotal / Math.max(1, avgTotal);
  return { band, cohort: `${band === 'high' ? '₹1.3L+' : band === 'mid' ? '₹60k–1.3L' : 'under ₹60k'} monthly income`, rows, total: { you: youTotal, average: avgTotal, percentageDifference: Math.round((ratio - 1) * 100) }, percentileRank: Math.max(5, Math.min(97, Math.round(50 + (ratio - 1) * 80))), illustrative: true };
}

export function behavioralProfile(txns, { income, now = new Date() } = {}) {
  const R = periodRange('6m', now);
  const S = spend(txns).filter((t) => inRange(t, R));
  const sum = summarize(txns, R);
  const food = foodStats(txns, R);
  const subs = subscriptions(txns, now);
  const monthly = sum.monthlyEquivalent;
  const couponRate = S.length ? S.filter((t) => t.couponUsed).length / S.length : 0;
  const shop = sum.byCategory.find((c) => c.id === 'shopping');
  const shopAvgTicket = shop ? shop.amount / Math.max(1, shop.count) : 0;
  const cabs = S.filter((t) => t.sub === 'cabs').length / R.monthsEq;
  const fashionShare = S.filter((t) => t.sub === 'fashion' || t.sub === 'beauty').reduce((s, t) => s + t.amount, 0) / Math.max(1, sum.totalSpending);

  let spenderType = 'balanced_spender';
  if (food.ordersPerMonth >= 25 || cabs >= 25) spenderType = 'convenience_spender';
  else if (subs.count >= 5) spenderType = 'subscription_collector';
  else if (couponRate > 0.4) spenderType = 'deal_hunter';
  else if (fashionShare > 0.15 || shopAvgTicket > 3500) spenderType = 'trend_shopper';
  else if (income && monthly / income < 0.45) spenderType = 'budget_conscious';
  const LABELS = { convenience_spender: 'Convenience spender', subscription_collector: 'Subscription collector', deal_hunter: 'Deal hunter', trend_shopper: 'Trend shopper', budget_conscious: 'Budget-conscious', balanced_spender: 'Balanced spender' };

  const pk = peaks(S);
  const series = monthlySeries(txns, 4, now).months.filter((m) => !m.partial);
  const activityTrend = series.length >= 2 ? series.at(-1).total / Math.max(1, series[0].total) : 1;
  const merchantPref = sum.byMerchant.filter((m) => m.category !== 'p2p').slice(0, 5);
  const loyalty = merchantPref.length ? merchantPref[0].amount / merchantPref.reduce((s, m) => s + m.amount, 0) : 0;
  const discount = Math.min(0.95, 0.35 + couponRate * 1.1 + (spenderType === 'deal_hunter' ? 0.15 : 0));
  const convenience = Math.min(0.95, 0.3 + food.ordersPerMonth / 60 + cabs / 80);
  const price = Math.max(0.1, Math.min(0.95, couponRate * 1.4 + (spenderType === 'budget_conscious' ? 0.4 : 0.1)));

  return {
    spenderType, spenderLabel: LABELS[spenderType],
    primaryMotivation: spenderType === 'convenience_spender' ? 'convenience_over_cost' : spenderType === 'deal_hunter' ? 'value_seeking' : spenderType === 'trend_shopper' ? 'self_expression' : spenderType === 'subscription_collector' ? 'access_and_variety' : 'stability',
    monthlySpend: monthly, spendToIncome: income ? +(monthly / income).toFixed(2) : null,
    topCategories: sum.byCategory.slice(0, 3).map((c) => c.id),
    favorites: { merchants: merchantPref.map((m) => m.name), subcategories: [...new Set(merchantPref.map((m) => m.sub))] },
    patterns: { peakTimes: pk.topHours, peakDays: pk.topDays, frequency: S.length / R.days >= 1 ? 'daily' : 'weekly', transactionsPerMonth: Math.round(S.length / R.monthsEq), seasonality: 'higher in Oct–Nov festive season' },
    food: { ordersPerMonth: food.ordersPerMonth, topDish: food.topDish, deliveryShare: food.deliveryShare },
    sensitivity: { toDiscounts: +discount.toFixed(2), toConvenience: +convenience.toFixed(2), toPrice: +price.toFixed(2), toRecommendations: +(0.5 + discount * 0.3).toFixed(2) },
    couponUsageRate: +couponRate.toFixed(2), brandLoyalty: +loyalty.toFixed(2),
    predictedBehavior: { willUseDiscount: +discount.toFixed(2), willReduceSpending: +Math.max(0.15, 0.7 - convenience * 0.5).toFixed(2), willTryNewService: +(0.4 + convenience * 0.3).toFixed(2) },
    churnRisk: activityTrend < 0.6 ? 'high' : activityTrend < 0.85 ? 'medium' : 'low',
    lifetimeValueEstimate: r0(monthly * 0.012 * 36), // ₹ platform revenue over 3 years at ~1.2% blended take
    subscriptions: { count: subs.count, monthly: subs.total },
  };
}

export { WEEKDAYS };
