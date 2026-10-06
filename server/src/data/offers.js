// Sample advertiser campaigns. The relevance engine ranks these per user from
// their actual spending; nothing here is targeted by demographics.
// Values: cpm = ₹ per 1000 impressions, cpc = ₹ per click, cpa = ₹ per conversion.

const o = (id, advertiser, target, offer, money, extra = {}) => ({ id, advertiser, ...target, ...offer, ...money, ...extra });

export const CAMPAIGNS = [
  o('swiggy-300', 'Swiggy', { category: 'food', sub: 'food_delivery', merchants: ['swiggy'] }, { offerType: 'discount', title: '₹300 off your next order', description: 'On orders above ₹500. Stacks with Swiggy One.', discount: 300, minOrder: 500, code: 'SAVESMART300' }, { cpm: 80, cpc: 18, cpa: 120 }, { emoji: '🍛' }),
  o('swiggy-one', 'Swiggy One', { category: 'food', sub: 'food_delivery', merchants: ['swiggy'], minMonthlyOrders: 12 }, { offerType: 'plan', title: 'Free delivery for 3 months', description: 'Swiggy One Lite at ₹99 — pays for itself in ~3 orders.', discount: 0, code: 'ONELITE99' }, { cpm: 70, cpc: 15, cpa: 150 }, { emoji: '🛵', savingsLogic: 'delivery_fee' }),
  o('zomato-gold', 'Zomato Gold', { category: 'food', sub: 'food_delivery', merchants: ['zomato'], minMonthlyOrders: 10 }, { offerType: 'plan', title: 'Gold: free delivery + 30% off dining', description: '₹99/month. Free delivery on orders above ₹199.', code: 'GOLD99' }, { cpm: 70, cpc: 15, cpa: 150 }, { emoji: '🥇', savingsLogic: 'delivery_fee' }),
  o('blinkit-150', 'Blinkit', { category: 'food', sub: 'groceries', alsoFor: ['food_delivery'] }, { offerType: 'discount', title: '₹150 off groceries in 10 minutes', description: 'First order above ₹599. Cook more, order less.', discount: 150, minOrder: 599, code: 'COOKMORE150' }, { cpm: 60, cpc: 12, cpa: 90 }, { emoji: '🥬' }),
  o('bigbasket-1000', 'BigBasket', { category: 'food', sub: 'groceries', alsoFor: ['food_delivery'] }, { offerType: 'discount', title: '₹1,000 off your monthly basket', description: 'On a ₹3,000 BB Daily subscription — the meal-prep starter.', discount: 1000, minOrder: 3000, code: 'BBMONTH1000' }, { cpm: 55, cpc: 14, cpa: 140 }, { emoji: '🧺' }),
  o('eatfit', 'EatFit Meal Plans', { category: 'food', sub: 'food_delivery', minMonthlyOrders: 25 }, { offerType: 'new_service', title: 'Weekday lunch plan at ₹149/meal', description: 'Healthy office lunches, 40% cheaper than app ordering.', code: 'LUNCH149' }, { cpm: 50, cpc: 10, cpa: 110 }, { emoji: '🥗' }),
  o('starbucks-bogo', 'Starbucks', { category: 'food', sub: 'coffee', merchants: ['starbucks'] }, { offerType: 'discount', title: 'Buy 1 Get 1 on handcrafted beverages', description: 'Weekdays 2–5 pm via Paytm.', code: 'BREW2' }, { cpm: 45, cpc: 9, cpa: 60 }, { emoji: '☕' }),

  o('myntra-20', 'Myntra', { category: 'shopping', sub: 'fashion', merchants: ['myntra', 'ajio', 'hm'] }, { offerType: 'discount', title: 'Extra 20% off — End of Reason Sale', description: 'Early access for frequent fashion shoppers.', discount: 0, code: 'EORS20' }, { cpm: 90, cpc: 20, cpa: 200 }, { emoji: '👗' }),
  o('ajio-500', 'AJIO', { category: 'shopping', sub: 'fashion', merchants: ['ajio', 'myntra'] }, { offerType: 'discount', title: '₹500 off on ₹1,999', description: 'Top brands, this week only.', discount: 500, minOrder: 1999, code: 'AJIO500' }, { cpm: 75, cpc: 16, cpa: 160 }, { emoji: '🧥' }),
  o('nykaa-15', 'Nykaa', { category: 'shopping', sub: 'beauty', merchants: ['nykaa'] }, { offerType: 'cashback', title: '15% Paytm cashback on beauty', description: 'Up to ₹300 on your next Nykaa order.', code: 'GLOW15' }, { cpm: 65, cpc: 14, cpa: 120 }, { emoji: '💄' }),
  o('amazon-card', 'Amazon Pay ICICI', { category: 'shopping', sub: 'marketplace', merchants: ['amazon'] }, { offerType: 'card', title: '5% back on every Amazon order', description: 'You shop on Amazon often — this card pays you back.', code: null }, { cpm: 120, cpc: 40, cpa: 900 }, { emoji: '💳' }),
  o('croma-emi', 'Croma', { category: 'shopping', sub: 'electronics' }, { offerType: 'discount', title: 'No-cost EMI + ₹2,000 off laptops', description: 'Upgrade season pricing on electronics.', discount: 2000, code: 'CROMA2K' }, { cpm: 85, cpc: 22, cpa: 400 }, { emoji: '💻' }),

  o('uber-pass', 'Uber One', { category: 'transport', sub: 'cabs', merchants: ['uber'], minMonthlyOrders: 12 }, { offerType: 'plan', title: 'Uber One: 10% back as credits', description: 'Frequent rider? Save on every ride.', code: 'UONE' }, { cpm: 70, cpc: 15, cpa: 140 }, { emoji: '🚗' }),
  o('rapido-50', 'Rapido', { category: 'transport', sub: 'cabs', alsoFor: ['cabs'] }, { offerType: 'switch', title: 'Short hops for half the fare', description: 'Bike taxis for trips under 5 km — ₹50 off first 3 rides.', discount: 50, code: 'HOP50' }, { cpm: 55, cpc: 10, cpa: 70 }, { emoji: '🛵' }),
  o('metro-card', 'Metro Smart Card', { category: 'transport', sub: 'cabs', alsoFor: ['metro'] }, { offerType: 'switch', title: 'Metro commute pass on Paytm', description: 'Recharge in-app and skip peak-hour surge.', code: null }, { cpm: 30, cpc: 6, cpa: 40 }, { emoji: '🚇' }),
  o('mmt-hotel', 'MakeMyTrip', { category: 'transport', sub: 'flights', alsoFor: ['hotels', 'bus_train'] }, { offerType: 'discount', title: 'Up to ₹1,500 off flights + hotels', description: 'Weekend getaways from your city.', discount: 1500, code: 'MMTPAYTM' }, { cpm: 95, cpc: 25, cpa: 450 }, { emoji: '✈️' }),
  o('travel-insurance', 'Paytm Insurance', { category: 'transport', sub: 'flights', alsoFor: ['hotels'] }, { offerType: 'new_service', title: 'Trip insurance from ₹99', description: 'Delays, baggage and medical cover for your next trip.', code: null }, { cpm: 60, cpc: 14, cpa: 180 }, { emoji: '🛡️' }),

  o('stream-bundle', 'Paytm Stream Pack', { category: 'entertainment', sub: 'streaming', minSubscriptions: 2 }, { offerType: 'plan', title: 'One pack, 4 OTT apps — ₹399/month', description: 'Replace separate streaming plans with one bill.', code: 'STREAM4' }, { cpm: 85, cpc: 18, cpa: 220 }, { emoji: '📺', savingsLogic: 'subscription_bundle' }),
  o('netflix-family', 'Netflix', { category: 'entertainment', sub: 'streaming', merchants: ['netflix'] }, { offerType: 'plan', title: 'Share Premium with family', description: 'Split ₹649 across up to 4 people.', code: null }, { cpm: 40, cpc: 8, cpa: 60 }, { emoji: '🍿' }),
  o('bms-150', 'BookMyShow', { category: 'entertainment', sub: 'events', merchants: ['bookmyshow', 'pvr'] }, { offerType: 'discount', title: '₹150 off two movie tickets', description: 'This weekend via Paytm.', discount: 150, code: 'MOVIE150' }, { cpm: 55, cpc: 11, cpa: 80 }, { emoji: '🎟️' }),
  o('budget-gym', 'FitPass', { category: 'entertainment', sub: 'fitness', merchants: ['cultfit', 'goldsgym'] }, { offerType: 'switch', title: 'Any gym near you from ₹699/month', description: 'Pay-per-use access — ideal if you go a few times a month.', code: 'FIT699' }, { cpm: 60, cpc: 14, cpa: 160 }, { emoji: '🏋️' }),

  o('bill-autopay', 'Paytm Bill Autopay', { category: 'bills', sub: 'electricity', alsoFor: ['internet', 'mobile', 'gas'] }, { offerType: 'cashback', title: '₹75 cashback on Autopay setup', description: 'Never pay a late fee again.', code: 'AUTO75' }, { cpm: 35, cpc: 7, cpa: 50 }, { emoji: '⚡' }),
  o('jio-annual', 'Jio', { category: 'bills', sub: 'mobile' }, { offerType: 'plan', title: 'Annual plan saves ₹600/year', description: 'Pay once, recharge never.', code: null }, { cpm: 40, cpc: 8, cpa: 70 }, { emoji: '📱' }),

  o('health-plan', 'Paytm Health', { category: 'personal', sub: 'healthcare' }, { offerType: 'discount', title: '25% off medicines + free delivery', description: 'Monthly refills at your doorstep.', code: 'MEDS25' }, { cpm: 50, cpc: 10, cpa: 90 }, { emoji: '💊' }),
  o('sip-start', 'Paytm Money', { category: 'personal', sub: 'investments', alsoForSavers: true }, { offerType: 'new_service', title: 'Turn your savings into a ₹1,000 SIP', description: 'Invest what you save — zero commission direct funds.', code: null }, { cpm: 100, cpc: 30, cpa: 600 }, { emoji: '📈', savingsLogic: 'invest_savings' }),
];

