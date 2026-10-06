import { CATEGORY, categoryName } from '../data/catalog.js';
import { CAMPAIGNS } from '../data/offers.js';
import { periodRange, summarize, foodStats, subscriptions, anomalies, peerComparison, duplicates, DELIVERY_FEE_EST } from './analytics.js';

export const NON_DISCRETIONARY = ['rent', 'investments'];
const r0 = (n) => Math.round(n);
const inr = (n) => '₹' + r0(n).toLocaleString('en-IN');
const r50 = (n) => Math.max(0, Math.round(n / 50) * 50);

/** Everything the dashboard needs, computed once per request. */
export function buildAnalysis(txns, user, { period = '30d', now = new Date() } = {}) {
  const R = periodRange(period, now);
  const summary = summarize(txns, R);
  const R30 = periodRange('30d', now);
  const s30 = summarize(txns, R30);
  const R90 = periodRange('3m', now);
  const s90 = summarize(txns, R90);
  // Rent and investments aren't discretionary spending: keep them out of peer comparisons and spike alerts.
  const discretionary = txns.filter((t) => !NON_DISCRETIONARY.includes(t.sub));
  return { R, summary, s30, s90, food: foodStats(txns, R90), subs: subscriptions(txns, now), anomalies: anomalies(discretionary, now), peers: peerComparison(summarize(discretionary, R90), user.income), dups: duplicates(txns, R30) };
}

const sub = (s, id) => s.byMerchant.filter((m) => m.sub === id).reduce((a, m) => a + m.monthly, 0);
const cat = (s, id) => s.byCategory.find((c) => c.id === id)?.monthly || 0;

