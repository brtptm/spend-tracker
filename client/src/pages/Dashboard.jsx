import { useState } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';
import { Link, useNavigate, useOutletContext } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { FiDownload, FiChevronRight } from 'react-icons/fi';
import { api } from '../lib/api.js';
import { useLocalAI, shouldUseLocal, onDevice, modelInfo } from '../lib/localAI.js';
import { inr, inrShort, PERIODS, plural } from '../lib/format.js';
import { Ticker, Bar, Spinner, ErrorNote, PeriodPicker, Skeleton, SourceTag, CategoryIcon, stagger, rise } from '../components/ui.jsx';
import { InsightCard, MiniLink, OfferCarousel } from '../components/cards.jsx';
import { MonthlyStack } from '../components/charts.jsx';
import Ring from '../components/three/Ring.jsx';
import BrandLogo from '../components/BrandLogo.jsx';

/** Spending change: up is amber (spending more), down is green (spending less). */
function Delta({ change, pill, suffix = '' }) {
  if (change == null) return null;
  const up = change > 0, flat = Math.abs(change) < 1;
  const color = flat ? 'var(--ink-3)' : up ? 'var(--warning)' : 'var(--positive)';
  // Past +100%, a multiplier reads faster than a big percentage ("2.3×", not "+128%").
  const mult = (1 + change / 100);
  const amount = change >= 100 ? `${mult >= 10 ? Math.round(mult) : mult.toFixed(1)}×` : `${Math.abs(change)}%`;
  const txt = `${flat ? '' : up ? '↑ ' : '↓ '}${amount}${suffix}`;
  return pill
    ? <span className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-medium" style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}>{txt}</span>
    : <span className="text-[11.5px] font-medium tabular-nums" style={{ color }}>{txt}</span>;
}


function Stat({ label, value, sub, tone }) {
  return (
    <motion.div variants={rise} className="panel p-5">
      <div className="eyebrow">{label}</div>
      <div className="num text-[1.75rem] mt-1.5 leading-none" style={tone ? { color: tone } : undefined}><Ticker value={value} /></div>
      {sub && <div className="text-xs text-ink-3 mt-2">{sub}</div>}
    </motion.div>
  );
}

function Briefing() {
  const local = useLocalAI();
  // "Prefer on-device": don't ask the server to call Claude at all — the summary never leaves the device.
  const preferLocal = local.enabled && local.prefer && !!local.cached[local.model];
  const q = useQuery({ queryKey: ['briefing', preferLocal], queryFn: () => api.insights(!preferLocal), staleTime: Infinity });
  const server = q.data?.briefing;
  const useLocal = !q.isLoading && !q.error && shouldUseLocal(server?.source);
  const lq = useQuery({ queryKey: ['briefing-local', local.model], queryFn: () => onDevice('briefing', undefined, local.model), enabled: useLocal, staleTime: Infinity, retry: false });
  const b = useLocal ? lq.data : server;
  const loading = q.isLoading || (useLocal && lq.isLoading);
  return (
    <section className="panel p-7" aria-labelledby="brief-h">
      <div className="flex items-center justify-between gap-3"><span className="eyebrow">Your briefing</span><span className="flex items-center gap-2">{b?.generatedAt && <span className="text-[11px] text-ink-3">Updated {formatDistanceToNowStrict(new Date(b.generatedAt), { addSuffix: true })}<span className="hidden sm:inline"> · refreshes when your payments change</span></span>}<SourceTag source={b?.source} model={b?.model} /></span></div>
      {loading ? (
        <div className="mt-4 grid gap-3">
          {useLocal && <p className="text-xs text-ink-3">{local.status === 'loading' ? `Loading ${modelInfo()?.name} on your device… ${Math.round(local.progress * 100)}%` : 'Writing on your device…'}</p>}
          <Skeleton h={28} className="w-2/3" /><Skeleton h={16} /><Skeleton h={16} className="w-5/6" />
        </div>
      ) : q.error ? <div className="mt-3"><ErrorNote error={q.error} onRetry={q.refetch} /></div> : b && (
        <>
          <h2 id="brief-h" className="text-[1.65rem] mt-2.5 max-w-[34ch]">{b.data.headline}</h2>
          <p className="text-ink-2 mt-2.5 max-w-[78ch]">{b.data.summary}</p>
          <ul className="mt-5 grid md:grid-cols-3 gap-px rounded-2xl overflow-hidden bg-[var(--line)]">
            {b.data.observations.slice(0, 3).map((o) => <li key={o} className="bg-surface p-4 text-sm text-ink-2 leading-relaxed">{o}</li>)}
          </ul>
        </>
      )}
    </section>
  );
}

