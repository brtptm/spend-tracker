import { Router } from 'express';
import { requireAuth } from '../lib/auth.js';
import { context } from '../lib/context.js';
import { loadTxns, requireData } from '../lib/store.js';
import { summarize, monthlySeries } from '../engine/analytics.js';
import { CATEGORY } from '../data/catalog.js';

const r = Router();
r.use(requireAuth);
const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

r.get('/export/csv', (req, res) => {
  requireData(req.user.id);
  const months = [3, 6, 12].includes(Number(req.query.months)) ? Number(req.query.months) : 12;
  const rows = loadTxns(req.user.id, { months });
  const head = 'Date,Merchant,Amount,Category,Subcategory,Payment method,Status,Description';
  const body = rows.map((t) => [t.ts.toISOString(), t.merchant, t.amount, CATEGORY[t.category]?.name, CATEGORY[t.category]?.subs[t.sub], t.paymentMethod, t.status, t.description].map(esc).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="spend-tracker-${months}m.csv"`);
  res.send([head, ...body].join('\n'));
});

function report(ctx, kind) {
  const now = new Date();
  const start = kind === 'annual' ? new Date(now.getFullYear() - 1, now.getMonth(), 1) : new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 1);
  const R = { start, end: new Date(end - 1), days: (end - start) / 86400000, monthsEq: (end - start) / 86400000 / 30.44, label: kind === 'annual' ? 'Last 12 months' : start.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }), period: kind };
  const s = summarize(ctx.txns, R);
  const prevStart = new Date(start.getFullYear(), start.getMonth() - (kind === 'annual' ? 12 : 1), 1);
  const prev = summarize(ctx.txns, { ...R, start: prevStart, end: new Date(start - 1) });
  return {
    kind, title: kind === 'annual' ? 'Annual spending report' : `Monthly report — ${R.label}`, period: R.label, user: ctx.user.name,
    total: s.totalSpending, transactions: s.transactionCount, avgDaily: s.averageDailySpend, previousTotal: prev.totalSpending,
    change: prev.totalSpending ? Math.round(((s.totalSpending - prev.totalSpending) / prev.totalSpending) * 100) : null,
    byCategory: s.byCategory, topMerchants: s.byMerchant.slice(0, 8), monthly: kind === 'annual' ? monthlySeries(ctx.txns, 12).months : undefined,
    savingsPotential: ctx.recs.filter((x) => !x.oneTime && x.status !== 'declined').reduce((a, x) => a + x.savingsMonthly, 0),
    highlights: ctx.insights.slice(0, 4).map((i) => i.title), subscriptions: ctx.A.subs.list,
  };
}
r.get('/report/monthly', (req, res) => res.json(report(context(req.user), 'monthly')));
r.get('/report/annual', (req, res) => res.json(report(context(req.user), 'annual')));

/** Minimal text PDF (built-in Helvetica, no dependencies). */
function pdf(lines) {
  const enc = (s) => s.replace(/₹/g, 'Rs.').replace(/[–—]/g, '-').replace(/[^\x20-\x7e]/g, '').replace(/([\\()])/g, '\\$1');
  const pages = []; for (let i = 0; i < lines.length; i += 46) pages.push(lines.slice(i, i + 46));
  const objs = [];
  const add = (s) => { objs.push(s); return objs.length; };
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const bold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const pagesId = objs.length + 1; objs.push(null);
  const kids = [];
  for (const pg of pages) {
    let y = 800; let content = 'BT\n';
    for (const l of pg) { const isH = l.startsWith('# '); content += `/${isH ? 'F2' : 'F1'} ${isH ? 15 : 10.5} Tf 1 0 0 1 50 ${y} Tm (${enc(isH ? l.slice(2) : l)}) Tj\n`; y -= isH ? 24 : 16; }
    content += 'ET';
    const c = add(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R /F2 ${bold} 0 R >> >> /Contents ${c} 0 R >>`));
  }
  objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

r.get('/export/pdf', (req, res) => {
  const ctx = context(req.user);
  const kind = req.query.kind === 'annual' ? 'annual' : 'monthly';
  const rep = report(ctx, kind);
  const f = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
  const lines = [
    `# Spend Tracker — ${rep.title}`, `For ${rep.user} · generated ${new Date().toLocaleDateString('en-IN')}`, '',
    `Total spent: ${f(rep.total)} across ${rep.transactions} payments (avg ${f(rep.avgDaily)}/day)`,
    rep.change == null ? '' : `Change vs previous period: ${rep.change > 0 ? '+' : ''}${rep.change}%`,
    `Savings potential identified: ${f(rep.savingsPotential)}/month`, '',
    '# Spending by category', ...rep.byCategory.map((c) => `${c.name.padEnd(24)} ${f(c.amount).padStart(12)}   ${c.percentage}%   ${c.count} payments`), '',
    '# Top merchants', ...rep.topMerchants.map((m) => `${m.name.padEnd(28)} ${f(m.amount).padStart(12)}   ${m.count} payments`), '',
    '# Highlights', ...rep.highlights.map((h) => `- ${h}`), '',
    '# Subscriptions', ...rep.subscriptions.map((s) => `${s.merchant.padEnd(28)} ${f(s.monthly)}/month`),
  ].filter((l) => l !== null);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="spend-tracker-${kind}-report.pdf"`);
  res.send(pdf(lines));
});

export default r;