export function recommendations(A) {
  const s = A.s90, F = A.food, out = [];
  const delivery = sub(s, 'food_delivery');
  const add = (r) => {
    const savingsMonthly = r50(r.savingsMonthly);
    if (savingsMonthly <= 0 && !r.allowZero) return;
    out.push({ ...r, savingsMonthly, savingsAnnual: savingsMonthly * 12, potentialCost: r0(Math.max(0, r.currentSpending - savingsMonthly)), savingsPercentage: r.currentSpending ? Math.round((savingsMonthly / r.currentSpending) * 100) : 0, impact: 'monetary' });
  };

  if (delivery >= 4000) add({
    id: 'food-cook-half', type: 'reduce_spending', category: 'food', merchant: 'Swiggy / Zomato', title: 'Cook half of your delivery meals',
    description: `You order about ${F.ordersPerMonth} times a month (${F.ordersPerDay}/day), spending ${inr(delivery)}. Home-cooked meals cost roughly 40% of a delivered one.`,
    currentSpending: r0(delivery), savingsMonthly: delivery * 0.5 * 0.6, difficulty: 'medium', timeToImplement: '1 week', confidence: 0.86, relevanceScore: 0.95,
    actionItems: ['Plan 5 weekday dinners on Sunday', 'Keep 3 quick staples stocked (dal, eggs, paneer)', `Order only on ${F.peakDays?.[0] || 'Fridays'} as a treat`], offerId: 'bigbasket-1000',
  });
  if (F.ordersPerMonth >= 12) add({
    id: 'food-delivery-pass', type: 'plan_upgrade', category: 'food', merchant: 'Swiggy One / Zomato Gold', title: 'Stop paying delivery fees on every order',
    description: `At ~${F.ordersPerMonth} orders a month you pay an estimated ${inr(F.estDeliveryFeesMonthly)} in delivery and platform fees (≈₹${DELIVERY_FEE_EST}/order). A ₹99 pass removes most of it.`,
    currentSpending: F.estDeliveryFeesMonthly, savingsMonthly: F.estDeliveryFeesMonthly * 0.75 - 99, difficulty: 'easy', timeToImplement: '5 minutes', confidence: 0.9, relevanceScore: 0.9,
    actionItems: ['Buy the pass for the app you use most', 'Keep orders above the free-delivery minimum'], offerId: 'swiggy-one',
  });
  if (delivery >= 6000 && cat(s, 'food') > 0) add({
    id: 'food-meal-prep', type: 'switch_merchant', category: 'food', merchant: 'Blinkit', title: 'Meal-prep Sundays with 10-minute groceries',
    description: `Most of your orders land at ${F.peakTimes.join(' and ') || 'lunch and dinner'}. Prepping weekday lunches removes the most expensive orders.`,
    currentSpending: r0(delivery), savingsMonthly: delivery * 0.18, difficulty: 'easy', timeToImplement: '1 day', confidence: 0.78, relevanceScore: 0.8,
    actionItems: ['One Blinkit order on Sunday morning', 'Cook 2 dishes for Mon–Wed lunches'], offerId: 'blinkit-150',
  });
  const coffee = sub(s, 'coffee');
  if (coffee >= 1200) add({ id: 'food-coffee', type: 'reduce_spending', category: 'food', merchant: 'Cafés', title: 'Brew your weekday coffee', description: `Cafés cost you ${inr(coffee)} a month. A good home setup pays for itself in about 6 weeks.`, currentSpending: r0(coffee), savingsMonthly: coffee * 0.55, difficulty: 'easy', timeToImplement: '1 day', confidence: 0.75, relevanceScore: 0.6, actionItems: ['Keep cafés for weekends', 'Use the Starbucks BOGO when you do go'], offerId: 'starbucks-bogo' });

  for (const o of A.subs.overlaps) add({
    id: `subs-${o.sub}`, type: 'reduce_spending', category: 'entertainment', merchant: o.services.join(' + '), title: `Keep one ${o.label.toLowerCase()} service, not ${o.services.length}`,
    description: `You pay for ${o.services.join(', ')} — ${inr(o.monthly)} a month for overlapping ${o.label.toLowerCase()}. Rotate: keep one, switch when a show you want lands elsewhere.`,
    currentSpending: o.monthly, savingsMonthly: o.monthly - o.cheapestKeep, difficulty: 'easy', timeToImplement: '10 minutes', confidence: 0.92, relevanceScore: 0.93,
    actionItems: o.services.slice(1).map((x) => `Cancel ${x} before its next renewal`), offerId: o.sub === 'streaming' ? 'stream-bundle' : null,
  });
  const software = A.subs.list.filter((x) => x.sub === 'software');
  for (const x of software) add({ id: `subs-software-${x.merchantId || x.merchant}`, type: 'reduce_spending', category: 'entertainment', merchant: x.merchant, title: `Pause ${x.merchant} until you need it`, description: `${inr(x.monthly)}/month for creative software. If you use it for occasional projects, a monthly plan you start and stop is cheaper.`, currentSpending: x.monthly, savingsMonthly: x.monthly * 0.7, difficulty: 'easy', timeToImplement: '10 minutes', confidence: 0.7, relevanceScore: 0.7, actionItems: ['Check your last 3 months of usage', 'Switch to a pause-able monthly plan'] });
  const fitness = A.subs.list.filter((x) => x.sub === 'fitness').reduce((a, x) => a + x.monthly, 0);
  if (fitness >= 1500) add({ id: 'fitness-pay-per-use', type: 'switch_merchant', category: 'entertainment', merchant: 'FitPass', title: 'Pay per workout if you go under 8 times a month', description: `Your gym costs ${inr(fitness)}/month. At 8 visits that's ${inr(fitness / 8)} a session — a pay-per-use pass is cheaper unless you go most days.`, currentSpending: fitness, savingsMonthly: fitness - 699, difficulty: 'easy', timeToImplement: '1 day', confidence: 0.65, relevanceScore: 0.75, actionItems: ['Count your visits this month', 'Switch if under 8'], offerId: 'budget-gym' });

  const cabs = sub(s, 'cabs');
  const cabRides = s.byMerchant.filter((m) => m.sub === 'cabs').reduce((a, m) => a + m.count, 0) / 3;
  if (cabs >= 3000) add({ id: 'transport-short-hops', type: 'switch_merchant', category: 'transport', merchant: 'Rapido / Metro', title: 'Use bike taxis or metro for short hops', description: `${Math.round(cabRides)} cab rides a month cost ${inr(cabs)}. Rides under 5 km are about 60% cheaper by bike taxi or metro.`, currentSpending: r0(cabs), savingsMonthly: cabs * 0.3, difficulty: 'easy', timeToImplement: 'today', confidence: 0.72, relevanceScore: 0.7, actionItems: ['Take the metro for your daily commute', 'Keep cabs for late nights and rain'], offerId: 'rapido-50' });

  const fashion = sub(s, 'fashion') + sub(s, 'beauty');
  if (fashion >= 2500) add({ id: 'shopping-48h', type: 'reduce_spending', category: 'shopping', merchant: 'Myntra / AJIO / Nykaa', title: 'Try the 48-hour cart rule', description: `Fashion and beauty run ${inr(fashion)} a month, mostly late-night. Waiting 48 hours before checkout cuts impulse buys by about a quarter — and catch the sale you were waiting for.`, currentSpending: r0(fashion), savingsMonthly: fashion * 0.25, difficulty: 'medium', timeToImplement: 'today', confidence: 0.68, relevanceScore: 0.72, actionItems: ['Wishlist instead of buying after 10 pm', 'Buy in the sale window with an extra coupon'], offerId: 'myntra-20' });

  const mobile = sub(s, 'mobile');
  if (mobile >= 230) add({ id: 'bills-annual-mobile', type: 'plan_upgrade', category: 'bills', merchant: 'Mobile recharge', title: 'Switch to an annual mobile plan', description: `Monthly recharges cost ~${inr(mobile * 12)} a year. Annual plans are about ₹600 cheaper.`, currentSpending: r0(mobile), savingsMonthly: 50, difficulty: 'easy', timeToImplement: '5 minutes', confidence: 0.8, relevanceScore: 0.4, actionItems: ['Recharge the annual plan when this one ends'], offerId: 'jio-annual' });

  const dupTotal = A.dups.reduce((a, d) => a + d.amount, 0);
  if (dupTotal) add({ id: `refund-dup-${A.dups.map((d) => d.ids[1]).join('-').slice(0, 40)}`, type: 'use_discount', category: A.dups[0].recurring ? 'entertainment' : 'food', merchant: A.dups.map((d) => d.merchant).join(', '), title: 'Claim refunds for duplicate charges', description: `${A.dups.length} payment${A.dups.length > 1 ? 's look' : ' looks'} like a duplicate (${inr(dupTotal)}). One-time money back.`, currentSpending: dupTotal, savingsMonthly: dupTotal, difficulty: 'easy', timeToImplement: '5 minutes', confidence: 0.85, relevanceScore: 0.98, oneTime: true, actionItems: ['Open the transaction in Paytm', 'Tap “Raise an issue” → “Charged twice”'] });

  const potential = out.filter((r) => !r.oneTime).reduce((a, r) => a + r.savingsMonthly, 0);
  if (potential >= 2000) add({ id: 'invest-savings', type: 'new_service', category: 'personal', merchant: 'Paytm Money', title: `Auto-invest the ${inr(r50(potential * 0.5))} you free up`, description: 'Savings stick when they leave your spending account. Start a SIP the day after payday.', currentSpending: 0, savingsMonthly: 0, allowZero: true, difficulty: 'easy', timeToImplement: '10 minutes', confidence: 0.7, relevanceScore: 0.5, actionItems: ['Pick an index fund', 'Set the SIP date to the day after salary'], offerId: 'sip-start' });

  return out.sort((a, b) => b.relevanceScore * (b.savingsMonthly + 500) - a.relevanceScore * (a.savingsMonthly + 500));
}

