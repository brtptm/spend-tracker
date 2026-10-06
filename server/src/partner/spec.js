// Single source of truth for the partner API: drives the docs site (/docs) and /v1/openapi.json.
// Response examples are captured from the live API (scripts/capture-examples.mjs), so docs match reality.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATEGORIES } from '../data/catalog.js';
import { SCOPES } from './keys.js';
import { REJECT_CODES, FILTER_CODES, MAX_BATCH, MCC_MAP } from './ingest.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const exFile = path.join(__dirname, 'examples.json');
const EX = fs.existsSync(exFile) ? JSON.parse(fs.readFileSync(exFile, 'utf8')) : {};

const F = (name, type, description, extra = {}) => ({ name, type, description, ...extra });
const PHONE = F('phone', 'string', 'User’s 10-digit Indian mobile number. `+91`, `91` and leading `0` are accepted and stripped.', { in: 'path', required: true, example: '9876500001' });
const WINDOW_Q = [
  F('period', 'string', 'Relative window. Ignored when `from`/`to` or `month` is set.', { enum: ['7d', '30d', '90d', 'month', 'last_month', '3m', '6m', '12m', 'overall'], default: '30d' }),
  F('from', 'date', 'Start date (inclusive), `YYYY-MM-DD` or ISO 8601. Max span 24 months.', { example: '2026-07-01' }),
  F('to', 'date', 'End date (inclusive). Defaults to now.', { example: '2026-09-30' }),
  F('month', 'string', 'Calendar month `YYYY-MM`.', { example: '2026-09' }),
];

