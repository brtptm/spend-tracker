import { useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { FiDownload, FiArrowUpRight } from 'react-icons/fi';
import { PiSparkleDuotone, PiLightbulbDuotone } from 'react-icons/pi';
import { api } from '../lib/api.js';
import { inr, inrShort, PERIODS, plural } from '../lib/format.js';
import { Ticker, Bar, Spinner, ErrorNote, Segmented, Skeleton, SourceTag, CategoryIcon, stagger, rise } from '../components/ui.jsx';
import { InsightCard, OfferCard, MiniLink } from '../components/cards.jsx';
import { Donut, MonthlyStack } from '../components/charts.jsx';
import Universe from '../components/three/Universe.jsx';

function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }

function Stat({ label, value, format, sub, accent }) {
  return (
    <motion.div variants={rise} className="panel p-5">
      <div className="text-sm text-ink-3">{label}</div>
      <div className="num text-[1.9rem] mt-1 leading-none" style={accent ? { color: accent } : undefined}><Ticker value={value} format={format} /></div>
      {sub && <div className="text-xs text-ink-3 mt-2">{sub}</div>}
    </motion.div>
  );
}

function Briefing() {
  const q = useQuery({ queryKey: ['briefing'], queryFn: () => api.insights(true), staleTime: 10 * 60_000 });
  const b = q.data?.briefing;
  return (
    <section className="panel p-6 sm:p-7 relative overflow-hidden" aria-labelledby="brief-h" style={{ background: 'linear-gradient(120deg, color-mix(in srgb, var(--lime) 8%, var(--surface)), var(--surface) 55%)' }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-lime-text"><PiSparkleDuotone size={18} /> Your briefing</div>
        <SourceTag source={b?.source} />
      </div>
      {q.isLoading ? (
        <div className="mt-4 grid gap-3"><Skeleton h={30} className="w-3/4" /><Skeleton h={18} /><Skeleton h={18} className="w-5/6" /><div className="text-xs text-ink-3">Claude is reading your last 90 days…</div></div>
      ) : q.error ? <div className="mt-3"><ErrorNote error={q.error} onRetry={q.refetch} /></div> : b && (
        <>
          <h2 id="brief-h" className="text-2xl sm:text-[1.75rem] mt-3 max-w-[30ch]">{b.data.headline}</h2>
          <p className="text-ink-2 mt-2 max-w-[75ch]">{b.data.summary}</p>
          <ul className="mt-4 grid md:grid-cols-3 gap-3">
            {b.data.observations.slice(0, 3).map((o) => <li key={o} className="panel-quiet p-3.5 text-sm">{o}</li>)}
          </ul>
          {b.data.personality && <p className="text-sm text-ink-3 mt-4">{b.data.personality}</p>}
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
  if (isLoading && !data) return <Spinner label="Mapping your money" />;
  if (error && !data) return <ErrorNote error={error} onRetry={refetch} />;
  const s = data.summary;
  const planets = s.byCategory.map((c) => ({ id: c.id, name: c.name, color: c.color, amount: c.amount }));
  const sv = data.savingsPotential;
  const mo = data.series.months;
  const thisMonth = mo.at(-1);

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-ink-3">{greeting()}{firstName ? `, ${firstName}` : ''} · {data.profile.spenderLabel}</p>
          <h1 className="text-[2.1rem] sm:text-[2.6rem] mt-1">Your money, {s.label.toLowerCase()}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Period" value={period} onChange={setPeriod} options={PERIODS.filter(([k]) => ['30d', 'month', 'last_month', '3m', '6m'].includes(k))} />
          <button className="btn btn-ghost btn-sm" onClick={() => api.download('/export/pdf', 'spend-tracker-report.pdf')}><FiDownload /> Report</button>
        </div>
      </header>

      <section className="grid xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-5">
        <div className="panel relative isolate overflow-hidden min-h-[420px] sm:min-h-[460px]" aria-label="Spend universe">
          <Universe planets={planets} total={s.totalSpending} onSelect={(id) => id && nav(`/category/${id}`)} className="-z-10" />
          <div className="relative p-6 pointer-events-none">
            <div className="text-sm text-ink-3">Total spent</div>
            <div className="num text-5xl sm:text-6xl mt-1"><Ticker value={s.totalSpending} /></div>
            <div className="text-sm text-ink-2 mt-2">{plural(s.transactionCount, 'payment')} · {s.categoriesCount} categories{s.failedCount ? ` · ${s.failedCount} failed` : ''}</div>
          </div>
          <div className="absolute bottom-4 left-6 right-6 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3 pointer-events-none">
            <span>Each planet is a category — tap one to dive in.</span><span>Light = money flowing out.</span>
          </div>
        </div>
        <motion.div className="grid grid-cols-2 gap-4 content-start" variants={stagger} initial="hidden" animate="show">
          <Stat label="Avg per day" value={s.averageDailySpend} sub={`Avg ticket ${inr(s.averageTicket)}`} />
          <Stat label="This month so far" value={thisMonth.total} sub={thisMonth.projected ? `On pace for ${inrShort(thisMonth.projected)}` : undefined} />
          <Stat label="You could keep" value={sv.monthly} accent="var(--lime-text)" sub={`${inrShort(sv.annual)} a year`} />
          <Stat label="Subscriptions" value={data.subscriptions.monthly} sub={`${plural(data.subscriptions.count, 'active plan')}`} />
          <motion.div variants={rise} className="col-span-2 panel p-5">
            <div className="flex items-center justify-between text-sm"><span className="text-ink-3">Spending trend</span><span className="font-semibold" style={{ color: data.series.trend.direction === 'rising' ? 'var(--coral)' : data.series.trend.direction === 'falling' ? 'var(--lime-text)' : 'var(--ink-2)' }}>{data.series.trend.direction === 'stable' ? 'Stable' : `${data.series.trend.direction === 'rising' ? 'Rising' : 'Falling'} ${Math.abs(data.series.trend.change)}%`}</span></div>
            <div className="mt-3 flex items-end gap-1.5 h-16" aria-label="Last 6 months">
              {mo.map((m) => <div key={m.month} className="flex-1 rounded-t-md relative group" title={`${m.label}: ${inr(m.total)}`} style={{ height: `${Math.max(6, (m.total / Math.max(...mo.map((x) => x.total))) * 100)}%`, background: m.partial ? 'repeating-linear-gradient(45deg, var(--cyan) 0 4px, transparent 4px 7px)' : 'var(--cyan)', opacity: m.partial ? 0.8 : 0.85 }} />)}
            </div>
            <div className="flex gap-1.5 mt-1.5">{mo.map((m) => <div key={m.month} className="flex-1 text-center text-[10px] text-ink-3">{m.label}</div>)}</div>
          </motion.div>
          {data.budget.items.length > 0 && (
            <motion.div variants={rise} className="col-span-2 panel p-5">
              <div className="flex items-center justify-between text-sm"><span className="text-ink-3">Budgets this month</span><MiniLink to="/budget">Manage</MiniLink></div>
              <div className="mt-3 grid gap-3">
                {data.budget.items.slice(0, 3).map((b) => (
                  <div key={b.category}>
                    <div className="flex justify-between text-sm mb-1"><span>{b.name}</span><span className="text-ink-3"><span className="num text-ink">{inrShort(b.spent)}</span> / {inrShort(b.budget)}</span></div>
                    <Bar value={b.spent} max={b.budget} marker={b.expectedByToday} color={b.status === 'over' ? 'var(--coral)' : b.status === 'at_risk' ? 'var(--amber)' : 'var(--lime)'} label={`${b.name} budget`} />
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </motion.div>
      </section>

      <Briefing />

      <section className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-5">
        <div className="panel p-6">
          <div className="flex items-center justify-between"><h2 className="text-xl">Where it went</h2><span className="text-xs text-ink-3">{s.label}</span></div>
          <div className="mt-5"><Donut data={s.byCategory} total={s.totalSpending} onSelect={(id) => nav(`/category/${id}`)} /></div>
        </div>
        <div className="panel p-6">
          <div className="flex items-center justify-between"><h2 className="text-xl">Last 6 months</h2><MiniLink to="/trends">All trends</MiniLink></div>
          <div className="mt-5"><MonthlyStack months={mo} height={240} /></div>
        </div>
      </section>

      <section className="grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-5">
        <div className="panel p-6">
          <div className="flex items-center justify-between"><h2 className="text-xl">Alerts & insights</h2><MiniLink to="/alerts">All alerts</MiniLink></div>
          <div className="mt-1 divide-y divide-line">{data.insights.map((i) => <InsightCard key={i.id} insight={i} />)}</div>
        </div>
        <div className="grid gap-4 content-start">
          <div className="flex items-center justify-between"><h2 className="text-xl">Picked for how you spend</h2><MiniLink to="/offers">More</MiniLink></div>
          {data.offers.slice(0, 2).map((o) => <OfferCard key={o.adId} offer={o} />)}
          {!data.offers.length && <p className="text-ink-3 text-sm">No offers right now{data.user.adPersonalization ? '' : ' — personalised offers are off in Settings'}.</p>}
        </div>
      </section>

      <section className="panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl flex items-center gap-2"><PiLightbulbDuotone className="text-lime-text" /> Ways to keep more</h2>
          <MiniLink to="/recommendations">See all · {inr(sv.monthly)}/month</MiniLink>
        </div>
        <div className="mt-4 grid md:grid-cols-3 gap-4">
          {data.recommendations.map((r) => (
            <Link key={r.id} to="/recommendations" className="panel-quiet p-5 hover:bg-surface-3 transition-colors group">
              <div className="flex items-start justify-between gap-3">
                <CategoryIcon id={r.category} color={`var(--cat-${r.category})`} size={18} />
                <span className="num text-xl text-lime-text">{inr(r.savingsMonthly)}<span className="text-xs text-ink-3 font-sans">/mo</span></span>
              </div>
              <h3 className="mt-3 leading-snug">{r.title}</h3>
              <p className="text-sm text-ink-3 mt-1.5 line-clamp-2">{r.description}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm text-cyan-text font-semibold">Try it <FiArrowUpRight className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" /></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="flex flex-wrap gap-2">
        {s.byCategory.slice(0, 3).map((c) => <Link key={c.id} to={`/category/${c.id}`} className="chip !py-2 !px-4">Deep dive: {c.name}</Link>)}
        <Link to="/budget" className="chip !py-2 !px-4">Set a budget</Link>
        <Link to="/trends" className="chip !py-2 !px-4">View trends</Link>
        <button className="chip !py-2 !px-4" onClick={() => api.download('/export/csv', 'spend-tracker.csv')}>Export CSV</button>
      </section>
    </div>
  );
}
