import { useState } from 'react';
import { Link } from 'react-router';
import { motion } from 'motion/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FiChevronRight, FiCheck, FiX, FiMinus } from 'react-icons/fi';
import { portal } from '../../lib/portalApi.js';
import { Skeleton, ErrorNote, Segmented } from '../../components/ui.jsx';
import { PageTitle, Kpi, OutcomeChart, DeliveriesTable, DeliveryDrawer, StatusChip, Chip, CopyButton, OUTCOME, n } from './common.jsx';

const STEPS = ['Validate', 'Normalise', 'Identify', 'Dedupe', 'Filter', 'Categorise'];
// Where a payment leaves the pipeline, by outcome.
const STOP = { rejected: 0, duplicate: 3, updated: 3, filtered: 4, accepted: 5 };

const now = () => new Date().toISOString();
const SAMPLES = {
  swiggy: { label: 'Swiggy order', make: () => ({ id: `TEST-${Date.now()}`, phone: '9876500001', amount: 249, timestamp: now(), status: 'success', payer_vpa: 'rohan.v@paytm', payee_vpa: 'swiggy.payu@hdfcbank', payee_name: 'PAYTM*SWIGGY LIMITED 4412093', mcc: '5814' }) },
  mcc: { label: 'Local shop (MCC)', make: () => ({ id: `TEST-${Date.now()}`, phone: '9876500001', amount: 1890, timestamp: now(), payee_name: 'SRI SAI ELECTRONICS & MOBILES 77812', payee_vpa: 'srisai.mobiles@okaxis', mcc: '5732' }) },
  credit: { label: 'Money received', make: () => ({ id: `TEST-${Date.now()}`, phone: '9876500001', amount: 5000, timestamp: now(), direction: 'credit', payee_vpa: 'rohan.v@paytm' }) },
  invalid: { label: 'Bad phone', make: () => ({ id: `TEST-${Date.now()}`, phone: '12345', amount: 99, timestamp: now(), payee_vpa: 'shop@ybl' }) },
};