export const SCHEMAS = {
  UpiPayment: {
    description: 'One UPI payment as your systems see it. Send exactly what you have; optional fields improve categorisation.',
    fields: [
      F('id', 'string', 'Your unique id for this payment. Used for idempotency and status updates. ≤ 64 chars.', { required: true, example: 'PTM-20261006-000184' }),
      F('phone', 'string', 'Payer’s mobile number — the stable identity of the user (UPI IDs can change).', { required: true, example: '+91 98765 00001' }),
      F('amount', 'number | string', 'Rupees, up to 2 decimals. Strings like `"₹1,249.50"` are accepted. > 0 and ≤ 10,00,000.', { required: true, example: 349 }),
      F('timestamp', 'string (ISO 8601)', 'When the payment happened. Not more than 5 minutes in the future; older than 3 years is filtered.', { required: true, example: '2026-10-06T13:12:45+05:30' }),
      F('status', 'string', 'Final status. `pending` is filtered until you send the settled status with the same `id`.', { enum: ['success', 'failed', 'pending', 'reversed'], default: 'success' }),
      F('direction', 'string', '`credit` (money received) is filtered — only spending is stored.', { enum: ['debit', 'credit'], default: 'debit' }),
      F('currency', 'string', 'Only INR.', { enum: ['INR'], default: 'INR' }),
      F('payer_vpa', 'string', 'UPI ID the user paid from. Stored per user so you can see every UPI ID a phone has used.', { example: 'rohan.v@paytm' }),
      F('payee_vpa', 'string', 'UPI ID that was paid. Required if `payee_name` is missing.', { example: 'swiggy.payu@hdfcbank' }),
      F('payee_name', 'string', 'Payee display name from the UPI network. Gateway prefixes (`PAYTM*`, `UPI-`, `RZP*`…), ids and legal suffixes are cleaned.', { example: 'PAYTM*SWIGGY LIMITED 4412093' }),
      F('mcc', 'string', '4-digit Merchant Category Code. Used when the merchant is not in our catalog.', { example: '5814' }),
      F('note', 'string', 'Payment remark / description. ≤ 200 chars.', { example: 'Dinner order #88213' }),
      F('rrn', 'string', 'UPI Retrieval Reference Number. A second de-duplication key.', { example: '628011234567' }),
      F('app', 'string', 'Originating app.', { example: 'paytm' }),
      F('user', 'object', 'Optional profile hints, applied only the first time we see this phone: `{ name, city }`.', { example: { name: 'Rohan Verma', city: 'Bengaluru' } }),
    ],
  },
  IngestResult: {
    description: 'Outcome for one payment.',
    fields: [
      F('id', 'string', 'Your payment `id` (null if it could not be read).'),
      F('status', 'string', 'What happened.', { enum: ['accepted', 'updated', 'duplicate', 'filtered', 'rejected'] }),
      F('code', 'string', 'Machine-readable reason for `filtered`, `rejected` or RRN duplicates. See Enums.'),
      F('param', 'string', 'Field at fault, for `rejected`.'),
      F('message', 'string', 'Human-readable explanation.'),
      F('transaction', 'object', 'For `accepted`: `{ transaction_id, user: { phone, created }, merchant, category, subcategory, confidence, categorised_by }`.'),
    ],
  },
  BatchResult: {
    description: 'Summary plus one result per input, in input order.',
    fields: [
      F('batch_id', 'string', 'Id of this ingest (see `/ingest/logs/{id}`).'),
      F('received', 'integer', 'Items in the request.'), F('accepted', 'integer', 'Stored as new transactions.'), F('updated', 'integer', 'Existing payments whose status changed.'),
      F('duplicates', 'integer', 'Already stored (same `id` or `rrn`).'), F('filtered', 'integer', 'Valid but not spending (credits, pending, self-transfers, tests).'), F('rejected', 'integer', 'Invalid — fix and resend.'),
      F('users_created', 'integer', 'Phones seen for the first time.'), F('results', 'IngestResult[]', 'Per-item outcomes.'),
    ],
  },
  Window: {
    description: 'The time window a response covers.',
    fields: [F('period', 'string', '`custom`, `month`, `overall` or the period you asked for.'), F('label', 'string', 'Human label.'), F('from', 'string', 'ISO start.'), F('to', 'string', 'ISO end.'), F('days', 'integer', 'Length in days.')],
  },
  User: {
    description: 'A person, identified by phone.',
    fields: [
      F('phone', 'string', '10-digit mobile.'), F('name', 'string | null', 'From `user.name` hints or the app profile.'), F('city', 'string | null', ''),
      F('source', 'string', '`partner` (created by your ingestion) or `app` (signed up in the app).', { enum: ['partner', 'app'] }),
      F('consent', 'object', '`{ share_insights, ad_personalization }`.'), F('transactions', 'integer', 'Stored payments.'),
      F('first_payment_at', 'string', ''), F('last_payment_at', 'string', ''), F('upi_ids', 'UpiId[]', 'Every UPI ID this phone has paid from.'),
    ],
  },
  UpiId: { description: 'A UPI ID (VPA) used by the user.', fields: [F('vpa', 'string', ''), F('payments', 'integer', 'Payments seen from it.'), F('first_seen', 'string', ''), F('last_seen', 'string', '')] },
  CategoryAmount: {
    description: 'Spend in one category.',
    fields: [F('category', 'string', 'Category id.', { enum: CATEGORIES.map((c) => c.id) }), F('name', 'string', ''), F('amount', 'integer', 'Rupees.'), F('share', 'number', '0–1 share of the window total.'), F('transactions', 'integer', ''), F('change_vs_previous', 'number | null', 'Fractional change vs the previous same-length window (0.32 = +32%). Null when there was no spend before.')],
  },
  Summary: {
    description: 'Totals for a window.',
    fields: [
      F('window', 'Window', ''), F('total_spent', 'integer', 'Completed payments, rupees.'), F('transactions', 'integer', ''), F('failed_transactions', 'integer', ''),
      F('average_daily', 'integer', ''), F('average_ticket', 'integer', ''), F('monthly_equivalent', 'integer', 'Total scaled to 30.44 days.'),
      F('previous_window', 'object', '`{ total_spent, change }` for the same-length window just before.'), F('top_category', 'string', ''),
      F('categories', 'CategoryAmount[]', ''), F('top_merchants', 'object[]', '`{ name, merchant_id, amount, transactions }`.'),
    ],
  },
  Merchant: {
    description: 'A merchant or app the user pays.',
    fields: [
      F('name', 'string', 'Canonical name for known apps (e.g. “Swiggy”), cleaned payee name otherwise.'), F('merchant_id', 'string | null', 'Catalog id for known apps.'),
      F('is_known_app', 'boolean', ''), F('category', 'string', ''), F('subcategory', 'string', ''), F('amount', 'integer', ''), F('transactions', 'integer', ''),
      F('average_ticket', 'integer', ''), F('share_of_spend', 'number', '0–1 of all non-P2P spend in the window.'), F('share_of_subcategory', 'number', '0–1 within its subcategory — e.g. Swiggy’s share of food delivery.'),
      F('frequency_per_month', 'number', ''), F('first_payment_at', 'string', ''), F('last_payment_at', 'string', ''),
    ],
  },
  Behavior: {
    description: 'Deterministic behavioural profile over the last 3 months.',
    fields: [
      F('spender_type', 'string', '', { enum: ['convenience_spender', 'deal_hunter', 'trend_shopper', 'subscription_collector', 'budget_conscious', 'balanced'] }), F('spender_label', 'string', ''),
      F('primary_motivation', 'string', ''), F('monthly_spend', 'integer', ''), F('spend_to_income', 'number | null', 'Only if income is known.'),
      F('top_categories', 'string[]', ''), F('preferred_apps', 'object[]', 'Per subcategory: `{ subcategory, category, total, apps: [{ merchant_id, name, share }] }` — e.g. food_delivery → Swiggy 0.58, Zomato 0.42.'),
      F('timing', 'object', '`{ peak_hours, peak_days, frequency, transactions_per_month }`.'), F('food', 'object', '`{ delivery_orders_per_month, delivery_share, top_dish }`.'),
      F('subscriptions', 'object', '`{ count, monthly, list: [{ name, merchant_id, monthly, last_charged_at, next_charge_estimate }] }`.'),
      F('sensitivity', 'object', '`{ discounts, convenience, price }`, each 0–1.'), F('coupon_usage_rate', 'number', '0–1.'), F('brand_loyalty', 'number', '0–1: share of the top merchant among the top five.'),
      F('churn_risk', 'string', '', { enum: ['low', 'medium', 'high'] }), F('predicted', 'object', '`{ will_use_discount, will_reduce_spending, will_try_new_service }`, 0–1.'), F('upi_ids', 'string[]', ''),
    ],
  },
  Transaction: {
    description: 'A cleaned, categorised payment.',
    fields: [
      F('id', 'string', 'Our id.'), F('external_id', 'string | null', 'Your `id`.'), F('timestamp', 'string', ''), F('amount', 'number', ''), F('currency', 'string', ''),
      F('status', 'string', '', { enum: ['success', 'failed'] }), F('merchant', 'object', '`{ name, merchant_id }`.'), F('category', 'string', ''), F('subcategory', 'string', ''),
      F('confidence', 'number', '0–1.'), F('categorised_by', 'string', 'Which rule decided the category.', { enum: ['user', 'rule', 'mcc'] }),
      F('payer_vpa', 'string | null', ''), F('payee_vpa', 'string | null', ''), F('mcc', 'string | null', ''), F('rrn', 'string | null', ''), F('note', 'string | null', ''),
    ],
  },
  Error: {
    description: 'Every non-2xx response has this shape.',
    fields: [F('error.type', 'string', '', { enum: ['invalid_request_error', 'authentication_error', 'permission_error', 'not_found_error', 'rate_limit_error', 'api_error'] }), F('error.code', 'string', 'Stable machine code.'), F('error.message', 'string', 'Human-readable.'), F('error.param', 'string', 'Field at fault, if any.'), F('error.doc_url', 'string', ''), F('request_id', 'string', 'Quote this to support.')],
  },
};

