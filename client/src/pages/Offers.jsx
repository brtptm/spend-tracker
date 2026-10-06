import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api, useMe } from '../lib/api.js';
import { Spinner, ErrorNote, PageHead } from '../components/ui.jsx';
import { OfferCard } from '../components/cards.jsx';

export default function Offers() {
  const { data: me } = useMe();
  const q = useQuery({ queryKey: ['offers', 12], queryFn: () => api.offers(12) });
  const perf = useQuery({ queryKey: ['adperf'], queryFn: api.adPerformance });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorNote error={q.error} onRetry={q.refetch} />;
  const tiers = [[1, 'Matches your favourite merchants'], [2, 'Fits how you spend'], [3, 'Worth a look']];
  return (
    <div className="grid gap-8">
      <PageHead title="Offers for you" sub="Ranked only by what you actually spend. Dismiss anything that misses — the next one gets better." />
      {!q.data.personalization && <p className="panel-quiet p-4 text-sm">Personalised offers are off, so these are general. <Link to="/settings" className="text-cyan-text font-semibold">Turn them on in Settings</Link>.</p>}
      {tiers.map(([t, label]) => {
        const list = q.data.offers.filter((o) => o.tier === t);
        if (!list.length) return null;
        return (
          <section key={t}>
            <h2 className="text-xl mb-4">{label}</h2>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{list.map((o) => <OfferCard key={o.adId} offer={o} />)}</div>
          </section>
        );
      })}
      <section className="grid md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-5">
        <div className="panel p-6">
          <h2 className="text-xl">How we pick offers</h2>
          <ol className="mt-4 grid gap-3 text-ink-2">
            <li><b className="text-ink">1. Your merchants.</b> Spend at Swiggy → Swiggy offers rank first.</li>
            <li><b className="text-ink">2. Your categories.</b> Big grocery spend → grocery deals.</li>
            <li><b className="text-ink">3. Your feedback.</b> “Not relevant” hides it and lowers similar offers for 14 days.</li>
            <li><b className="text-ink">Never</b> your age, gender or income. Max 4 offers on the dashboard, no pop-ups.</li>
          </ol>
        </div>
        {perf.data && (
          <div className="panel p-6">
            <h2 className="text-xl">Your offer activity</h2>
            <dl className="mt-4 grid grid-cols-3 gap-4">
              <div><dt className="text-sm text-ink-3">Seen</dt><dd className="num text-2xl">{perf.data.totals.views}</dd></div>
              <div><dt className="text-sm text-ink-3">Opened</dt><dd className="num text-2xl">{perf.data.totals.clicks}</dd></div>
              <div><dt className="text-sm text-ink-3">Hidden</dt><dd className="num text-2xl">{perf.data.totals.dismissals}</dd></div>
            </dl>
            <p className="text-xs text-ink-3 mt-4">{me?.user?.consentPartner ? 'Shared with Paytm as aggregated performance only.' : 'Not shared with Paytm.'}</p>
          </div>
        )}
      </section>
    </div>
  );
}
