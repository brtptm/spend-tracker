import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FiArrowLeft, FiChevronRight } from 'react-icons/fi';
import { api } from '../lib/api.js';
import { inr, inrShort, dt } from '../lib/format.js';
import { Spinner, ErrorNote, Bar, CategoryIcon, Segmented, Ticker, Toast } from '../components/ui.jsx';
import { OfferCard, RecommendationCard } from '../components/cards.jsx';
import { TrendArea } from '../components/charts.jsx';

export default function Category() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [period, setPeriod] = useState('3m');
  const [toast, setToast] = useState('');
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['category', id, period], queryFn: () => api.category(id, period), placeholderData: (p) => p });
  if (isLoading && !data) return <Spinner />;
  if (error && !data) return <ErrorNote error={error} onRetry={refetch} />;
  const c = data.category, cmp = data.comparison;

  async function act(rec, accept) {
    await (accept ? api.acceptRec(rec.id) : api.dismissRec(rec.id));
    setToast(accept ? 'Added to your plan — we’ll track the impact' : 'Got it — we won’t suggest that again');
    qc.invalidateQueries();
  }

  return (
    <div className="grid gap-6">
      <Toast message={toast} onDone={() => setToast('')} />
      <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink w-fit"><FiArrowLeft /> Dashboard</Link>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <CategoryIcon id={c.id} color={c.color} size={26} />
          <div>
            <h1 className="text-[2rem] sm:text-[2.5rem]">{c.name}</h1>
            <p className="text-ink-2"><span className="num text-ink">{inr(data.monthly)}</span> a month on average · {data.count} payments · avg {inr(data.avgTicket)}</p>
          </div>
        </div>
        <Segmented label="Period" value={period} onChange={setPeriod} options={[['30d', '30 days'], ['3m', '3 months'], ['6m', '6 months'], ['12m', '12 months']]} />
      </header>

      <section className="grid lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-5">
        <div className="panel p-6">
          <h2 className="text-xl">Breakdown</h2>
          <div className="mt-5 grid gap-5">
            {data.subcategories.map((s) => (
              <div key={s.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold">{s.name}</span>
                  <span className="text-sm text-ink-3"><span className="num text-ink text-base">{inr(s.monthly)}</span>/mo · {s.percentage}%</span>
                </div>
                <div className="mt-2"><Bar value={s.percentage} color={c.color} height={7} label={`${s.name} share`} /></div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
                  {s.merchants.slice(0, 4).map((m) => <Link key={m.id} to={`/merchant/${m.id}`} className="hover:text-ink hover:underline">{m.name} <span className="text-ink-3">{inrShort(m.monthly)} · {Math.round(m.count / Math.max(1, data.total ? (data.total / data.monthly) : 1))} /mo</span></Link>)}
                </div>
                <div className="text-xs text-ink-3 mt-1">{s.perMonth} payments a month · avg {inr(s.avgTicket)}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-5 content-start">
          <div className="panel p-6">
            <h2 className="text-xl">What stands out</h2>
            <ul className="mt-4 grid gap-3">{data.keyInsights.map((k) => <li key={k} className="flex gap-3"><span className="mt-2 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c.color }} />{k}</li>)}</ul>
          </div>
          {cmp && (
            <div className="panel p-6">
              <h2 className="text-xl">Compared with similar users</h2>
              <p className="text-sm text-ink-3 mt-1">People with {data.cohort} (illustrative benchmark)</p>
              <div className="mt-5 grid gap-4">
                <div><div className="flex justify-between text-sm mb-1.5"><span>You</span><span className="num">{inr(cmp.you)}</span></div><Bar value={cmp.you} max={Math.max(cmp.you, cmp.average)} color="var(--cyan)" label="You" /></div>
                <div><div className="flex justify-between text-sm mb-1.5"><span>Similar users</span><span className="num">{inr(cmp.average)}</span></div><Bar value={cmp.average} max={Math.max(cmp.you, cmp.average)} color="var(--ink-3)" label="Similar users" /></div>
              </div>
              <p className="mt-4 font-semibold" style={{ color: cmp.percentageDifference > 10 ? 'var(--coral)' : cmp.percentageDifference < -10 ? 'var(--lime-text)' : 'var(--ink-2)' }}>
                {Math.abs(cmp.percentageDifference) <= 10 ? 'About the same as similar users' : `${Math.abs(cmp.percentageDifference)}% ${cmp.percentageDifference > 0 ? 'more' : 'less'} than similar users`}
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="panel p-6">
        <h2 className="text-xl">Monthly trend</h2><p className="text-sm text-ink-3 mt-1">Completed months</p>
        <div className="mt-4"><TrendArea data={data.series.filter((m) => !m.partial)} color={c.color} name={c.name} /></div>
      </section>

      {data.opportunities.length > 0 && (
        <section>
          <h2 className="text-xl mb-4">Money-saving opportunities · <span className="text-lime-text"><Ticker value={data.opportunities.filter((o) => o.status !== 'declined').reduce((s, o) => s + o.savingsMonthly, 0)} />/month</span></h2>
          <div className="grid md:grid-cols-2 gap-4">{data.opportunities.map((r) => <RecommendationCard key={r.id} rec={r} onAccept={(x) => act(x, true)} onDismiss={(x) => act(x, false)} />)}</div>
        </section>
      )}

      {data.offers.length > 0 && (
        <section>
          <h2 className="text-xl mb-4">Smart offers for you</h2>
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">{data.offers.map((o) => <OfferCard key={o.adId} offer={o} />)}</div>
        </section>
      )}

      <section className="panel p-6">
        <div className="flex items-center justify-between"><h2 className="text-xl">Recent payments</h2><Link to={`/transactions?category=${c.id}`} className="text-sm text-link font-medium inline-flex items-center gap-1">All <FiChevronRight /></Link></div>
        <ul className="mt-3 divide-y divide-line">
          {data.recent.map((t) => (
            <li key={t.transactionId} className="py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1"><div className="font-medium truncate">{t.merchantName}</div><div className="text-xs text-ink-3">{dt(t.timestamp)}{t.description ? ` · ${t.description}` : ''}</div></div>
              <div className="num">{inr(t.amount)}</div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