const E = (o) => ({ ...o, response: EX[o.id] });
export const ENDPOINTS = [
  // Ingest
  E({ id: 'send-event', group: 'Ingest', method: 'POST', path: '/v1/events', title: 'Send a payment (webhook)', scope: 'transactions:write',
    description: 'Fire-and-forget delivery of a single UPI payment the moment it settles — point your payment-status webhook here. Accepts `application/json`, `text/plain` JSON (so `navigator.sendBeacon` works) and `{ "object": "event", "data": { … } }` envelopes. Returns `202` for accepted, updated, duplicate and filtered payments, and `422` only when the payment itself is invalid (do not retry those).',
    body: 'UpiPayment', bodyExample: { id: 'PTM-20261006-000184', phone: '+91 98765 00009', amount: 349, timestamp: '2026-10-06T13:12:45+05:30', status: 'success', payer_vpa: 'aarav.s@paytm', payee_vpa: 'swiggy.payu@hdfcbank', payee_name: 'PAYTM*SWIGGY LIMITED 4412093', mcc: '5814', rrn: '628011234567', user: { name: 'Aarav Shah', city: 'Mumbai' } },
    responses: [{ status: 202, description: 'Processed (see `status`).', schema: 'IngestResult' }, { status: 422, description: 'Invalid payment — `status: rejected` with `code` and `param`.' }, { status: 401, description: 'Bad key.' }, { status: 403, description: 'Key lacks `transactions:write`.' }] }),
  E({ id: 'send-batch', group: 'Ingest', method: 'POST', path: '/v1/transactions/batch', title: 'Send a batch', scope: 'transactions:write',
    description: `Up to ${MAX_BATCH.toLocaleString('en-IN')} payments per request — for backfills and periodic syncs. Body: \`{ "transactions": [ … ] }\`, a bare JSON array, or NDJSON (\`application/x-ndjson\`). Processed atomically in one database transaction; each item gets its own result, so one bad row never fails the batch. Send an \`Idempotency-Key\` header to make retries safe: a repeat returns the original result with \`Idempotent-Replayed: true\`.`,
    headers: [F('Idempotency-Key', 'string', 'Any unique string ≤ 120 chars (a UUID is ideal).', { example: 'sync-2026-10-06T13:00Z' })],
    body: { type: 'object', fields: [F('transactions', 'UpiPayment[]', `1–${MAX_BATCH.toLocaleString('en-IN')} payments.`, { required: true })] },
    bodyExample: { transactions: [
      { id: 'PTM-000185', phone: '9876500009', amount: '₹1,249.50', timestamp: '2026-10-05T20:41:00+05:30', payee_name: 'UPI-ZOMATO PVT LTD', payee_vpa: 'zomato@hdfcbank', payer_vpa: 'aarav.s@paytm' },
      { id: 'PTM-000186', phone: '9876500009', amount: 450, timestamp: '2026-10-05T09:02:00+05:30', payee_name: 'RAJ ELECTRONICS', payee_vpa: 'rajelec@okaxis', mcc: '5732' },
      { id: 'PTM-000187', phone: '9876500009', amount: 2000, timestamp: '2026-10-04T18:00:00+05:30', direction: 'credit', payee_vpa: 'aarav.s@paytm' },
      { id: 'PTM-000188', phone: '98765', amount: 10, timestamp: '2026-10-04T18:00:00+05:30', payee_vpa: 'shop@ybl' },
    ] },
    responses: [{ status: 200, description: 'Batch processed.', schema: 'BatchResult' }, { status: 400, description: '`invalid_body`, `empty_batch` or `batch_too_large`.' }] }),
  E({ id: 'list-ingest-logs', group: 'Ingest', method: 'GET', path: '/v1/ingest/logs', title: 'List ingest logs', scope: 'transactions:write',
    description: 'Your most recent event and batch deliveries with outcome counts — useful for reconciliation dashboards.',
    query: [F('limit', 'integer', '1–100.', { default: 20 })], responses: [{ status: 200, description: 'Newest first.' }] }),
  E({ id: 'get-ingest-log', group: 'Ingest', method: 'GET', path: '/v1/ingest/logs/{id}', title: 'Get an ingest log', scope: 'transactions:write',
    description: 'Full per-item results for one delivery.', params: [F('id', 'string', 'Ingest or batch id.', { in: 'path', required: true, example: 'ing_…' })], responses: [{ status: 200, description: 'The log.' }, { status: 404, description: '`ingest_log_not_found`.' }] }),
  // Users
  E({ id: 'get-user', group: 'Users', method: 'GET', path: '/v1/users/{phone}', title: 'Get a user', scope: 'users:read', description: 'Identity, consent, payment counts and every UPI ID the phone has used.', params: [PHONE], responses: [{ status: 200, description: '', schema: 'User' }, { status: 404, description: '`user_not_found`.' }, { status: 403, description: '`consent_required`.' }] }),
  E({ id: 'get-summary', group: 'Users', method: 'GET', path: '/v1/users/{phone}/summary', title: 'Spending summary', scope: 'users:read', description: 'Totals, averages, category split and top merchants for any window — overall, a month, or a custom range — with change versus the previous same-length window.', params: [PHONE], query: WINDOW_Q, responses: [{ status: 200, description: '', schema: 'Summary' }] }),
  E({ id: 'get-categories', group: 'Users', method: 'GET', path: '/v1/users/{phone}/categories', title: 'Category breakdown', scope: 'users:read', description: 'Every category with its subcategories (e.g. Food → delivery, groceries, restaurants) for the window.', params: [PHONE], query: WINDOW_Q, responses: [{ status: 200, description: '' }] }),
  E({ id: 'get-merchants', group: 'Users', method: 'GET', path: '/v1/users/{phone}/merchants', title: 'Merchants & apps used', scope: 'users:read', description: 'Which apps and merchants the user pays, how often, and their preference within each subcategory — e.g. Swiggy 58% vs Zomato 42% of food delivery.', params: [PHONE], query: [...WINDOW_Q, F('limit', 'integer', '1–100.', { default: 25 }), F('include_p2p', 'boolean', 'Include payments to people.', { default: false })], responses: [{ status: 200, description: '', schema: 'Merchant' }] }),
  E({ id: 'get-behavior', group: 'Users', method: 'GET', path: '/v1/users/{phone}/behavior', title: 'Behaviour & preferences', scope: 'users:read', description: 'Spender type, preferred apps per subcategory, timing, subscriptions, sensitivities, churn risk and predictions. Deterministic — the same payments always give the same profile.', params: [PHONE], responses: [{ status: 200, description: '', schema: 'Behavior' }] }),
  E({ id: 'get-report', group: 'Users', method: 'GET', path: '/v1/users/{phone}/report', title: 'Monthly report', scope: 'users:read', description: 'A month in one call: totals, month-over-month change, daily series, categories, merchants, insights and savings opportunities. `complete: false` for the current month.', params: [PHONE], query: [F('month', 'string', '`YYYY-MM`. Defaults to the current month.', { example: '2026-09' })], responses: [{ status: 200, description: '' }] }),
  E({ id: 'list-upi-ids', group: 'Users', method: 'GET', path: '/v1/users/{phone}/upi-ids', title: 'UPI IDs used', scope: 'users:read', description: 'Every UPI ID (VPA) the phone has paid from, with counts and first/last seen. A user is their phone; UPI IDs come and go.', params: [PHONE], responses: [{ status: 200, description: '', schema: 'UpiId' }] }),
  E({ id: 'list-transactions', group: 'Users', method: 'GET', path: '/v1/users/{phone}/transactions', title: 'List transactions', scope: 'users:read', description: 'Cleaned, categorised payments, newest first, cursor-paginated.', params: [PHONE], query: [F('from', 'date', ''), F('to', 'date', ''), F('category', 'string', '', { enum: CATEGORIES.map((c) => c.id) }), F('limit', 'integer', '1–500.', { default: 50 }), F('cursor', 'string', '`next_cursor` from the previous page.')], responses: [{ status: 200, description: '', schema: 'Transaction' }] }),
  E({ id: 'get-offers', group: 'Users', method: 'GET', path: '/v1/users/{phone}/offers', title: 'Spend-based offers', scope: 'offers:read', description: 'Offers ranked for this user’s actual spending. Empty when the user turned off ad personalisation.', params: [PHONE], query: [F('limit', 'integer', '', { default: 10 })], responses: [{ status: 200, description: '' }] }),
  E({ id: 'offer-event', group: 'Users', method: 'POST', path: '/v1/offers/events', title: 'Report an offer event', scope: 'offers:write', description: 'Tell us when an offer was shown, clicked, converted or dismissed. Feeds relevance learning and the revenue report in the portal. Events are attributed to the user only when they are linked to you and allow ad personalisation; otherwise they are recorded anonymously.', body: { type: 'object', fields: [F('offer_id', 'string', 'Id from `/users/{phone}/offers`.', { required: true }), F('event', 'string', '', { required: true, enum: ['impression', 'click', 'conversion', 'dismiss'] }), F('phone', 'string', 'The user it was shown to.'), F('value', 'number', 'Order value in rupees, for `conversion`.')] }, bodyExample: { offer_id: 'swiggy-one', event: 'click', phone: '9876500001' }, responses: [{ status: 202, description: 'Recorded.' }] }),
  E({ id: 'update-consent', group: 'Users', method: 'PUT', path: '/v1/users/{phone}/consent', title: 'Update consent', scope: 'users:write', description: 'Mirror consent from your app. Withdrawing (`false`) always works; granting (`true`) works only for users you onboarded — others manage consent in the Spend Tracker app (`403 consent_owned_by_user`). With `share_insights: false`, reads return `403 consent_required` while ingestion continues.', params: [PHONE], body: { type: 'object', fields: [F('share_insights', 'boolean', ''), F('ad_personalization', 'boolean', '')] }, bodyExample: { share_insights: true, ad_personalization: false }, responses: [{ status: 200, description: '' }] }),
  E({ id: 'delete-user', group: 'Users', method: 'DELETE', path: '/v1/users/{phone}', title: 'Erase a user', scope: 'users:write', description: 'Right to erasure (DPDP Act 2023). Users you onboarded are deleted completely with their payments and UPI IDs (`scope: user`); for users linked to you otherwise, only your payments and the link are removed (`scope: partner_data`).', params: [PHONE], responses: [{ status: 200, description: '`{ deleted: true, transactions_deleted }`.' }] }),
  // Segments & reference
  E({ id: 'list-segments', group: 'Segments', method: 'GET', path: '/v1/segments', title: 'List segments', scope: 'segments:read', description: 'Audience definitions available for aggregate targeting.', responses: [{ status: 200, description: '' }] }),
  E({ id: 'get-segment', group: 'Segments', method: 'GET', path: '/v1/segments/{id}', title: 'Get a segment', scope: 'segments:read', description: 'Size and profile of a segment over consenting users. Never returns individuals.', params: [F('id', 'string', '', { in: 'path', required: true, example: 'high_food_delivery' })], responses: [{ status: 200, description: '' }] }),
  E({ id: 'list-categories', group: 'Reference', method: 'GET', path: '/v1/categories', title: 'Category taxonomy', scope: null, description: 'All categories and subcategories. Any valid key.', responses: [{ status: 200, description: '' }] }),
];