export function insights(A, recs) {
  const out = [];
  const p = A.peers;
  const over = p.rows.filter((r) => r.percentageDifference >= 15 && r.difference >= 2000).sort((a, b) => b.difference - a.difference);
  for (const r of over.slice(0, 2)) {
    const rec = recs.find((x) => x.category === r.id && !x.oneTime);
    const top = A.s90.byMerchant.filter((m) => m.category === r.id).slice(0, 2);
    out.push({ id: `over-${r.id}`, type: 'overspending', category: r.id, severity: r.percentageDifference >= 40 ? 'critical' : 'warning',
      title: `${categoryName(r.id)} is ${r.percentageDifference}% above similar users`,
      description: `You average ${inr(r.you)}/month vs ${inr(r.average)} for people with ${p.cohort}.${top.length ? ` Top: ${top.map((m) => `${m.name} (${inr(m.monthly)})`).join(', ')}.` : ''}`,
      metrics: { current: r.you, average: r.average, difference: r.difference, percentageDifference: r.percentageDifference }, potentialSavings: rec?.savingsMonthly || 0, link: `/category/${r.id}` });
  }
  for (const o of A.subs.overlaps) out.push({ id: `overlap-${o.sub}`, type: 'pattern', category: 'entertainment', severity: 'warning', title: `${o.services.length} overlapping ${o.label.toLowerCase()} subscriptions`, description: `${o.services.join(' + ')} cost ${inr(o.monthly)}/month together.`, potentialSavings: r50(o.monthly - o.cheapestKeep), link: '/recommendations' });
  for (const a of A.anomalies.filter((x) => x.severity !== 'low').slice(0, 3)) out.push({ id: `anomaly-${a.type}-${a.merchant || a.category}`, type: 'anomaly', category: a.category, severity: a.severity === 'high' ? 'critical' : 'warning', title: a.type === 'spike' ? `${categoryName(a.category)} spending spiked` : a.type === 'duplicate' ? 'Possible duplicate charge' : a.type === 'fraud_risk' ? 'Unusual late-night payment' : 'Large purchase', description: a.description, action: a.action, link: a.category && a.category !== 'all' ? `/category/${a.category}` : '/trends' });
  const good = p.rows.filter((r) => r.you > 0 && r.percentageDifference <= -10).sort((a, b) => a.percentageDifference - b.percentageDifference)[0];
  if (good) out.push({ id: `good-${good.id}`, type: 'comparison', category: good.id, severity: 'positive', title: `${categoryName(good.id)} is well under control`, description: `${inr(good.you)}/month — ${Math.abs(good.percentageDifference)}% below similar users. Keep it up.`, link: `/category/${good.id}` });
  const best = recs.find((r) => !out.some((i) => i.category === r.category && i.type === 'overspending') && r.savingsMonthly > 0);
  if (best) out.push({ id: `opp-${best.id}`, type: 'opportunity', category: best.category, severity: 'info', title: best.title, description: best.description, potentialSavings: best.savingsMonthly, link: '/recommendations' });
  return out;
}