function TestEvent() {
  const qc = useQueryClient();
  const [sample, setSample] = useState('swiggy');
  const [state, setState] = useState({ phase: 'idle' }); // idle | running | done | error
  async function send() {
    const event = SAMPLES[sample].make();
    setState({ phase: 'running', event, step: 0 });
    const tick = setInterval(() => setState((s) => (s.phase === 'running' ? { ...s, step: Math.min(s.step + 1, STEPS.length - 1) } : s)), 140);
    try {
      const [res] = await Promise.all([portal.testEvent(event), new Promise((r) => setTimeout(r, 650))]);
      clearInterval(tick);
      setState({ phase: 'done', event: res.event, result: res.result });
      qc.invalidateQueries({ queryKey: ['portal-stats'] }); qc.invalidateQueries({ queryKey: ['portal-logs'] });
    } catch (error) { clearInterval(tick); setState({ phase: 'error', error }); }
  }
  const r = state.result;
  const stop = state.phase === 'done' ? STOP[r.status] ?? 5 : null;
  const stepState = (i) => {
    if (state.phase === 'running') return i < state.step ? 'done' : i === state.step ? 'active' : 'idle';
    if (state.phase !== 'done') return 'idle';
    if (i < stop) return 'done';
    if (i === stop) return r.status === 'accepted' ? 'done' : 'stop';
    return 'skip';
  };
  return (
    <section className="panel p-6 sm:p-7 flex flex-col min-w-0" aria-label="Send a test event">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-lg">Send a test event</h2><p className="text-sm text-ink-3 mt-0.5">Runs a sample payment through the real pipeline.</p></div>
      </div>
      <div className="mt-4 max-w-full overflow-x-auto no-scrollbar"><Segmented label="Sample" value={sample} onChange={(v) => { setSample(v); setState({ phase: 'idle' }); }} options={Object.entries(SAMPLES).map(([k, s]) => [k, s.label])} /></div>
      <ol className="mt-5 grid grid-cols-3 sm:grid-cols-6 gap-2" aria-label="Pipeline">
        {STEPS.map((s, i) => {
          const st = stepState(i);
          const color = st === 'done' ? 'var(--positive)' : st === 'stop' ? OUTCOME[r?.status]?.color : st === 'active' ? 'var(--ink)' : 'var(--ink-3)';
          return (
            <li key={s} className="rounded-xl border px-2.5 py-2 transition-colors" style={{ borderColor: st === 'idle' || st === 'skip' ? 'var(--line)' : `color-mix(in srgb, ${color} 45%, transparent)`, opacity: st === 'skip' ? 0.4 : 1 }}>
              <div className="flex items-center gap-1.5 text-[11px]" style={{ color }}>
                {st === 'done' ? <FiCheck /> : st === 'stop' ? (r.status === 'rejected' ? <FiX /> : <FiMinus />) : st === 'active' ? <motion.span className="w-2 h-2 rounded-full bg-ink" animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 0.8 }} /> : <span className="w-2 h-2 rounded-full bg-surface-3" />}
                <span className="tabular-nums">{i + 1}</span>
              </div>
              <div className="text-[12px] font-medium mt-1 truncate">{s}</div>
            </li>
          );
        })}
      </ol>
      <div className="mt-5 min-h-[92px]">
        {state.phase === 'error' && <ErrorNote error={state.error} onRetry={send} />}
        {state.phase === 'done' && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl bg-surface-2 p-4">
            <div className="flex flex-wrap items-center gap-2"><StatusChip status={r.status} />{r.code && <Chip mono dot={false} color={OUTCOME[r.status]?.color}>{r.code}</Chip>}<span className="font-mono text-[12px] text-ink-3 truncate">{r.id}</span></div>
            {r.transaction?.merchant ? (
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-[12.5px]">
                <div><dt className="text-ink-3">Merchant</dt><dd className="font-medium truncate">{r.transaction.merchant}</dd></div>
                <div><dt className="text-ink-3">Category</dt><dd className="font-mono truncate">{r.transaction.category}/{r.transaction.subcategory}</dd></div>
                <div><dt className="text-ink-3">Confidence</dt><dd>{Math.round(r.transaction.confidence * 100)}%</dd></div>
                <div><dt className="text-ink-3">Decided by</dt><dd className="font-mono">{r.transaction.categorised_by}</dd></div>
              </dl>
            ) : <p className="text-[13px] text-ink-2 mt-2">{r.message}</p>}
            {state.event?.payee_name && <p className="text-[12px] text-ink-3 mt-3 truncate">Input payee: <span className="font-mono">{state.event.payee_name}</span></p>}
          </motion.div>
        )}
        {state.phase === 'idle' && <p className="text-[13px] text-ink-3">Pick a sample and send it — you’ll see where it leaves the pipeline and how it was categorised.</p>}
      </div>
      <div className="mt-auto pt-4"><button className="btn btn-primary" onClick={send} disabled={state.phase === 'running'}>{state.phase === 'running' ? 'Processing…' : 'Send test event'}</button></div>
    </section>
  );
}

function QuickStart() {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const curl = `curl ${origin}/v1/events \\
  -H "Authorization: Bearer $STK_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"id":"PTM-1","phone":"9876500001","amount":349,
       "timestamp":"${new Date().toISOString().slice(0, 19)}+05:30",
       "payee_vpa":"swiggy.payu@hdfcbank"}'`;
  return (
    <section className="panel p-6 sm:p-7 flex flex-col min-w-0" aria-label="Quick start">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-lg">Quick start</h2><p className="text-sm text-ink-3 mt-0.5">Point your payment webhook at <span className="font-mono text-ink-2">/v1/events</span>.</p></div>
        <CopyButton text={curl} />
      </div>
      <pre className="mt-4 rounded-2xl bg-[var(--bg)] border border-line p-4 text-[12px] leading-relaxed font-mono overflow-x-auto text-ink-2"><code>{curl}</code></pre>
      <div className="mt-auto pt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <Link to="/portal/keys" className="inline-flex items-center gap-0.5 font-medium">Create a key <FiChevronRight /></Link>
        <a href="/docs#quickstart" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium">Read the guide <FiChevronRight /></a>
      </div>
    </section>
  );
}

