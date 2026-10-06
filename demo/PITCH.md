# Spend Tracker — Pitch & Demo Kit

> **Every rupee. Finally in focus.**
> Spending intelligence for India's payment rails. Partners like Paytm stream UPI payments in; Spend Tracker cleans and categorises every rupee deterministically and keeps a living profile per phone number. People get a premium money app with AI briefings, savings and offers that fit. Partners get a consented API, an Integration Portal and a new ad-revenue line.

**In this folder**

| File | What it is |
|---|---|
| `slides.html` | 21-slide reveal.js deck in a live three.js deep-space scene. The camera orbits a back-lit planet wearing an orbital spend ring, while UPI payments stream in as comets. Open it in Chrome. |
| `assets/*.jpeg` | Real screenshots from the running app in the dark theme, used by the slides. |
| `PITCH.md` | This file: pitch script, demo script, checklist and Q&A prep. |

**Presenting the slides:** open `demo/slides.html` in Chrome.

- `F`: fullscreen
- `→` / `Space`: next
- `S`: speaker notes in a second window
- `O`: overview
- `Esc`: exit

The deck needs internet for fonts and the CDN scripts. It respects *reduce motion*, in which case the 3D scene renders still frames.

---

## 1. Elevator pitch (30 seconds)

India makes billions of UPI payments a month, and almost nobody knows where their money went. Statements read like serial numbers (`PAYTM*SWIGGY LIMITED 4412093`). Apps show history, not insight. Partners hold the data but can't read it, so their offers are generic.

Spend Tracker turns raw UPI payments into clear spending insight. A deterministic pipeline validates, normalises, de-duplicates, filters and categorises every payment with a confidence score, then builds a living profile per phone number. People get a premium app that shows them where every rupee goes and how to keep more of it. Partners get a consented API, an Integration Portal and offers people actually want. AI writes the words, but it never invents a number.

---

## 2. The three-minute pitch (slide by slide)

| # | Slide | Time | What to say |
|---|---|---|---|
| 1 | **Every rupee. Finally in focus.** | 0:00 | "We built Spend Tracker: it shows people where every rupee goes, and helps them keep more of it. The planet is a person's money; the comets are their payments." |
| 2 | **The problem** | 0:15 | "UPI made paying invisible. The data is noise, apps show history not insight, and partners can't read what they hold." *(click the three cards)* |
| 3 | **Our insight** | 0:35 | "The gap isn't data, it's understanding. A cryptic string becomes Swiggy at 97% confidence, then a convenience spender, then ₹16,700 a month he can keep." *(click through the flow)* |
| 4 | **Two products, one engine** | 0:50 | "A money app for people, a platform for partners, one deterministic engine underneath." |
| 5 | **Meet Rohan** | 1:00 | "77 deliveries a month, two overlapping streaming plans, a duplicate ₹486 charge, a laptop at 1 a.m. He can keep ₹16,700 a month, about two lakh a year." |
| 6–8 | **Overview · Deep dives · Save money** | 1:15 | "The dial, every category's change, the patterns behind the totals, and specific changes priced in rupees." One line each. |
| 9 | **Offers that fit** | 1:40 | "Swiggy One first, because his fees make it worth ₹1,900 to him, and the card says why." |
| 10 | **Ask your money** | 1:50 | "Plain-language questions, answered from his own numbers." |
| 11 | **AI that can't invent money** | 2:00 | "The engine does the maths; models only write words. There are four tiers: a cloud model, a small open model on our own server, the same model on the user's GPU, and the engine. Every rupee figure is checked against the input." |
| 12 | **Private by design** | 2:20 | "On-device mode, consent per partner, erasure and export." |
| 13 | **Pipeline** | 2:30 | "Messy UPI in, clear insight out. Six deterministic steps, idempotent batches of up to 1,000." |
| 14–16 | **Read API · Portal · Security** | 2:40 | "One call gives a whole customer. Mission control for partners. Scoped hashed keys and tenant isolation." One sentence each. |
| 17–19 | **Why it wins · Stack · Next** | 2:50 | People save, Paytm earns, merchants reach the right customers. Then **"Let me show you."** |
| 20 | **Live demo** | 3:00 | Switch to the browser and follow the script below. |
| 21 | **Close** | — | "Every rupee. Finally in focus." Pause. Questions. |

---

## 3. Live demo script (≈4 minutes)

Run `pnpm dev`, then open the app at **http://localhost:7100** in a separate Chrome window: dark theme, 100% zoom. If you used `pnpm start`, everything is on port **7101** instead.

1. **Landing (15s).** Let the stars drift and scroll once: the planet rises as the hero scrolls away.
   *"This is the app."* → **Get started**.