export function challenges(A) {
  const food = cat(A.s90, 'food');
  const target = r50(Math.max(A.peers.rows.find((r) => r.id === 'food').average, food * 0.75));
  const list = [];
  if (food > target + 1000) list.push({ id: 'food-under', title: `Bring food under ${inr(target)} this month`, category: 'food', metric: 'category_spend', baseline: food, target, reward: 'Food-saver badge' });
  if (A.food.ordersPerMonth >= 20) list.push({ id: 'delivery-halve', title: `Halve delivery orders (≤ ${Math.round(A.food.ordersPerMonth / 2)} this month)`, category: 'food', metric: 'delivery_orders', baseline: A.food.ordersPerMonth, target: Math.round(A.food.ordersPerMonth / 2), reward: 'Home-chef badge' });
  if (A.subs.count >= 3) list.push({ id: 'subs-cut-one', title: 'Cancel one subscription you barely use', category: 'entertainment', metric: 'subscription_count', baseline: A.subs.count, target: A.subs.count - 1, reward: 'Declutter badge' });
  list.push({ id: 'no-spend-weekend', title: 'One no-spend weekend', category: 'all', metric: 'weekend_spend', baseline: 0, target: 0, reward: 'Zen badge' });
  return list;
}

/** Rank campaigns by relevance to this user's real spending. */
export function rankOffers(A, profile, { personalization = true, dismissed = new Map(), clicked = new Set(), limit = 4 } = {}) {
  const s = A.s90;
  const recSavings = recommendations(A).filter((r) => !r.oneTime).reduce((a, r) => a + r.savingsMonthly, 0);
  const subSpend = (ids) => s.byMerchant.filter((m) => ids.includes(m.sub)).reduce((a, m) => a + m.monthly, 0);
  const merchantStats = (ids) => s.byMerchant.filter((m) => ids.includes(m.id)).reduce((a, m) => ({ monthly: a.monthly + m.monthly, count: a.count + m.count / 3, names: [...a.names, m.name] }), { monthly: 0, count: 0, names: [] });
  const scored = [];
  for (const c of CAMPAIGNS) {
    const d = dismissed.get(c.id);
    if (d && Date.now() - d < 14 * 86400000) continue;
    let relevance = 0, tier = 3, reason = '';
    if (!personalization) {
      relevance = 0.2; reason = 'Personalised offers are off — showing general offers.';
    } else {
      const ms = c.merchants ? merchantStats(c.merchants) : { monthly: 0, count: 0, names: [] };
      const ss = subSpend([c.sub, ...(c.alsoFor || [])]);
      const cs = cat(s, c.category);
      if (c.minMonthlyOrders && (c.sub === 'food_delivery' ? A.food.ordersPerMonth : ms.count) < c.minMonthlyOrders) continue;
      if (c.minSubscriptions && A.subs.list.filter((x) => x.sub === c.sub).length < c.minSubscriptions) continue;
      if (ms.monthly > 0) { tier = 1; relevance = 0.62 + Math.min(0.33, ms.monthly / 25000); reason = `You spend ${inr(ms.monthly)}/month at ${ms.names.join(' & ')}${ms.count >= 3 ? ` (${Math.round(ms.count)} orders)` : ''}.`; }
      else if (ss > 0) { tier = 2; relevance = 0.45 + Math.min(0.28, ss / 25000); reason = `You spend ${inr(ss)}/month on ${CATEGORY[c.category].subs[c.sub]?.toLowerCase() || categoryName(c.category).toLowerCase()}.`; }
      else if (c.alsoForSavers && recSavings >= 2000) { tier = 2; relevance = 0.55; reason = `You could free up ${inr(recSavings)}/month — put it to work.`; }
      else if (cs > 0) { tier = 3; relevance = 0.25; reason = `Based on your ${categoryName(c.category).toLowerCase()} spending.`; }
      else continue;
      if (c.savingsLogic === 'delivery_fee') reason = `${A.food.ordersPerMonth} orders/month ≈ ${inr(A.food.estDeliveryFeesMonthly)} in fees. ${reason}`;
      if (['discount', 'cashback'].includes(c.offerType)) relevance *= 0.85 + (profile?.sensitivity?.toDiscounts || 0.5) * 0.25;
      if (d) relevance *= 0.6;
      if ([...dismissed.keys()].some((id) => CAMPAIGNS.find((x) => x.id === id)?.advertiser === c.advertiser)) relevance *= 0.8;
      if (clicked.has(c.id)) relevance *= 1.05;
    }
    relevance = Math.min(0.99, relevance);
    const baseCtr = tier === 1 ? 0.17 : tier === 2 ? 0.07 : 0.025;
    const expectedCTR = +(baseCtr * (0.7 + relevance * 0.5)).toFixed(3);
    scored.push({
      adId: c.id, campaignId: c.id, advertiser: c.advertiser, emoji: c.emoji, targetCategory: c.category, targetSub: c.sub, offerType: c.offerType,
      title: c.title, description: c.description, discountAmount: c.discount || 0, minOrderAmount: c.minOrder || 0, couponCode: c.code,
      relevanceScore: +relevance.toFixed(2), relevanceReason: reason, tier, expectedCTR, priority: tier === 1 ? 'high' : tier === 2 ? 'medium' : 'low',
      impressionValue: c.cpm, clickValue: c.cpc, conversionValue: c.cpa, expectedRevenuePerView: +(c.cpm / 1000 + expectedCTR * c.cpc).toFixed(2),
      displayPosition: 'dashboard_card', color: CATEGORY[c.category].color,
    });
  }
  scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
  // Generic offers: campaigns with no signal in this user's spending (shown after personalised ones).
  const seen = new Set(scored.map((a) => a.adId));
  const generic = CAMPAIGNS.filter((c) => !seen.has(c.id) && !(dismissed.get(c.id) && Date.now() - dismissed.get(c.id) < 14 * 86400000)).map((c) => ({
    adId: c.id, campaignId: c.id, advertiser: c.advertiser, targetCategory: c.category, targetSub: c.sub, offerType: c.offerType,
    title: c.title, description: c.description, discountAmount: c.discount || 0, minOrderAmount: c.minOrder || 0, couponCode: c.code,
    relevanceScore: 0.1, relevanceReason: 'Popular with Paytm users this week.', tier: 4, expectedCTR: 0.012, priority: 'low',
    impressionValue: c.cpm, clickValue: c.cpc, conversionValue: c.cpa, expectedRevenuePerView: +(c.cpm / 1000 + 0.012 * c.cpc).toFixed(2), displayPosition: 'feed', color: CATEGORY[c.category].color, personalized: false,
  }));
  for (const a of scored) a.personalized = personalization && a.tier <= 2;
  const picked = [], perCat = new Map();
  for (const a of scored) { const n = perCat.get(a.targetCategory) || 0; if (n >= 2) continue; perCat.set(a.targetCategory, n + 1); picked.push(a); if (picked.length >= limit) break; }
  return { top: picked, all: scored, generic };
}
