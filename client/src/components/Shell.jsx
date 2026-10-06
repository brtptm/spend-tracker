import { useEffect, useState } from 'react';
import { NavLink, Outlet, Link, useLocation, useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FiLogOut, FiX, FiArrowUp } from 'react-icons/fi';
import {
  PiSquaresFourLight, PiListBulletsLight, PiChartLineUpLight, PiLeafLight, PiTagLight, PiTargetLight, PiBellSimpleLight,
  PiGearSixLight, PiSparkleLight, PiDotsThreeBold,
} from 'react-icons/pi';
import { api, auth, useMe, useHealth } from '../lib/api.js';
import { Logo, SourceTag, ThemeToggle } from './ui.jsx';
import { localAI, usable, wantsPrivate, shouldUseLocal, onDevice, refreshCached, checkSupport } from '../lib/localAI.js';
import PageBoundary from './PageBoundary.jsx';

const NAV = [
  { to: '/dashboard', label: 'Overview', icon: PiSquaresFourLight, mobile: true },
  { to: '/transactions', label: 'Transactions', icon: PiListBulletsLight, mobile: true },
  { to: '/offers', label: 'Offers', icon: PiTagLight, mobile: true },
  { to: '/recommendations', label: 'Save money', icon: PiLeafLight, mobile: true },
  { to: '/trends', label: 'Trends', icon: PiChartLineUpLight },
  { to: '/budget', label: 'Budget', icon: PiTargetLight },
  { to: '/alerts', label: 'Alerts', icon: PiBellSimpleLight, badge: 'alerts' },
  { to: '/settings', label: 'Settings', icon: PiGearSixLight },
];

