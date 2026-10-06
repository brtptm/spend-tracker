import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { PiTrophyDuotone } from 'react-icons/pi';
import { api } from '../lib/api.js';
import { inr } from '../lib/format.js';
import { Spinner, ErrorNote, PageHead, Ticker, Bar, Toast, Segmented, stagger, rise } from '../components/ui.jsx';
import { RecommendationCard } from '../components/cards.jsx';
import { CompareBars } from '../components/charts.jsx';

export default function Recommendations() {
  const qc = useQueryClient();
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('active');
  const recs = useQuery({ queryKey: ['recs'], queryFn: api.recs });
  const impact = useQuery({ queryKey: ['impact'], queryFn: api.impact });
  const cmp = useQuery({ queryKey: ['comparison'], queryFn: api.comparison });
  if (recs.isLoading) return <Spinner />;
  if (recs.error) return <ErrorNote error={recs.error} onRetry={recs.refetch} />;

  const refresh = () => qc.invalidateQueries();
  async function act(rec, accept) {
    setBusy(true);
    try { await (accept ? api.acceptRec(rec.id) : api.dismissRec(rec.id)); setToast(accept ? 'Added to your plan' : 'Dismissed — we’ll learn from it'); await refresh(); } finally { setBusy(false); }
  }
  async function challenge(c, join) { await (join ? api.acceptChallenge(c.id) : api.leaveChallenge(c.id)); setToast(join ? 'Challenge accepted — good luck!' : 'Left the challenge'); refresh(); }

  const list = recs.data.recommendations.filter((r) => (filter === 'all' ? true : filter === 'accepted' ? r.status === 'accepted' : r.status === 'active'));
  const im = impact.data;

  return (
    <div className="grid grid-cols-1 gap-6">
      <Toast message={toast} onDone={() => setToast('')} />
      <PageHead title="Save money" sub="Specific changes, priced from your own spending." />
      {im && (
        <motion.section className="grid sm:grid-cols-3 gap-4" variants={stagger} initial="hidden" animate="show">
          <motion.div variants={rise} className="panel p-6">
            <div className="text-sm text-ink-3">You could keep</div>
            <div className="num text-4xl text-lime-text mt-1"><Ticker value={im.potential.monthly} /></div>
            <div className="text-sm text-ink-2 mt-1">a month · {inr(im.potential.annual)} a year</div>
          </motion.div>
          <motion.div variants={rise} className="panel p-6"><div className="text-sm text-ink-3">You’ve committed to</div><div className="num text-4xl mt-1"><Ticker value={im.committed.monthly} /></div><div className="text-sm text-ink-2 mt-1">{im.committed.count} changes</div></motion.div>
          <motion.div variants={rise} className="panel p-6"><div className="text-sm text-ink-3">Saved so far vs. when you started</div><div className="num text-4xl mt-1 text-lime-text"><Ticker value={im.achieved.monthly} /></div><div className="text-sm text-ink-2 mt-1">tracked over the last 30 days</div></motion.div>
        </motion.section>
      )}
      {im?.tracking?.length > 0 && (
        <section className="panel p-6">
          <h2 className="text-xl">Tracking your changes</h2>
          <ul className="mt-4 grid md:grid-cols-2 gap-5">
            {im.tracking.map((t) => (
              <li key={t.id}><div className="flex justify-between text-sm"><span className="font-semibold">{t.title}</span><span className="text-ink-3">{inr(t.achieved)} / {inr(t.target)}</span></div><div className="mt-2"><Bar value={t.achieved} max={t.target} color="var(--lime)" label={t.title} /></div></li>
            ))}
          </ul>
        </section>
      )}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-xl">Recommendations</h2>
        <Segmented label="Filter" value={filter} onChange={setFilter} options={[['active', 'To try'], ['accepted', 'In progress'], ['all', 'All']]} />
      </div>
      <section className="grid md:grid-cols-2 gap-4">
        {list.map((r) => <RecommendationCard key={r.id} rec={r} busy={busy} onAccept={(x) => act(x, true)} onDismiss={(x) => act(x, false)} />)}
        {!list.length && <p className="text-ink-3">Nothing here yet.</p>}
      </section>

      <section className="grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-5">
        {cmp.data && (
          <div className="panel p-6">
            <h2 className="text-xl">You vs. similar users</h2>
            <p className="text-sm text-ink-3 mt-1">People with {cmp.data.cohort} · overall you spend <b className="text-ink">{Math.abs(cmp.data.total.percentageDifference)}% {cmp.data.total.percentageDifference >= 0 ? 'more' : 'less'}</b> · illustrative benchmark</p>
            <div className="mt-5"><CompareBars rows={cmp.data.rows} /></div>
          </div>
        )}
        <div className="panel p-6">
          <h2 className="text-xl flex items-center gap-2"><PiTrophyDuotone className="text-amber" /> Challenges</h2>
          <ul className="mt-4 grid gap-3">
            {recs.data.challenges.map((c) => (
              <li key={c.id} className="panel-quiet p-4">
                <div className="flex items-start justify-between gap-3">
                  <div><div className="font-semibold">{c.title}</div><div className="text-xs text-ink-3 mt-0.5">Reward: {c.reward}</div></div>
                  {c.status === 'available' ? <button className="btn btn-primary btn-sm" onClick={() => challenge(c, true)}>Accept</button> : <button className="btn btn-ghost btn-sm" onClick={() => challenge(c, false)}>Leave</button>}
                </div>
                {c.status === 'active' && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs mb-1.5"><span style={{ color: c.onTrack ? 'var(--lime-text)' : 'var(--coral)' }}>{c.onTrack ? 'On track' : 'Behind'}</span><span className="text-ink-3">{c.metric === 'delivery_orders' || c.metric === 'subscription_count' ? `${c.current} now` : `${inr(c.current)} so far`}</span></div>
                    <Bar value={c.progress} max={100} color={c.onTrack ? 'var(--lime)' : 'var(--coral)'} label="Challenge progress" />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