const GUIDES = [
  { id: 'overview', title: 'Overview', body: [
    'Spend Tracker turns raw UPI payments into clean, categorised spending and behaviour — deterministically. You send payments as they happen (or in batches); we clean them, drop what isn’t spending, categorise every payment and keep a per-user picture you can query any time.',
    'Users are identified by **phone number**, not UPI ID: people change UPI IDs and apps, their number stays. Every UPI ID a phone pays from is recorded so you can see them all.',
    'Base URL: `{BASE}/v1`. All requests and responses are JSON. Money is in rupees (INR). Times are ISO 8601.',
  ] },
  { id: 'quickstart', title: 'Quickstart', steps: [
    { title: 'Create a key', body: 'Sign in to the Integration Portal → API keys → Create key. Copy the secret now; it is shown once.' },
    { title: 'Send a payment', body: 'POST it to `/v1/events` the moment it settles.', code: 'curl {BASE}/v1/events \\\n  -H "Authorization: Bearer $STK_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"id":"PTM-1","phone":"9876500001","amount":349,"timestamp":"2026-10-06T13:12:45+05:30","payee_vpa":"swiggy.payu@hdfcbank"}\'' },
    { title: 'Read the user', body: 'Ask for their summary, merchants or behaviour by phone.', code: 'curl "{BASE}/v1/users/9876500001/summary?period=month" \\\n  -H "Authorization: Bearer $STK_KEY"' },
  ] },
  { id: 'authentication', title: 'Authentication', body: [
    'Send your secret key as `Authorization: Bearer stk_live_…` (or `X-Api-Key`). Keys are created and revoked in the Integration Portal, stored only as SHA-256 hashes, and shown once.',
    'Each key has scopes; a call outside them returns `403 missing_scope`. Give each system the narrowest key it needs — e.g. your payment webhook only `transactions:write`.',
  ], table: { head: ['Scope', 'Allows'], rows: Object.entries(SCOPES).map(([k, v]) => [`\`${k}\``, v]) } },
  { id: 'ingestion', title: 'Webhook vs batch', body: [
    '**Webhook (`POST /v1/events`)** — one payment per request, sent when it settles. Lowest latency; ideal for your payment-status callback. Works with `navigator.sendBeacon` (text/plain) for client-side fire-and-forget.',
    '**Batch (`POST /v1/transactions/batch`)** — up to 1,000 per request for backfills and scheduled syncs. Atomic, with per-item results and `Idempotency-Key` replays.',
    'Both are idempotent on your payment `id`: resending is safe. Sending the same `id` with a new final status (e.g. `success` → `reversed`) updates the stored payment instead of duplicating it.',
  ] },
  { id: 'pipeline', title: 'Cleaning pipeline', body: ['Every payment goes through the same deterministic steps. No AI is involved in ingestion: the same input always gives the same result.'],
    steps: [
      { title: '1 · Validate', body: 'Required fields, types and ranges. Failures are `rejected` with a `code` and `param` — fix and resend.' },
      { title: '2 · Normalise', body: 'Phone → 10 digits; amount → rupees (₹ and commas accepted); UPI IDs → lowercase; payee name → gateway prefixes, reference numbers and legal suffixes stripped, title-cased.' },
      { title: '3 · Identify', body: 'Find the user by phone (create on first sight) and record the payer UPI ID.' },
      { title: '4 · De-duplicate', body: 'Same `id` → duplicate (or status update). Same `rrn` for this user → duplicate.' },
      { title: '5 · Filter junk', body: 'Credits, pending payments, self-transfers between the user’s own UPI IDs, penny-drop tests and payments older than 3 years are `filtered`, not stored.' },
      { title: '6 · Categorise', body: 'In priority order: the user’s own corrections → known merchant catalog (by name or UPI ID) → MCC → keywords → person/P2P heuristics. Each result carries `confidence` and `categorised_by`.' },
    ] },
  { id: 'identity', title: 'Identity, linking & UPI IDs', body: [
    'A user is a phone number. The first payment for a new phone creates the user and **links** them to your account as their owner (`source: partner`); `user.name` and `user.city` hints fill the profile.',
    'You only ever see users linked to you. A phone that belongs to someone not linked to you returns `404 user_not_found` on reads, and payments for it are `rejected` with `user_not_linked` — no partner can attach itself to another partner’s users. A person links themselves to Paytm by signing in with “Continue with Paytm”, and then sees the same data in the app, with no re-import.',
    '`/users/{phone}/upi-ids` lists every payer UPI ID with counts and first/last seen. Payments to one of the user’s own UPI IDs are treated as self-transfers.',
  ] },
  { id: 'idempotency', title: 'Idempotency & retries', body: [
    'Payments are idempotent by `id` (and `rrn`). Batches are additionally idempotent by the `Idempotency-Key` header — a replay returns the stored result and `Idempotent-Replayed: true`.',
    'Retry on network errors, `429` and `5xx` with exponential backoff (e.g. 1s, 2s, 4s… up to 1 minute). Never retry `4xx` other than `429`.',
  ] },
  { id: 'errors', title: 'Errors', body: ['Errors use one shape: `{ error: { type, code, message, param, doc_url }, request_id }`. Every response carries `X-Request-Id`.'],
    table: { head: ['HTTP', 'type', 'Typical codes'], rows: [
      ['400', '`invalid_request_error`', '`invalid_json`, `invalid_body`, `empty_batch`, `batch_too_large`, `invalid_phone`, `invalid_period`, `invalid_range`, `range_too_long`, `invalid_month`, `invalid_cursor`, `invalid_category`'],
      ['401', '`authentication_error`', '`invalid_api_key`'], ['403', '`permission_error`', '`missing_scope`, `consent_required`, `consent_owned_by_user`'],
      ['404', '`not_found_error`', '`user_not_found`, `segment_not_found`, `ingest_log_not_found`, `route_not_found`'], ['413', '`invalid_request_error`', '`payload_too_large` (6 MB)'],
      ['422', '—', 'Event endpoint only: the payment was `rejected` (see its `code`).'], ['429', '`rate_limit_error`', '`rate_limited`'], ['500', '`api_error`', '`internal_error` — retry with backoff'],
    ] } },
  { id: 'rate-limits', title: 'Rate limits', body: ['Limits are per key, per minute. Responses include `RateLimit` and `RateLimit-Policy` headers (IETF draft 8).'],
    table: { head: ['Endpoint', 'Limit / min'], rows: [['POST /v1/events', '1,200'], ['POST /v1/transactions/batch', '120 (× 1,000 payments)'], ['GET /v1/users/…', '600'], ['Ingest logs', '300'], ['Segments', '60–120'], ['Consent / erase', '60–120']] } },
  { id: 'privacy', title: 'Consent & privacy', body: [
    'Consent is **per partner**: read endpoints answer only while the user’s own switch in the app *and* your link’s `share_insights` are on. You can always **withdraw** consent with `PUT /users/{phone}/consent`; you can **grant** it only for users you onboarded — people who signed up in the app grant it themselves (`403 consent_owned_by_user`).',
    '`DELETE /users/{phone}` (DPDP Act 2023): users you onboarded are erased completely (`scope: user`); for anyone else your payments and your link are removed and their account stays (`scope: partner_data`). Segments are aggregate-only over your consenting users. Keys are hashed at rest; secrets are never logged.',
  ] },
];

