import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { inr, inrShort, dt } from '../lib/format.js';
import { Spinner, ErrorNote, Segmented, PageHead, SEVERITY } from '../components/ui.jsx';
import { MonthlyStack, Heatmap, SimpleBars } from '../components/charts.jsx';
import BrandLogo from '../components/BrandLogo.jsx';

const SEV = { high: 'critical', medium: 'warning', low: 'info', critical: 'critical' };

export default function Trends() {
  const [months, setMonths] = useState(6);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['trends', months], queryFn: () => api.trends(months), placeholderData: (p) => p });
  if (isLoading && !data) return <Spinner />;
  if (error && !data) return <ErrorNote error={error} onRetry={refetch} />;
  const t = data.series.trend;
  const peakDay = [...data.weekday].sort((a, b) => b.amount - a.amount)[0];
  const peakHour = [...data.hourly].sort((a, b) => b.amount - a.amount)[0];
  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHead title="Trends" sub={`${t.direction === 'stable' ? 'Spending is stable' : `Spending is ${t.direction} (${t.change > 0 ? '+' : ''}${t.change}% over the last 3 full months)`}.`}
        right={<Segmented label="Months" value={String(months)} onChange={(v) => setMonths(Number(v))} options={[['3', '3 months'], ['6', '6 months'], ['12', '12 months']]} />} />
      <section className="panel p-6"><h2 className="text-xl">Month by month</h2><div className="mt-5"><MonthlyStack months={data.series.months} height={300} /></div></section>
      <section className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-5">
        <div className="panel p-6">
          <h2 className="text-xl">When you spend</h2>
          <p className="text-sm text-ink-3 mt-1">Peak: {peakDay.day}s around {peakHour.hour}:00</p>
          <div className="mt-5"><Heatmap grid={data.heatmap} /></div>
        </div>
        <div className="panel p-6"><h2 className="text-xl">By weekday</h2><div className="mt-5"><SimpleBars data={data.weekday} xKey="day" height={240} /></div></div>
      </section>
      <section className="grid lg:grid-cols-2 gap-5">
        <div className="panel p-6">
          <h2 className="text-xl">Unusual activity</h2>
          {data.anomalies.length ? (
            <ul className="mt-3 divide-y divide-line">
              {data.anomalies.map((a, i) => { const s = SEVERITY[SEV[a.severity]] || SEVERITY.info; return (
                <li key={i} className="py-4 flex gap-3">
                  <span className="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color, boxShadow: `0 0 10px ${s.color}` }} />
                  <div><div className="font-semibold">{a.description}</div><div className="text-sm text-ink-2 mt-1">{a.action}</div>{a.at && <div className="text-xs text-ink-3 mt-1">{dt(a.at)}</div>}</div>
                </li>
              ); })}
            </ul>
          ) : <p className="text-ink-3 mt-3">Nothing unusual in the last 30 days.</p>}
        </div>
        <div className="panel p-6">
          <div className="flex items-baseline justify-between"><h2 className="text-xl">Subscriptions</h2><span className="num text-lg">{inr(data.subscriptions.total)}<span className="text-xs text-ink-3 font-sans">/month</span></span></div>
          {data.subscriptions.overlaps.map((o) => <p key={o.sub} className="mt-3 text-sm rounded-xl px-3 py-2" style={{ background: 'color-mix(in srgb, var(--amber) 14%, transparent)', color: 'var(--amber)' }}>Overlap: {o.services.join(' + ')} ({inr(o.monthly)}/month)</p>)}
          <ul className="mt-3 divide-y divide-line">
            {data.subscriptions.list.map((s) => (
              <li key={s.merchant} className="py-3 flex items-center gap-3">
                <BrandLogo id={s.merchantId} name={s.merchant} category={s.category} size={32} />
                <Link to={`/merchant/${s.merchantId || s.merchant.toLowerCase().replace(/\W+/g, '-')}`} className="flex-1 hover:underline">{s.merchant}</Link>
                <span className="text-xs text-ink-3">last {dt(s.lastCharged, 'd MMM')}</span>
                <span className="num w-20 text-right">{inrShort(s.monthly)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
