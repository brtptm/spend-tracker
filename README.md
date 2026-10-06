# Spend Tracker

AI-powered spending analytics on Paytm transaction history: see exactly where money goes, get specific ways to keep more, and see only offers that match how you actually spend. Paytm gets consent-gated partner APIs for behaviour-based targeting.

**Stack:** React 19 · Vite 8 · Tailwind 4 · three.js (React Three Fiber) · Motion · Recharts · Node 24 · Express 5 · SQLite (`node:sqlite`) · Claude via the Anthropic SDK or Claude Agent SDK · pnpm workspaces

## Quick start

```bash
pnpm install
pnpm dev              # API :4400 · app http://localhost:5273
```

Open the app and click **Explore a live demo**, or pick a persona on the landing page:

| Persona | Story | Login |
|---|---|---|
| Rohan — convenience spender (Bengaluru) | ~79 delivery orders/month, Netflix + Hotstar overlap, a duplicate Swiggy charge and a 1 a.m. ₹38,990 laptop | `rohan@demo.spendtracker.app` |
| Neha — deal-hunting fashionista (Mumbai) | Myntra/AJIO/Nykaa late-night carts, high coupon use | `neha@demo.spendtracker.app` |
| Kabir — subscription collector (Pune) | 4 streaming apps, 2 music apps, Adobe (charged twice), gym | `kabir@demo.spendtracker.app` |

Password for all: `spend-smart-2026`. Each has 12 months of generated Paytm-style history. `pnpm seed` resets them.

**AI** is picked automatically (`GET /api/health` → `ai.provider`): `ANTHROPIC_API_KEY` → your local **Claude Code login via the Claude Agent SDK** → built-in engine. Every number comes from the engine; Claude only writes language over compact aggregates (never raw transactions), and any failure falls back instantly. The local-login path is for development and demos; a deployed product should use an API key.

## What's inside

**The Spend Universe (signature UI).** Your wallet is a glowing core; each category is a planet sized by spend, orbiting by rank; particles stream from core to planet at a rate proportional to the money flowing there. Interactive on the dashboard (hover for amounts, click to deep-dive), lazy-loaded, paused off-screen, with a 2D fallback.

| Feature | Where |
|---|---|
| Ingestion: simulated Paytm feed (consent screen, 3/6/12 months) or CSV upload | `pages/Connect.jsx`, `POST /api/spending/import` |
| Categorisation: your corrections → merchant catalog → keywords → person/P2P heuristics → Claude for unknowns; learns per merchant | `engine/categorize.js`, `PUT /api/spending/:id/categorize` |
| Dashboard: period switch, stats, AI briefing, donut, 6-month stack, insights, native offers, savings | `pages/Dashboard.jsx`, `GET /api/analysis/dashboard` |
| Deep dives: sub-categories, merchants, orders/day, delivery fees, peak times, top dish, peers | `pages/Category.jsx`, `GET /api/analysis/category/:id` |
| Merchant analysis (Swiggy vs Zomato) | `pages/Merchant.jsx`, `GET /api/analysis/merchant/:id` |
| Trends: monthly stack, weekday×hour heatmap, anomalies (spikes, duplicates, late-night, new merchants), subscriptions | `pages/Trends.jsx`, `GET /api/analysis/trends` |
| Behaviour profile: spender type, sensitivities, peaks, churn risk, LTV | `engine/analytics.js`, `GET /api/analysis/behavioral-profile` |
| Recommendations with savings priced from your data, accept/dismiss, impact tracking, peer challenges | `pages/Recommendations.jsx`, `/api/recommendations/*` |
| Offers: relevance-ranked by spend (never demographics), impressions on real visibility, reveal code, "not relevant" learning | `engine/insights.js#rankOffers`, `/api/ads/*` |
| Budgets with suggested amounts, feasibility and daily pace | `pages/Budget.jsx`, `/api/budget/*` |
| Alerts: anomalies, budget pace, overlaps, deals, weekly summary | `pages/Alerts.jsx`, `/api/alerts/*` |
| Ask your money (Claude Q&A over your aggregates) | Shell drawer, `POST /api/analysis/ask` |
| Exports: CSV, monthly/annual PDF (dependency-free), report JSON | `/api/export/csv`, `/api/export/pdf`, `/api/report/{monthly,annual}` |
| **Paytm partner API** + live console | `routes/paytm.js`, `pages/Partner.jsx` |

### Partner API (`x-api-key` header)

```
GET  /api/paytm/user/:userId/spending-summary
GET  /api/paytm/user/:userId/category-breakdown
GET  /api/paytm/user/:userId/merchant-behavior
GET  /api/paytm/user/:userId/behavioral-profile
GET  /api/paytm/user/:userId/ad-recommendations[?ai=1]
GET  /api/paytm/users/segment/:segmentId      (high_food_spenders, fashion_shoppers, subscription_heavy, deal_hunters, frequent_riders)
POST /api/paytm/feedback/ad-performance
GET  /api/paytm/ads/performance
```

Returns **403 for users who haven't opted in** (Settings → Privacy). Segments aggregate consented users only and return no identities.

## Honesty notes for the demo

- Transaction data is generated (deterministic per user) to stand in for the Paytm feed.
- Peer comparisons use illustrative cohort benchmarks by income band.
- Delivery fees are estimated at ₹45/order.
- Demo profiles include 30 days of simulated offer impressions/clicks so partner stats aren't empty; the console says so.
- Offer campaigns and coupon codes are samples.

## Layout

```
server/src
  data/      catalog.js (7 categories, 27 subs, 60+ merchants) · generator.js (personas) · offers.js (25 campaigns, benchmarks)
  engine/    categorize.js · analytics.js · insights.js (recs, insights, challenges, offer ranking)
  ai/        claude.js (API / Agent SDK / engine) · index.js (categorise, briefing, ask, ad strategy)
  lib/       auth · store · context (per-request analysis, budgets, alerts)
  routes/    auth · spending · analysis · recommendations · ads · paytm · budget · alerts · export
client/src
  components/three/  UniverseScene (R3F) · Universe (lazy wrapper)
  components/        ui · cards (Insight/Offer/Recommendation) · charts · Shell
  pages/             Landing · Auth · Connect · Dashboard · Category · Merchant · Trends · Recommendations · Offers · Budget · Transactions · Alerts · Partner · Settings
```

Production: `pnpm build && pnpm start` serves the app and API on one port.