export default function Overview() {
  const [open, setOpen] = useState(null);
  const q = useQuery({ queryKey: ['portal-stats'], queryFn: portal.stats, refetchInterval: 15_000 });
  const s = q.data;
  const rate = (x) => (x?.received ? `${Math.round((x.accepted / x.received) * 100)}%` : '—');
  return (
    <>
      <PageTitle title="Overview" sub="Ingestion health for the last 24 hours and 14 days. Refreshes every 15 seconds." />
      {q.data?.includes_simulated && <p className="-mt-3 mb-1 text-[12.5px] text-ink-3">Includes a simulated 14-day Paytm backfill (deliveries marked <span className="font-mono">simulated</span>) — real payments run through the same pipeline.</p>}
      {q.isLoading ? (
        <div className="grid gap-4"><div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} h={104} className="!rounded-[22px]" />)}</div><Skeleton h={320} className="!rounded-[22px]" /></div>
      ) : q.error ? <ErrorNote error={q.error} onRetry={q.refetch} /> : (
        <div className="grid grid-cols-1 gap-5 min-w-0">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi label="Received · 24h" value={n(s.last24h.received)} sub={`${n(s.last7d.received)} in 7 days · ${n(s.last24h.requests)} requests`} />
            <Kpi label="Accepted · 24h" value={rate(s.last24h)} sub={`7 days: ${rate(s.last7d)}`} tone={s.last24h.received ? 'var(--positive)' : undefined} />
            <Kpi label="Filtered · 24h" value={n(s.last24h.filtered)} sub={`Not spending · ${n(s.last7d.filtered)} in 7 days`} tone={s.last24h.filtered ? 'var(--warning)' : undefined} />
            <Kpi label="Rejected · 24h" value={n(s.last24h.rejected)} sub={`Invalid input · ${n(s.last7d.rejected)} in 7 days`} tone={s.last24h.rejected ? 'var(--negative)' : undefined} />
            <Kpi label="Avg processing" value={`${Math.round(s.last24h.avg_ms || s.last7d.avg_ms || 0)} ms`} sub="Per request, server-side" />
            <Kpi label="Users" value={n(s.users)} sub="Identified by phone" />
            <Kpi label="Stored transactions" value={n(s.transactions)} sub="Sent by you" />
            <Kpi label="Active keys" value={n(s.keys)} sub={<Link to="/portal/keys" className="hover:text-ink">Manage keys →</Link>} />
          </div>

          <section className="panel p-6 sm:p-7 min-w-0" aria-label="Last 14 days">
            <div className="flex items-start justify-between gap-3">
              <div><h2 className="text-lg">Last 14 days</h2><p className="text-sm text-ink-3 mt-0.5">Payments by outcome, per day.</p></div>
              <Link to="/portal/deliveries" className="inline-flex items-center gap-0.5 text-sm font-medium">Deliveries <FiChevronRight /></Link>
            </div>
            <div className="mt-5"><OutcomeChart series={s.series} /></div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 min-w-0">
            <TestEvent />
            <QuickStart />
          </div>

          <section className="panel p-6 sm:p-7 min-w-0" aria-label="Recent deliveries">
            <div className="flex items-center justify-between gap-3 mb-3"><h2 className="text-lg">Recent deliveries</h2><Link to="/portal/deliveries" className="inline-flex items-center gap-0.5 text-sm font-medium">View all <FiChevronRight /></Link></div>
            <DeliveriesTable rows={s.recent} onOpen={setOpen} compact />
          </section>
        </div>
      )}
      <DeliveryDrawer id={open} onClose={() => setOpen(null)} />
    </>
  );
}
