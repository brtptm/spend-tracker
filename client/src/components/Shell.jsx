import { useState } from 'react';
import { NavLink, Outlet, Link, useLocation, useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FiLogOut, FiX, FiArrowUp } from 'react-icons/fi';
import {
  PiChartDonutDuotone, PiReceiptDuotone, PiTrendUpDuotone, PiLightbulbDuotone, PiTicketDuotone, PiTargetDuotone, PiBellDuotone,
  PiPlugsConnectedDuotone, PiGearSixDuotone, PiSparkleDuotone, PiDotsThreeOutlineDuotone,
} from 'react-icons/pi';
import { api, auth, useMe, useHealth } from '../lib/api.js';
import { Logo, SourceTag } from './ui.jsx';

const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: PiChartDonutDuotone, mobile: true },
  { to: '/transactions', label: 'Transactions', icon: PiReceiptDuotone, mobile: true },
  { to: '/trends', label: 'Trends', icon: PiTrendUpDuotone },
  { to: '/recommendations', label: 'Save money', icon: PiLightbulbDuotone, mobile: true },
  { to: '/offers', label: 'Offers for you', icon: PiTicketDuotone, mobile: true },
  { to: '/budget', label: 'Budget', icon: PiTargetDuotone },
  { to: '/alerts', label: 'Alerts', icon: PiBellDuotone, badge: 'alerts' },
  { to: '/partner', label: 'Paytm partner API', icon: PiPlugsConnectedDuotone },
  { to: '/settings', label: 'Settings', icon: PiGearSixDuotone },
];

export function useSignOut() {
  const qc = useQueryClient(); const nav = useNavigate();
  return async () => { try { await api.logout(); } catch {} auth.setToken(null); qc.clear(); nav('/'); };
}

