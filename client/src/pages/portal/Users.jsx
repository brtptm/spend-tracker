import { useState } from 'react';
import { motion } from 'motion/react';
import { PiMagnifyingGlassLight, PiDeviceMobileLight } from 'react-icons/pi';
import { portal } from '../../lib/portalApi.js';
import { ErrorNote, Skeleton } from '../../components/ui.jsx';
import { dt, ago } from '../../lib/format.js';
import { PageTitle, Chip, n } from './common.jsx';

const EXAMPLES = ['9876500001', '9876500002', '9876500003'];

export default function Users() {
  const [phone, setPhone] = useState('');
  const [state, setState] = useState({ phase: 'idle' });
  async function lookup(p = phone) {
    const v = String(p).trim();
    if (!v) return;
    setPhone(v); setState({ phase: 'loading' });
    try { setState({ phase: 'done', user: await portal.user(v) }); }
    catch (error) { setState({ phase: 'error', error }); }
  }
  const u = state.user;
  return (
    <>
      <PageTitle title="User lookup" sub="Find a user by phone for support and reconciliation: identity, consent, UPI IDs and data freshness. Spending details stay behind the API and its consent checks." />
      <form onSubmit={(e) => { e.preventDefault(); lookup(); }} className="panel p-4 sm:p-5 flex flex-col sm:flex-row gap-3">
        <label className="relative flex-1">
          <span className="sr-only">Phone number</span>
          <PiMagnifyingGlassLight className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" size={18} />
          <input className="field !pl-10 font-mono" inputMode="tel" placeholder="98765 00001 or +91 98765 00001" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <button className="btn btn-primary" disabled={!phone.trim() || state.phase === 'loading'}>{state.phase === 'loading' ? 'Looking up…' : 'Look up'}</button>
      </form>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">Try:{EXAMPLES.map((p) => <button key={p} type="button" onClick={() => lookup(p)} className="font-mono rounded-full px-2.5 py-1 bg-surface-2 hover:bg-surface-3 text-ink-2">{p}</button>)}</div>

      <div className="mt-6">
        {state.phase === 'loading' && <Skeleton h={260} className="!rounded-[22px]" />}
        {state.phase === 'error' && (state.error.status === 404 ? (
          <div className="panel p-8 text-center">
            <span className="inline-grid place-items-center w-12 h-12 rounded-2xl bg-surface-2"><PiDeviceMobileLight size={22} /></span>
            <h2 className="text-lg mt-4">No user with this phone yet</h2>
            <p className="text-sm text-ink-3 mt-1.5 max-w-md mx-auto">Users are created automatically the first time you send a payment for their phone number.</p>
          </div>
        ) : <ErrorNote error={state.error} onRetry={() => lookup()} />)}
        {state.phase === 'done' && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-5">
            <section className="panel p-6 sm:p-7" aria-label="Identity">
              <div className="eyebrow">Phone</div>
              <div className="num text-[1.8rem] mt-1 font-mono tracking-normal">{u.phone.replace(/(\d{5})(\d{5})/, '$1 $2')}</div>
              <div className="mt-1 text-ink-2">{u.name || <span className="text-ink-3">Name not shared</span>}</div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                <Chip dot={false} mono>{u.source}</Chip>
                <Chip color={u.consent.share_insights ? 'var(--positive)' : 'var(--negative)'}>Insights {u.consent.share_insights ? 'shared' : 'not shared'}</Chip>
                <Chip color={u.consent.ad_personalization ? 'var(--positive)' : 'var(--ink-3)'}>Ads {u.consent.ad_personalization ? 'personalised' : 'off'}</Chip>
              </div>
              <dl className="mt-6 grid grid-cols-2 gap-4 text-[13px]">
                <div><dt className="text-ink-3">Transactions</dt><dd className="num text-xl mt-0.5">{n(u.transactions)}</dd></div>
                <div><dt className="text-ink-3">UPI IDs</dt><dd className="num text-xl mt-0.5">{u.upi_ids.length}</dd></div>
                <div><dt className="text-ink-3">First payment</dt><dd className="mt-0.5">{u.first_payment_at ? dt(u.first_payment_at, 'd MMM yyyy') : '—'}</dd></div>
                <div><dt className="text-ink-3">Last payment</dt><dd className="mt-0.5">{u.last_payment_at ? ago(u.last_payment_at) : '—'}</dd></div>
              </dl>
            </section>
            <section className="panel p-6 sm:p-7 min-w-0" aria-label="UPI IDs">
              <h2 className="text-lg">UPI IDs used</h2>
              <p className="text-sm text-ink-3 mt-0.5">People change UPI IDs and apps; the phone stays the identity.</p>
              {u.upi_ids.length ? (
                <ul className="mt-4 divide-y divide-line">
                  {u.upi_ids.map((v, i) => (
                    <li key={v.vpa} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0"><div className="font-mono text-[13px] truncate">{v.vpa}</div><div className="text-[12px] text-ink-3 mt-0.5">Last used {ago(v.last_seen)}</div></div>
                      <div className="flex items-center gap-2 shrink-0">{i === 0 && <Chip color="var(--positive)">Current</Chip>}<span className="num text-[14px]">{n(v.payments)}</span><span className="text-[12px] text-ink-3">payments</span></div>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-ink-3 mt-4">No payer UPI IDs received yet. Send <span className="font-mono">payer_vpa</span> with each payment.</p>}
            </section>
          </motion.div>
        )}
      </div>
    </>
  );
}