2. **Continue with Paytm (20s).** Phone `98765 00001`. The OTP is shown on screen (`OTP_DEMO=1`).
   *"Real phone + OTP flow, the same identity the partner API uses."*

3. **Overview (40s).** Point at the dial: ₹1,07,868 in the last 30 days, 2.1× the previous period.
   *"Every category has its own change. 'Where it went' shows merchants, not UPI IDs."*
   Scroll to the **briefing**: *"Written from his own numbers, refreshed only when his payments change."*

4. **Deep dive (40s).** Click **Food & Dining**.
   *"77 delivery orders a month, Swiggy 58% vs Zomato 42%, about ₹3,400 a month in delivery fees, and he spends 42% more than similar people."*
   Open **Trends**: *"The star map shows when he spends: 8–9 pm, every day."*

5. **Ask your money (30s).** Click **Ask your money** → *"How much do delivery fees cost me?"*
   *"Answers come from his aggregates. The model never sees raw transactions and can't make up a number."*

6. **Save money and Offers (30s).** **Save money**: *"₹16,700 a month in changes he can tick off."*
   Then **Offers**: *"Swiggy One is first because it saves him ₹1,900, and it says so."*

7. **Partner side: the wow moment (60s).** Open **http://localhost:7100/portal** → **Use demo account**.
   *"This is Paytm's view."* On the overview, use **Send a test event**. Send a raw UPI payment (e.g. payee `PAYTM*SWIGGY LIMITED 4412093`, `swiggy.payu@hdfcbank`, ₹349).
   *"Watch: validated, normalised, de-duplicated, categorised. Swiggy, food delivery, 97% confidence."*
   Open **Deliveries**: *"Every batch, every item's outcome."* Then **Ad revenue**: *"CPM, CPC and CPA from offers people actually want."*

8. **Docs (15s, optional).** Open **http://localhost:7100/docs**.
   *"Generated from the same spec the server validates with, so they can't drift."*

**Optional (if asked): on-device AI.** Go to **Settings → On-device AI** and download the small model once (cached by the browser). Turn on **Prefer on-device** and ask a question again. *"Now nothing leaves the browser."*

### If something goes wrong

| Problem | What to do |
|---|---|
| No internet / cloud AI slow | Everything still works. The server model (Qwen2.5 1.5B, in-process) and then the built-in engine take over automatically. For guaranteed instant answers set `AI_DISABLED=1` in `.env` and restart. |
| Demo data looks messy after rehearsal | `pnpm seed` resets the three personas. |
| OTP not shown | Make sure `.env` has `OTP_DEMO=1` (`pnpm run setup` creates it), or use email login `rohan@demo.spendtracker.app` / `spend-smart-2026`. |
| Portal "Use demo account" missing | `.env` needs `PORTAL_DEMO=1`, or sign in with `integrations@paytm.demo` / `paytm-partner-2026`. |
| Port busy | `lsof -ti:7100,7101 \| xargs kill`, then `pnpm dev`. |
| 3D looks choppy on a projector | Present the deck from Chrome with hardware acceleration on. The app's 3D backdrop is dark-theme only; switching to light removes it. |

---

## 4. Pre-demo checklist

- [ ] `pnpm run setup` once (Node 24+). It installs dependencies, creates `.env`, downloads the server model (≈1.1 GB) and builds the client.
- [ ] `pnpm dev`: app on http://localhost:7100, API on http://localhost:7101.
- [ ] `curl localhost:7101/api/health`. Check that `ai.enabled` is true, or that `serverModel.ready` is true for the offline fallback.
- [ ] `pnpm seed` right before presenting.
- [ ] Rehearse the portal **Send a test event** once.
- [ ] Chrome: dark theme, 100% zoom, bookmarks bar hidden, notifications off.
- [ ] `demo/slides.html` open in another window, press `F`; `S` for speaker notes on your laptop screen.

---

## 5. Who it's for

| Persona (demo) | What Spend Tracker finds |
|---|---|
| **Rohan**, convenience spender, Bengaluru (`98765 00001`) | 77 deliveries a month, Netflix + Hotstar overlap, duplicate Swiggy charge, 1 a.m. ₹38,990 laptop. Could keep ₹16,700 a month. |
| **Neha**, deal-hunting fashionista, Mumbai (`98765 00002`) | Shopping-led spend, offer-sensitive, fashion merchants. |
| **Kabir**, subscription collector, Pune (`98765 00003`) | Many recurring plans; subscription overlap and renewals. |

**Who pays (proposed)**