function AskDrawer({ onClose }) {
  const [q, setQ] = useState('');
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const { data: health } = useHealth();
  const suggestions = history.at(-1)?.followUps || ['Where am I overspending?', 'How much do delivery fees cost me?', 'Which subscriptions should I cancel?'];
  async function ask(text) {
    const question = (text ?? q).trim(); if (question.length < 3) return;
    setQ(''); setBusy(true);
    setHistory((h) => [...h, { question, pending: true }]);
    try { const r = await api.ask(question); setHistory((h) => [...h.slice(0, -1), { question, ...r.data, source: r.source }]); }
    catch (e) { setHistory((h) => [...h.slice(0, -1), { question, answer: e.message, error: true }]); }
    finally { setBusy(false); }
  }
  return (
    <motion.div className="fixed inset-0 z-50 bg-black/50 flex justify-end" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.aside className="h-full w-full sm:w-[440px] glass !border-y-0 !border-r-0 flex flex-col" onClick={(e) => e.stopPropagation()} initial={{ x: 60 }} animate={{ x: 0 }} exit={{ x: 60 }} transition={{ type: 'spring', damping: 30, stiffness: 320 }} aria-label="Ask your money">
        <header className="flex items-center justify-between px-5 h-16 border-b border-line">
          <div className="flex items-center gap-2 font-display font-semibold text-lg"><PiSparkleDuotone className="text-lime-text" /> Ask your money</div>
          <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-full hover:bg-surface-2" aria-label="Close"><FiX /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-5 grid content-start gap-5">
          {!history.length && <p className="text-ink-2">Ask anything about your spending — answers use your own numbers. {!health?.ai?.enabled && <span className="text-ink-3">AI is off right now, so answers are limited.</span>}</p>}
          {history.map((h, i) => (
            <div key={i} className="grid gap-2">
              <div className="justify-self-end max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 bg-ink text-bg text-sm">{h.question}</div>
              <div className="max-w-[92%] rounded-2xl rounded-bl-md px-4 py-3 bg-surface-2 text-sm leading-relaxed" style={h.error ? { color: 'var(--coral)' } : undefined}>
                {h.pending ? <span className="text-ink-3">Reading your transactions…</span> : <>{h.answer}<div className="mt-2"><SourceTag source={h.source} /></div></>}
              </div>
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-line">
          <div className="flex flex-wrap gap-2 mb-3">{suggestions.map((s) => <button key={s} className="chip" onClick={() => ask(s)} disabled={busy}>{s}</button>)}</div>
          <form onSubmit={(e) => { e.preventDefault(); ask(); }} className="flex gap-2">
            <input className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. What did I spend on Uber last month?" maxLength={300} aria-label="Your question" />
            <button className="btn btn-primary !px-3.5" disabled={busy || q.trim().length < 3} aria-label="Ask"><FiArrowUp /></button>
          </form>
        </div>
      </motion.aside>
    </motion.div>
  );
}

export default function Shell() {
  const loc = useLocation();
  const { data: me } = useMe();
  const signOut = useSignOut();
  const [ask, setAsk] = useState(false);
  const [more, setMore] = useState(false);
  const alerts = useQuery({ queryKey: ['alerts'], queryFn: api.alerts, enabled: Boolean(me?.hasData), refetchInterval: 120_000 });
  const unread = alerts.data?.unread || 0;
  const items = me?.hasData ? NAV : NAV.filter((n) => n.to === '/settings' || n.to === '/partner');
  const first = me?.user?.name?.split(' ')[0];

  const link = (n, cls) => (
    <NavLink key={n.to} to={n.to} onClick={() => setMore(false)} className={({ isActive }) => `${cls} ${isActive ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:text-ink hover:bg-surface-2/60'}`}>
      {({ isActive }) => (<>
        <n.icon size={20} style={isActive ? { color: 'var(--lime-text)' } : undefined} />
        <span className="flex-1">{n.label}</span>
        {n.badge === 'alerts' && unread > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full text-[11px] font-bold grid place-items-center" style={{ background: 'var(--coral)', color: '#fff' }}>{unread}</span>}
      </>)}
    </NavLink>
  );

  return (
    <div className="ledger min-h-dvh lg:grid lg:grid-cols-[256px_1fr]">
      <aside className="hidden lg:flex flex-col gap-6 sticky top-0 h-dvh border-r border-line px-4 py-6">
        <Link to="/dashboard" className="px-2"><Logo /></Link>
        <button onClick={() => setAsk(true)} className="mx-1 flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold border border-line hover:border-cyan transition-colors" style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--lime) 10%, transparent), transparent)' }}>
          <PiSparkleDuotone size={18} className="text-lime-text" /> Ask your money <kbd className="ml-auto text-[10px] text-ink-3">AI</kbd>
        </button>
        <nav aria-label="Main" className="flex flex-col gap-0.5">{items.map((n) => link(n, 'flex items-center gap-3 px-3 py-2.5 rounded-xl text-[14px] font-medium transition-colors'))}</nav>
        <div className="mt-auto px-2">
          {me?.user && <div className="text-sm"><div className="font-semibold">{me.user.name}</div><div className="text-ink-3 text-xs">{me.user.city || me.user.email}</div></div>}
          <button onClick={signOut} className="mt-3 flex items-center gap-2 text-sm text-ink-3 hover:text-ink"><FiLogOut /> Sign out</button>
        </div>
      </aside>

      <header className="lg:hidden sticky top-0 z-30 glass !border-x-0 !border-t-0 px-4 h-14 flex items-center justify-between">
        <Link to="/dashboard"><Logo size={24} /></Link>
        <button onClick={() => setAsk(true)} className="chip"><PiSparkleDuotone className="text-lime-text" /> Ask</button>
      </header>

      <main className="min-w-0 px-4 sm:px-6 lg:px-10 py-6 lg:py-9 pb-28 lg:pb-12">
        <div className="max-w-[1240px] mx-auto">
          <AnimatePresence mode="wait">
            <motion.div key={loc.pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22, ease: 'easeOut' }}>
              <Outlet context={{ openAsk: () => setAsk(true), firstName: first }} />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <nav aria-label="Main" className="lg:hidden fixed bottom-0 inset-x-0 z-30 glass !border-x-0 !border-b-0 grid grid-cols-5" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {items.filter((n) => n.mobile).map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${isActive ? 'text-lime-text' : 'text-ink-3'}`}><n.icon size={22} />{n.label.split(' ')[0]}</NavLink>
        ))}
        <button onClick={() => setMore(true)} className="flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium text-ink-3 relative"><PiDotsThreeOutlineDuotone size={22} />More{unread > 0 && <span className="absolute top-2 right-[30%] w-2 h-2 rounded-full" style={{ background: 'var(--coral)' }} />}</button>
      </nav>

      <AnimatePresence>
        {more && (
          <motion.div className="lg:hidden fixed inset-0 z-40 bg-black/50 flex items-end" onClick={() => setMore(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.nav className="w-full panel rounded-b-none p-3 grid gap-0.5" onClick={(e) => e.stopPropagation()} initial={{ y: 40 }} animate={{ y: 0 }} exit={{ y: 40 }} aria-label="More">
              {items.filter((n) => !n.mobile).map((n) => link(n, 'flex items-center gap-3 px-3 py-3 rounded-xl font-medium'))}
              <button onClick={signOut} className="flex items-center gap-3 px-3 py-3 text-ink-3"><FiLogOut size={20} /> Sign out</button>
            </motion.nav>
          </motion.div>
        )}
        {ask && <AskDrawer onClose={() => setAsk(false)} />}
      </AnimatePresence>
    </div>
  );
}