export default function Dashboard() {
  const nav = useNavigate();
  const { firstName } = useOutletContext() || {};
  const [period, setPeriod] = useState('30d');
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['dashboard', period], queryFn: () => api.dashboard(period), placeholderData: (p) => p });
  if (isLoading && !data) return <Spinner label="Loading your overview" />;
  if (error && !data) return <ErrorNote error={error} onRetry={refetch} />;
  const s = data.summary;
  const prev = data.previous;
  const segments = s.byCategory.map((c) => ({ id: c.id, name: c.name, color: c.color, amount: c.amount }));
  const sv = data.savingsPotential;
  const mo = data.series.months;
  const thisMonth = mo.at(-1);
  const t = data.series.trend;

  return (
    <div className="grid grid-cols-1 gap-6">
      {/* Compact header: the numbers below are the hero, not a greeting. */}
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow truncate">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}{firstName ? ` · Hi ${firstName}` : ''}</div>
          <h1 className="text-[1.6rem] sm:text-[2.1rem] mt-0.5">Overview</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <PeriodPicker label="Period" value={period} onChange={setPeriod} options={PERIODS.filter(([k]) => ['30d', 'month', 'last_month', '3m', '6m'].includes(k))} />
          <button className="btn btn-ghost btn-sm !h-9 !px-3 sm:!px-3.5 border !border-[var(--line)]" aria-label="Download report" onClick={() => api.download('/export/pdf', 'spend-tracker-report.pdf')}><FiDownload /><span className="hidden sm:inline">Report</span></button>
        </div>
      </header>

      <section className="grid lg:grid-cols-2 gap-5 lg:h-[clamp(520px,calc(100dvh-296px),720px)]" aria-label="Where your money went">
        <div className="panel !p-0 relative isolate overflow-hidden min-h-[340px] sm:min-h-[440px]">
          <Ring segments={segments} onSelect={(id) => id && nav(`/category/${id}`)} className="-z-10">
            <div className="text-center">
              <div className="eyebrow">Spent · {s.label.toLowerCase()}</div>
              <div className="num text-[2.6rem] sm:text-[3.1rem] mt-1 leading-none"><Ticker value={s.totalSpending} /></div>
              {prev?.change != null && <div className="mt-3 flex justify-center"><Delta change={prev.change} pill suffix={` vs previous ${s.period === 'month' || s.period === 'last_month' ? 'period' : s.label.replace(/^Last /, '')}`} /></div>}
              <div className="text-[11px] text-ink-3 mt-2">{plural(s.transactionCount, 'payment')}</div>
            </div>
          </Ring>
        </div>
        <div className="panel p-6 sm:p-7 flex flex-col min-h-0">
          <div className="flex items-center justify-between"><h2 className="text-lg">Categories</h2><span className="text-xs text-ink-3">vs previous period</span></div>
          <ul className="mt-2 flex flex-col">
            {s.byCategory.filter((c) => c.amount > 0).map((c) => {
              const before = prev?.byCategory?.[c.id] || 0;
              const ch = before ? Math.round(((c.amount - before) / before) * 100) : null;
              return (
                <li key={c.id}>
                  <Link to={`/category/${c.id}`} className="flex items-center gap-3.5 py-2 -mx-2 px-2 rounded-xl hover:bg-surface-2 transition-colors group">
                    <CategoryIcon id={c.id} color={c.color} size={14} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-3"><span className="font-medium truncate flex-1">{c.name}</span>{ch != null ? <Delta change={ch} /> : <span className="text-[11px] text-ink-3">new</span>}<span className="num text-[15px] w-[5.2rem] text-right">{inr(c.amount)}</span></div>
                      <div className="mt-1.5"><Bar value={c.amount} max={s.byCategory[0].amount} color={c.color} height={4} label={`${c.name}: ${c.percentage}% of spend`} /></div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          {s.byMerchant?.length > 0 && (
            <div className="mt-auto pt-5 border-t border-line">
              <div className="flex items-center justify-between"><span className="eyebrow">Where it went</span><MiniLink to="/transactions">All payments</MiniLink></div>
              <ul className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                {s.byMerchant.slice(0, 4).map((m) => (
                  <li key={m.id || m.name}>
                    <Link to={`/merchant/${m.id || encodeURIComponent(m.name)}`} className="flex items-center gap-2.5 sm:flex-col sm:items-start sm:gap-2 rounded-xl p-2.5 -m-0.5 hover:bg-surface-2 transition-colors">
                      <BrandLogo id={m.id} name={m.name} category={m.category} size={30} />
                      <div className="min-w-0 w-full"><div className="text-[12px] text-ink-2 truncate">{m.name}</div><div className="num text-[14px]">{inrShort(m.amount)}</div></div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <motion.section className="grid grid-cols-2 lg:grid-cols-4 gap-4" variants={stagger} initial="hidden" animate="show">
        <Stat label="Average per day" value={s.averageDailySpend} sub={`${inr(s.averageTicket)} per payment`} />
        <Stat label="This month so far" value={thisMonth.total} sub={thisMonth.projected ? `On pace for ${inrShort(thisMonth.projected)}` : undefined} />
        <Stat label="You could keep" value={sv.monthly} tone="var(--positive)" sub={`${inrShort(sv.annual)} a year`} />
        <Stat label="Subscriptions" value={data.subscriptions.monthly} sub={`${plural(data.subscriptions.count, 'active plan')} a month`} />
      </motion.section>

      {data.carousel?.length > 0 && (
        <section className="grid gap-3" aria-label="Offers">
          <div className="flex items-baseline justify-between px-1"><h2 className="text-lg">For you</h2><MiniLink to="/offers">All offers</MiniLink></div>
          <OfferCarousel offers={data.carousel} />
        </section>
      )}

      <Briefing />

      <section className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-5">
        <div className="panel p-6 sm:p-7">
          <div className="flex items-center justify-between">
            <div><h2 className="text-lg">Last 6 months</h2><p className="text-sm text-ink-3 mt-0.5">{t.direction === 'stable' ? 'Stable' : `${t.direction === 'rising' ? 'Up' : 'Down'} ${Math.abs(t.change)}% over 3 months`}</p></div>
            <MiniLink to="/trends">Trends</MiniLink>
          </div>
          <div className="mt-5"><MonthlyStack months={mo} height={230} /></div>
        </div>
        <div className="panel p-6 sm:p-7">
          <div className="flex items-center justify-between"><h2 className="text-lg">Budgets</h2><MiniLink to="/budget">{data.budget.items.length ? 'Manage' : 'Set up'}</MiniLink></div>
          {data.budget.items.length ? (
            <ul className="mt-5 grid gap-5">
              {data.budget.items.slice(0, 4).map((b) => (
                <li key={b.category}>
                  <div className="flex justify-between text-sm mb-2"><span>{b.name}</span><span className="text-ink-3"><span className="text-ink num">{inrShort(b.spent)}</span> of {inrShort(b.budget)}</span></div>
                  <Bar value={b.spent} max={b.budget} marker={b.expectedByToday} height={4} color={b.status === 'over' ? 'var(--negative)' : b.status === 'at_risk' ? 'var(--warning)' : 'var(--positive)'} label={`${b.name} budget`} />
                </li>
              ))}
            </ul>
          ) : <p className="text-ink-2 mt-4 text-sm">Set monthly limits and we’ll tell you your daily pace.</p>}
        </div>
      </section>

      <section className="panel p-6 sm:p-7" aria-label="Insights">
        <div className="flex items-center justify-between"><h2 className="text-lg">Insights</h2><MiniLink to="/alerts">All alerts</MiniLink></div>
        <div className="mt-4 -mx-6 px-6 sm:mx-0 sm:px-0 flex sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-3 overflow-x-auto sm:overflow-visible snap-x snap-mandatory scroll-px-6 no-scrollbar">
          {data.insights.map((i, k) => <div key={i.id} className={`shrink-0 w-[84%] sm:w-auto snap-start ${k === 0 ? 'sm:col-span-2' : ''}`}><InsightCard insight={i} featured={k === 0} /></div>)}
        </div>
      </section>

      <section className="panel p-6 sm:p-7" aria-label="Ways to keep more">
        <div className="flex items-center justify-between"><h2 className="text-lg">Ways to keep more</h2><MiniLink to="/recommendations">{inr(sv.monthly)}/mo<span className="hidden sm:inline">&nbsp;in total</span></MiniLink></div>
        <ul className="mt-4 -mx-6 px-6 sm:mx-0 sm:px-0 flex sm:grid sm:grid-cols-2 lg:grid-cols-3 gap-3 overflow-x-auto sm:overflow-visible snap-x snap-mandatory scroll-px-6 no-scrollbar">
          {data.recommendations.map((r) => (
            <li key={r.id} className="shrink-0 w-[78%] sm:w-auto snap-start">
              <Link to="/recommendations" className="group relative h-full flex flex-col overflow-hidden rounded-2xl border border-line bg-fg/[.025] p-5 transition-colors hover:bg-fg/[.045] hover:border-fg/[.12]">
                <div className="pointer-events-none absolute -top-16 -right-16 w-44 h-44 rounded-full blur-3xl" style={{ background: 'var(--positive)', opacity: 'var(--tint)' }} aria-hidden="true" />
                <div className="relative flex items-center gap-2.5"><CategoryIcon id={r.category} size={12} /><span className="text-[11px] text-ink-3">{r.difficulty} · {r.timeToImplement}</span><FiChevronRight className="ml-auto text-ink-3 opacity-0 group-hover:opacity-100 transition-opacity" /></div>
                <div className="relative mt-4 flex items-baseline gap-1.5"><span className="num text-[2rem] leading-none tracking-[-0.03em] text-positive">{inr(r.savingsMonthly)}</span><span className="text-xs text-ink-3">{r.oneTime ? 'one-time' : 'a month'}</span></div>
                <div className="relative font-medium leading-snug mt-3">{r.title}</div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
