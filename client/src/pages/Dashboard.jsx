import { useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { FiDownload, FiChevronRight } from 'react-icons/fi';
import { api } from '../lib/api.js';
import { inr, inrShort, PERIODS, plural } from '../lib/format.js';
import { Ticker, Bar, Spinner, ErrorNote, PeriodPicker, Skeleton, SourceTag, CategoryIcon, stagger, rise } from '../components/ui.jsx';
import { InsightCard, MiniLink, OfferCarousel } from '../components/cards.jsx';
import { MonthlyStack } from '../components/charts.jsx';
import Ring from '../components/three/Ring.jsx';

function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }

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
  const q = useQuery({ queryKey: ['briefing'], queryFn: () => api.insights(true), staleTime: 10 * 60_000 });
  const b = q.data?.briefing;
  return (
    <section className="panel p-7" aria-labelledby="brief-h">
      <div className="flex items-center justify-between gap-3"><span className="eyebrow">Your briefing</span><SourceTag source={b?.source} /></div>
      {q.isLoading ? (
        <div className="mt-4 grid gap-3"><Skeleton h={28} className="w-2/3" /><Skeleton h={16} /><Skeleton h={16} className="w-5/6" /></div>
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
  const segments = s.byCategory.map((c) => ({ id: c.id, name: c.name, color: c.color, amount: c.amount }));
  const sv = data.savingsPotential;
  const mo = data.series.months;
  const thisMonth = mo.at(-1);
  const t = data.series.trend;

  return (
    <div className="grid grid-cols-1 gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4 pt-1">
        <div>
          <div className="eyebrow">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <h1 className="text-[2.2rem] sm:text-[2.75rem] mt-1">{greeting()}{firstName ? `, ${firstName}` : ''}.</h1>
        </div>
        <div className="flex items-center gap-2 min-w-0 max-w-full">
          <PeriodPicker label="Period" value={period} onChange={setPeriod} options={PERIODS.filter(([k]) => ['30d', 'month', 'last_month', '3m', '6m'].includes(k))} />
          <button className="btn btn-ghost btn-sm !h-9 !px-3 sm:!px-4" aria-label="Download report" onClick={() => api.download('/export/pdf', 'spend-tracker-report.pdf')}><FiDownload /><span className="hidden sm:inline">Report</span></button>
        </div>
      </header>

      <section className="panel !p-0 overflow-hidden grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:h-[clamp(500px,calc(100dvh-296px),780px)]" aria-label="Where your money went">
        <div className="relative isolate min-h-[350px] sm:min-h-[440px] border-b lg:border-b-0 lg:border-r border-line">
          <Ring segments={segments} onSelect={(id) => id && nav(`/category/${id}`)} className="-z-10">
            <div className="text-center">
              <div className="eyebrow">Spent · {s.label.toLowerCase()}</div>
              <div className="num text-[2.6rem] sm:text-[3rem] mt-1 leading-none"><Ticker value={s.totalSpending} /></div>
              <div className="text-xs text-ink-3 mt-2">{plural(s.transactionCount, 'payment')}</div>
            </div>
          </Ring>
        </div>
        <div className="p-6 sm:p-7 flex flex-col min-h-0">
          <div className="flex items-center justify-between"><h2 className="text-lg">Categories</h2><span className="text-xs text-ink-3">Tap to explore</span></div>
          <ul className="mt-3 lg:flex-1 lg:min-h-0 flex flex-col lg:justify-around">
            {s.byCategory.map((c) => (
              <li key={c.id}>
                <Link to={`/category/${c.id}`} className="flex items-center gap-3.5 py-2.5 lg:py-2 -mx-2 px-2 rounded-xl hover:bg-surface-2/70 transition-colors group">
                  <CategoryIcon id={c.id} color={c.color} size={15} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3"><span className="font-medium truncate">{c.name}</span><span className="num text-[15px]">{inr(c.amount)}</span></div>
                    <div className="mt-1.5 flex items-center gap-3"><div className="flex-1"><Bar value={c.percentage} max={s.byCategory[0].percentage} color={c.color} height={3} label={`${c.name} share`} /></div><span className="text-[11px] text-ink-3 w-8 text-right">{c.percentage}%</span></div>
                  </div>
                  <FiChevronRight className="text-ink-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              </li>
            ))}
          </ul>
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

      <section className="grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-5">
        <div className="panel p-6 sm:p-7">
          <div className="flex items-center justify-between"><h2 className="text-lg">Insights</h2><MiniLink to="/alerts">All alerts</MiniLink></div>
          <div className="mt-1 divide-y divide-line">{data.insights.map((i) => <InsightCard key={i.id} insight={i} />)}</div>
        </div>
        <div className="panel p-6 sm:p-7">
          <div className="flex items-center justify-between"><h2 className="text-lg">Ways to keep more</h2><MiniLink to="/recommendations">{inr(sv.monthly)}/mo</MiniLink></div>
          <ul className="mt-2 divide-y divide-line">
            {data.recommendations.map((r) => (
              <li key={r.id}>
                <Link to="/recommendations" className="flex items-center gap-3.5 py-4 -mx-2 px-2 rounded-xl hover:bg-surface-2/70 transition-colors">
                  <CategoryIcon id={r.category} size={15} />
                  <div className="min-w-0 flex-1"><div className="font-medium leading-snug">{r.title}</div><div className="text-xs text-ink-3 mt-0.5">{r.difficulty} · {r.timeToImplement}</div></div>
                  <div className="text-right"><div className="num text-positive">{inr(r.savingsMonthly)}</div><div className="text-[11px] text-ink-3">a month</div></div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
