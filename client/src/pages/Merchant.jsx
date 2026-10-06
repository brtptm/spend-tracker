import { Link, useParams, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { FiArrowLeft } from 'react-icons/fi';
import { api } from '../lib/api.js';
import { inr, inrShort, dt } from '../lib/format.js';
import { Spinner, ErrorNote, Bar } from '../components/ui.jsx';
import { OfferCard } from '../components/cards.jsx';
import { TrendArea, SimpleBars } from '../components/charts.jsx';
import BrandLogo from '../components/BrandLogo.jsx';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Merchant() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['merchant', id], queryFn: () => api.merchant(id) });
  if (isLoading) return <Spinner />;
  if (error) return <ErrorNote error={error} onRetry={refetch} />;
  const m = data.merchant;
  const max = Math.max(...data.compare.map((x) => x.monthly));
  return (
    <div className="grid grid-cols-1 gap-6">
      <button onClick={() => nav(-1)} className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink w-fit"><FiArrowLeft /> Back</button>
      <header>
        <Link to={`/category/${m.category}`} className="text-sm hover:underline" style={{ color: m.color }}>{m.categoryName} · {m.subName}</Link>
        <div className="flex items-center gap-4 mt-2"><BrandLogo id={m.id} name={m.name} category={m.category} size={56} /><h1 className="text-[2.2rem] sm:text-[2.8rem]">{m.name}</h1></div>
        <p className="text-ink-2">Since {dt(data.firstSeen, 'MMM yyyy')} · last payment {dt(data.lastSeen, 'd MMM')}</p>
      </header>
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[['Per month', inr(data.monthly)], ['Payments / month', data.perMonth], ['Average ticket', inr(data.avgTicket)], ['Used a coupon', `${Math.round(data.couponRate * 100)}% of the time`]].map(([l, v]) => (
          <div key={l} className="panel p-5"><div className="text-sm text-ink-3">{l}</div><div className="num text-2xl mt-1">{v}</div></div>
        ))}
      </section>
      <section className="grid lg:grid-cols-2 gap-5">
        <div className="panel p-6"><h2 className="text-xl">Monthly spend</h2><div className="mt-4"><TrendArea data={data.series.filter((x) => !x.partial)} color={m.color || "var(--gold)"} name={m.name} /></div></div>
        <div className="panel p-6">
          <h2 className="text-xl">{m.subName}: how {m.name} compares</h2>
          <ul className="mt-5 grid gap-4">
            {data.compare.slice(0, 6).map((x) => (
              <li key={x.id}>
                <div className="flex justify-between text-sm mb-1.5"><Link to={`/merchant/${x.id}`} className={x.isThis ? 'font-semibold' : 'text-ink-2 hover:underline'}>{x.name}</Link><span><span className="num">{inrShort(x.monthly)}</span><span className="text-ink-3">/mo · avg {inr(x.avgTicket)}</span></span></div>
                <Bar value={x.monthly} max={max} color={x.isThis ? m.color : 'var(--ink-3)'} label={x.name} />
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="grid lg:grid-cols-2 gap-5">
        <div className="panel p-6"><h2 className="text-xl">When you pay</h2><div className="mt-4"><SimpleBars data={data.hours.map((v, h) => ({ label: `${h}`, count: v }))} dataKey="count" name="Payments" height={170} format={(n) => `${n}`} tickFormat={(n) => `${n}`} /></div></div>
        <div className="panel p-6"><h2 className="text-xl">Which days</h2><div className="mt-4"><SimpleBars data={data.days.map((v, d) => ({ label: DAYS[d], count: v }))} dataKey="count" name="Payments" color={m.color} height={170} format={(n) => `${n}`} tickFormat={(n) => `${n}`} /></div></div>
      </section>
      {data.offers.length > 0 && <section><h2 className="text-xl mb-4">Offers that fit</h2><div className="grid md:grid-cols-3 gap-4">{data.offers.map((o) => <OfferCard key={o.adId} offer={o} />)}</div></section>}
      <section className="panel p-6">
        <h2 className="text-xl">Recent payments</h2>
        <ul className="mt-3 divide-y divide-line">{data.recent.map((t) => <li key={t.transactionId} className="py-3 flex justify-between gap-3"><span className="text-ink-2">{dt(t.timestamp)}{t.description ? ` · ${t.description}` : ''}</span><span className="num">{inr(t.amount)}</span></li>)}</ul>
      </section>
    </div>
  );
}