export const SPEC = {
  info: { title: 'Spend Tracker Partner API', version: '2026-10-01', description: 'Feed UPI payments; read clean spending, behaviour and preferences by phone number.' },
  guides: GUIDES, endpoints: ENDPOINTS, schemas: SCHEMAS,
  enums: {
    categories: CATEGORIES.map((c) => ({ id: c.id, name: c.name, subcategories: Object.entries(c.subs).map(([id, name]) => ({ id, name })) })),
    reject_codes: Object.entries(REJECT_CODES).map(([code, message]) => ({ code, message })),
    filter_codes: Object.entries(FILTER_CODES).map(([code, message]) => ({ code, message })),
    scopes: Object.entries(SCOPES).map(([scope, description]) => ({ scope, description })),
    mcc: Object.entries(MCC_MAP).map(([mcc, v]) => ({ mcc, ...v })),
  },
};

// ── OpenAPI 3.1 from the same spec ───────────────────────────────────────────
const TYPE = (t) => {
  if (/\[\]$/.test(t)) { const inner = t.slice(0, -2); return { type: 'array', items: SCHEMAS[inner] ? { $ref: `#/components/schemas/${inner}` } : TYPE(inner) }; }
  if (SCHEMAS[t]) return { $ref: `#/components/schemas/${t}` };
  if (t.startsWith('integer')) return { type: 'integer' };
  if (t.startsWith('number | string')) return { oneOf: [{ type: 'number' }, { type: 'string' }] };
  if (t.startsWith('number')) return { type: t.includes('null') ? ['number', 'null'] : 'number' };
  if (t.startsWith('boolean')) return { type: 'boolean' };
  if (t.startsWith('object')) return { type: 'object' };
  if (t === 'date') return { type: 'string', format: 'date' };
  if (t.includes('ISO')) return { type: 'string', format: 'date-time' };
  return { type: t.includes('null') ? ['string', 'null'] : 'string' };
};
const objSchema = (fields, description) => ({
  type: 'object', description,
  properties: Object.fromEntries(fields.filter((f) => !f.name.includes('.')).map((f) => [f.name, { ...TYPE(f.type), description: f.description || undefined, enum: f.enum, default: f.default, example: f.example }])),
  required: fields.filter((f) => f.required).map((f) => f.name),
});
export function openapi() {
  const paths = {};
  for (const e of ENDPOINTS) {
    const p = (paths[e.path.replace('/v1', '')] ||= {});
    const params = [...(e.params || []).map((f) => ({ name: f.name, in: 'path', required: true, description: f.description, schema: TYPE(f.type), example: f.example })),
      ...(e.query || []).map((f) => ({ name: f.name, in: 'query', description: f.description, schema: { ...TYPE(f.type), enum: f.enum, default: f.default }, example: f.example })),
      ...(e.headers || []).map((f) => ({ name: f.name, in: 'header', description: f.description, schema: { type: 'string' }, example: f.example }))];
    p[e.method.toLowerCase()] = {
      operationId: e.id, summary: e.title, description: e.description, tags: [e.group], security: [{ bearer: [] }], 'x-scope': e.scope || undefined,
      parameters: params.length ? params : undefined,
      requestBody: e.body ? { required: true, content: { 'application/json': { schema: typeof e.body === 'string' ? { $ref: `#/components/schemas/${e.body}` } : objSchema(e.body.fields), example: e.bodyExample } } } : undefined,
      responses: Object.fromEntries(e.responses.map((r) => [String(r.status), { description: r.description || 'OK', content: { 'application/json': { schema: r.schema ? { $ref: `#/components/schemas/${r.schema}` } : r.status >= 400 ? { $ref: '#/components/schemas/Error' } : { type: 'object' }, example: r.status < 300 ? e.response : undefined } } }])),
    };
  }
  return {
    openapi: '3.1.0', info: { title: SPEC.info.title, version: SPEC.info.version, description: SPEC.info.description },
    servers: [{ url: '/v1' }], tags: [...new Set(ENDPOINTS.map((e) => e.group))].map((name) => ({ name })),
    components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'stk_live_…' } }, schemas: Object.fromEntries(Object.entries(SCHEMAS).map(([k, s]) => [k, objSchema(s.fields, s.description)])) },
    paths,
  };
}