const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '·';

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
    try {
      // On-device first when the user prefers it; otherwise ask the server and fall back on-device if Claude is out.
      // On-device failure falls back to the server. With "Prefer on-device" the fallback is engine-only,
      // so the user's summary is never sent to Claude.
      const private_ = wantsPrivate();
      let r = private_ ? null : await api.ask(question);
      if (shouldUseLocal(r?.source)) { const server = r; r = await onDevice('ask', question).catch(async () => server || api.ask(question, { engineOnly: private_ })); }
      else if (private_) r = await api.ask(question, { engineOnly: true }); // private, model unavailable: engine only
      setHistory((h) => [...h.slice(0, -1), { question, ...r.data, source: r.source, model: r.model }]);
    }
    catch (e) { setHistory((h) => [...h.slice(0, -1), { question, answer: e.message, error: true }]); }
    finally { setBusy(false); }
  }
  return (
    <motion.div className="fixed inset-0 z-50 bg-black/50 flex justify-end" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.aside className="h-full w-full sm:w-[440px] glass !border-y-0 !border-r-0 flex flex-col" onClick={(e) => e.stopPropagation()} initial={{ x: 60 }} animate={{ x: 0 }} exit={{ x: 60 }} transition={{ type: 'spring', damping: 30, stiffness: 320 }} aria-label="Ask your money">
        <header className="flex items-center justify-between px-5 h-16 border-b border-line">
          <div className="flex items-center gap-2 font-semibold text-[17px]"><PiSparkleLight /> Ask your money</div>
          <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-full hover:bg-surface-2" aria-label="Close"><FiX /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-5 grid content-start gap-5">
          {!history.length && <p className="text-ink-2">Ask anything about your spending — answers use your own numbers. {!health?.ai?.enabled && !usable() && <span className="text-ink-3">AI is off right now, so answers are limited.</span>}</p>}
          {history.map((h, i) => (
            <div key={i} className="grid gap-2">
              <div className="justify-self-end max-w-[85%] rounded-[18px] rounded-br-md px-4 py-2.5 text-[15px] font-medium" style={{ background: 'var(--ink)', color: 'var(--bg)' }}>{h.question}</div>
              <div className="max-w-[92%] rounded-[18px] rounded-bl-md px-4 py-3 bg-surface-2 text-sm leading-relaxed" style={h.error ? { color: 'var(--coral)' } : undefined}>
                {h.pending ? <span className="text-ink-3">{usable() ? 'Thinking…' : 'Reading your transactions…'}</span> : <>{h.answer}<div className="mt-2"><SourceTag source={h.source} model={h.model} /></div></>}
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
  // Learn once whether the on-device model is downloaded, so answers can fall back to it.
  useEffect(() => { if (localAI().enabled) { checkSupport(); refreshCached(); } }, []);
  const alerts = useQuery({ queryKey: ['alerts'], queryFn: api.alerts, enabled: Boolean(me?.hasData), refetchInterval: 120_000 });
  const unread = alerts.data?.unread || 0;
  const items = me?.hasData ? NAV : NAV.filter((n) => n.to === '/settings');
  const first = me?.user?.name?.split(' ')[0];

  const link = (n, cls, i) => (
    <NavLink key={n.to} to={n.to} onClick={() => setMore(false)} className={({ isActive }) => `${cls} ${isActive ? 'is-active bg-surface-3 text-ink font-medium' : 'text-ink-2 hover:text-ink hover:bg-surface-2/50'}`}>
      {() => (<>
        <n.icon size={19} />
        <span className="flex-1">{n.label}</span>
        {i != null && !(n.badge === 'alerts' && unread > 0) && <span className="console-idx">{String(i + 1).padStart(2, '0')}</span>}
        {n.badge === 'alerts' && unread > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full text-[11px] font-semibold grid place-items-center text-white" style={{ background: 'var(--negative)' }}>{unread}</span>}
      </>)}
    </NavLink>
  );

  return (
    <div className="ledger min-h-dvh lg:grid lg:grid-cols-[252px_1fr]">
      {/* Floating sidebar: the outer aside holds the sticky slot, the inner panel is the glass card (same surface as the page's cards). */}
      <aside className="hidden lg:block sticky top-0 h-dvh py-3 pl-3">
        <div className="panel no-marks rounded-[20px] h-full flex flex-col gap-7 px-3 py-6">
        <Link to="/dashboard" className="px-3"><Logo /></Link>
        <button onClick={() => setAsk(true)} className="ctl mx-1 flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] text-ink-2 bg-surface-2 hover:text-ink transition-colors">
          <PiSparkleLight size={17} /> Ask your money <kbd className="ml-auto text-[10px] text-ink-3 font-sans">AI</kbd>
        </button>
        <nav aria-label="Main" className="flex flex-col gap-px">{items.map((n, i) => link(n, 'console-link flex items-center gap-3 px-3 py-2 rounded-[10px] text-[13.5px] transition-colors', i))}</nav>
        {/* Account row: who's signed in, plus the two account actions, on one line. */}
        <div className="mt-auto -mx-3 -mb-6 px-3 py-3.5 border-t border-line flex items-center gap-2">
          <span className="account-avatar shrink-0 w-8 h-8 rounded-full grid place-items-center text-[12px] font-semibold bg-surface-3 text-ink" aria-hidden="true">{initials(me?.user?.name)}</span>
          <div className="min-w-0 flex-1 leading-tight pl-0.5">
            <div className="text-[13.5px] font-semibold truncate">{me?.user?.name || 'Signed in'}</div>
            {(me?.user?.city || me?.user?.email) && <div className="text-ink-3 text-xs truncate mt-0.5">{me.user.city || me.user.email}</div>}
          </div>
          <ThemeToggle className="ctl !w-[30px] !h-[30px] shrink-0" />
          <button onClick={signOut} className="ctl shrink-0 w-[30px] h-[30px] grid place-items-center rounded-full bg-surface-2 hover:bg-surface-3 text-ink-2 hover:text-ink transition-colors" aria-label="Sign out" title="Sign out"><FiLogOut size={15} /></button>
        </div>
        </div>
      </aside>

      <header className="lg:hidden sticky top-0 z-30 glass !border-x-0 !border-t-0 px-4 h-14 flex items-center justify-between">
        <Link to="/dashboard"><Logo size={24} /></Link>
        <div className="flex items-center gap-2"><ThemeToggle /><button onClick={() => setAsk(true)} className="chip !h-9"><PiSparkleLight /> Ask</button></div>
      </header>

      <main className="min-w-0 px-4 sm:px-6 lg:px-10 py-6 lg:py-9 pb-28 lg:pb-12">
        <div className="max-w-[1480px] mx-auto">
          {/* Enter-only fade keyed by path. No exit animation: an exiting <Outlet/> already
              renders the next route, and with lazy pages that race could leave a blank area. */}
          <motion.div key={loc.pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }}>
            <PageBoundary key={loc.pathname}>
              <Outlet context={{ openAsk: () => setAsk(true), firstName: first }} />
            </PageBoundary>
          </motion.div>
        </div>
      </main>

      <nav aria-label="Main" className="lg:hidden fixed bottom-0 inset-x-0 z-30 glass !border-x-0 !border-b-0 grid grid-cols-5" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {items.filter((n) => n.mobile).map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2.5 text-[10.5px] font-medium ${isActive ? 'text-ink' : 'text-ink-3'}`}><n.icon size={23} />{n.label.split(' ')[0]}</NavLink>
        ))}
        <button onClick={() => setMore(true)} className="flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium text-ink-3 relative"><PiDotsThreeBold size={22} />More{unread > 0 && <span className="absolute top-2 right-[30%] w-2 h-2 rounded-full" style={{ background: 'var(--coral)' }} />}</button>
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
