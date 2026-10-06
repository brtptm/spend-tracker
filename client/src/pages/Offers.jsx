import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { api, useMe } from '../lib/api.js';
import { Spinner, ErrorNote, PageHead, Segmented } from '../components/ui.jsx';
import { OfferCard, OfferCarousel } from '../components/cards.jsx';
import { CAT_NAMES } from '../lib/cats.js';

export default function Offers() {
  const { data: me } = useMe();
  const [cat, setCat] = useState('all');
  const q = useQuery({ queryKey: ['offers', 'all'], queryFn: () => api.offers(24) });
  const perf = useQuery({ queryKey: ['adperf'], queryFn: api.adPerformance });
  if (q.isLoading) return <Spinner />;
  if (q.error) return <ErrorNote error={q.error} onRetry={q.refetch} />;
  const { personalized = [], generic = [], personalization } = q.data;
  const cats = [...new Set([...personalized, ...generic].map((o) => o.targetCategory))];
  const f = (list) => (cat === 'all' ? list : list.filter((o) => o.targetCategory === cat));
  const mine = f(personalized), rest = f(generic);
  const [featured, ...others] = mine;

  return (
    <div className="grid gap-8">
      <PageHead title="Offers" sub="Personalised to how you actually spend — then everything else." />
      {!personalization && <p className="panel-quiet p-4 text-sm">Personalised offers are off, so everything below is general. <Link to="/settings" className="text-link font-medium">Turn them on in Settings</Link>.</p>}
      <Segmented label="Category" value={cat} onChange={setCat} options={[['all', 'All'], ...cats.map((c) => [c, CAT_NAMES[c].split(' ')[0]])]} />

      {mine.length > 0 && (
        <section className="grid gap-4">
          <div className="flex items-baseline justify-between"><h2 className="text-xl">Picked for you</h2><span className="text-sm text-ink-3">{mine.length} offers · ranked by your spending</span></div>
          {featured && <OfferCarousel key={`${cat}-${featured.adId}`} offers={[featured]} />}
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{others.map((o) => <OfferCard key={o.adId} offer={o} />)}</div>
        </section>
      )}

      {rest.length > 0 && (
        <section className="grid gap-4">
          <div className="flex items-baseline justify-between"><h2 className="text-xl">More offers</h2><span className="text-sm text-ink-3">Popular with Paytm users</span></div>
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{rest.map((o) => <OfferCard key={o.adId} offer={o} />)}</div>
        </section>
      )}

      <section className="grid md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-5">
        <div className="panel p-7">
          <h2 className="text-lg">How offers are ranked</h2>
          <ol className="mt-4 grid gap-3 text-[15px] text-ink-2">
            <li><span className="text-ink font-medium">Your merchants first.</span> Spend at Swiggy → Swiggy offers lead.</li>
            <li><span className="text-ink font-medium">Then your categories.</span> Big grocery spend → grocery deals.</li>
            <li><span className="text-ink font-medium">Then everything else,</span> clearly separated.</li>
            <li><span className="text-ink font-medium">Your feedback counts.</span> “Not relevant” hides an offer for 14 days and lowers similar ones.</li>
            <li><span className="text-ink font-medium">Never</span> your age, gender or income.</li>
          </ol>
        </div>
        {perf.data && (
          <div className="panel p-7">
            <h2 className="text-lg">Your activity</h2>
            <dl className="mt-5 grid grid-cols-3 gap-4">
              {[['Seen', perf.data.totals.views], ['Opened', perf.data.totals.clicks], ['Hidden', perf.data.totals.dismissals]].map(([l, v]) => <div key={l}><dt className="eyebrow">{l}</dt><dd className="num text-2xl mt-1">{v}</dd></div>)}
            </dl>
            <p className="text-xs text-ink-3 mt-5">{me?.user?.consentPartner ? 'Shared with Paytm as aggregated performance only.' : 'Not shared with Paytm.'}</p>
          </div>
        )}
      </section>
    </div>
  );
}