- **Paytm and payment apps:** daily engagement plus a new ad-revenue line from spend-based offers (CPM / CPC / CPA), and behaviour profiles and segments for their own products.
- **Merchants and brands:** reach people by real behaviour; a 95% match beats a broad blast.
- **People:** free.

---

## 6. Why it's different

1. **Deterministic first.** Categories, totals, savings and every rupee shown come from an auditable engine with confidence scores. Models only write language.
2. **AI that can't break the demo, or lie.** There are four tiers: cloud model → in-process server model → on-device browser model → engine.
   - Small models get schema-constrained decoding, number grounding and echo rejection.
   - Any failure falls back instantly.
3. **Two products on one engine.** The consumer app and the partner platform read the same profile, so insights and offers always agree.
4. **Partner-grade from day one.** Idempotent batches, scoped hashed keys, tenant isolation, consent per partner, DPDP erasure, live docs and OpenAPI.
5. **Private by design.** Only a ~700-token aggregate summary is ever used for AI, never raw transactions. *Prefer on-device* keeps even that in the browser.

---

## 7. How it's built

- **Client:** React 19, Vite 8, Tailwind 4, Motion, Recharts, three.js (deep-space backdrop, dark theme only), WebLLM in a Web Worker for on-device AI.
- **Server:** Node 24, Express 5, built-in `node:sqlite`, JWT, Helmet, per-key rate limits, OpenAPI from the same spec the docs use.
- **Pipeline (`server/src/partner/ingest.js`):**
  1. validate
  2. normalise
  3. identify by phone
  4. de-dupe by id and UPI RRN
  5. filter junk (credits, self-transfers, ₹1 penny drops)
  6. categorise: catalog → ≈60 MCC codes → keywords → P2P
- **AI (`server/src/ai/`):** the engine computes a grounded baseline and the model writes over it.
  - The provider chain is: cloud model → Qwen2.5 1.5B via `node-llama-cpp` (Metal / CUDA / Vulkan / CPU, no Ollama) → browser Qwen via WebGPU → engine.
  - Small-model output passes `grounding.js` checks before anyone sees it.
- **One command:** `pnpm run setup`. Production is `pnpm build && pnpm start` on a single port.

---

## 8. Judge Q&A prep

**"Isn't this just another expense tracker?"**
No. Expense trackers make you log spending or read bank SMS. We start from the partner's real UPI stream, clean it deterministically and build a profile per phone number. That profile powers a consumer app *and* a partner API, so the same insight helps the person and lets the partner serve them better, with consent.

**"How accurate is categorisation?"**
It's layered and explainable. User corrections come first, then a merchant catalog (by name or UPI handle), about 60 MCC codes, keywords and person-to-person heuristics. Every transaction carries `confidence` and `categorised_by`, so partners can see why.

**"How do you stop AI from making up numbers?"**
The engine computes every figure first. Models only receive a small aggregate summary and return JSON. For small models, decoding is constrained to a schema, any rupee amount not present in the input is rejected, and instruction echoes are dropped. If anything fails, the engine's text is shown.

**"What if the AI is down?"**
There are four tiers: cloud model → our in-process server model → the user's own GPU → the engine. The demo can't break.

**"Privacy and DPDP?"**
Consent is per partner and users can withdraw it anytime; the partner API returns 403 without it. Erasure is available from the app and the API. AI only sees aggregates, and *Prefer on-device* keeps even those in the browser.

**"How do partners integrate?"**
They POST single payments to `/v1/events` (webhook or beacon), or batches of up to 1,000 to `/v1/transactions/batch` with an `Idempotency-Key`. Then they read `/v1/users/{phone}/behavior`, `/summary`, `/merchants`, `/report` and segments. Keys are scoped, hashed and shown once.

**"How does it make money?"**
Spend-based offers priced CPM, CPC or CPA. Offers convert because they're matched to real behaviour and explain why ("saves ≈₹1,900"). Profiles and segments make the partner's own products smarter.

**"What's real and what's simulated in the demo?"**
The ingestion pipeline, API, portal and analytics are real. Persona histories and a 14-day Paytm backfill are generated to stand in for a live feed, and they go through the *real* pipeline (labelled `simulated` in Deliveries). Peer benchmarks are illustrative, and offers are samples.

**"What's next?"**
Account Aggregator for cards and bank accounts, real-time nudges at payment time, Hindi and regional-language briefings over WhatsApp, and merchant self-serve campaigns in the portal.

**"What was hardest?"**
Making small models safe for money: they phrase well but misplace numbers. We solved it by giving them an easier task (rewrite the engine's draft), constraining output to a schema, and rejecting any figure that isn't in the input.