// Logo id (client/public/logos/<id>.png) for each campaign's advertiser.
const LOGO = { 'swiggy-300': 'swiggy', 'swiggy-one': 'swiggy', 'zomato-gold': 'zomato', 'blinkit-150': 'blinkit', 'bigbasket-1000': 'bigbasket', eatfit: 'eatfit', 'starbucks-bogo': 'starbucks',
  'myntra-20': 'myntra', 'ajio-500': 'ajio', 'nykaa-15': 'nykaa', 'amazon-card': 'amazon', 'croma-emi': 'croma', 'uber-pass': 'uber', 'rapido-50': 'rapido', 'metro-card': 'paytm',
  'mmt-hotel': 'makemytrip', 'travel-insurance': 'paytm', 'stream-bundle': 'paytm', 'netflix-family': 'netflix', 'bms-150': 'bookmyshow', 'budget-gym': 'fitpass',
  'bill-autopay': 'paytm', 'jio-annual': 'jio', 'health-plan': 'paytm', 'sip-start': 'paytmmoney' };
for (const c of CAMPAIGNS) c.logo = LOGO[c.id] || null;

// Illustrative cohort benchmarks (₹/month) by monthly income band. Sample data for the demo.
export const BENCHMARKS = {
  low: { food: 7000, shopping: 4500, transport: 3200, entertainment: 1500, bills: 4500, personal: 2500, p2p: 2500 },
  mid: { food: 14000, shopping: 9000, transport: 6500, entertainment: 3500, bills: 7000, personal: 5000, p2p: 4000 },
  high: { food: 18000, shopping: 12000, transport: 10000, entertainment: 6000, bills: 9000, personal: 9000, p2p: 6000 },
};
export const incomeBand = (income) => (!income ? 'mid' : income < 60000 ? 'low' : income < 130000 ? 'mid' : 'high');
