import { lazy, Suspense, useState, useEffect } from 'react';
import { Routes, Route, NavLink, Navigate, Outlet, useLocation, useNavigate, Link } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PiSquaresFourLight, PiKeyLight, PiTrayArrowDownLight, PiMagnifyingGlassLight, PiChartLineUpLight, PiBookOpenTextLight, PiSignOutLight, PiListLight, PiArrowUpRightLight } from 'react-icons/pi';
import { FiX } from 'react-icons/fi';
import { portal, portalAuth } from '../../lib/portalApi.js';
import { Logo, ThemeToggle, Skeleton } from '../../components/ui.jsx';
import Login from './Login.jsx';

const Overview = lazy(() => import('./Overview.jsx'));
const Keys = lazy(() => import('./Keys.jsx'));
const Deliveries = lazy(() => import('./Deliveries.jsx'));
const Users = lazy(() => import('./Users.jsx'));
const Revenue = lazy(() => import('./Revenue.jsx'));

const NAV = [
  { to: '/portal', end: true, label: 'Overview', icon: PiSquaresFourLight },
  { to: '/portal/keys', label: 'API keys', icon: PiKeyLight },
  { to: '/portal/deliveries', label: 'Deliveries', icon: PiTrayArrowDownLight },
  { to: '/portal/users', label: 'User lookup', icon: PiMagnifyingGlassLight },
  { to: '/portal/revenue', label: 'Ad revenue', icon: PiChartLineUpLight },
];

function Brand() {
  return (
    <span className="inline-flex items-center gap-2.5 min-w-0">
      <Logo size={22} text={false} />
      <span className="leading-tight min-w-0"><span className="block font-semibold text-[14px] tracking-[-0.02em] truncate">Spend Tracker</span><span className="block text-[11px] text-ink-3 truncate">Integration Portal</span></span>
    </span>
  );
}

function NavItems({ onPick }) {
  return (
    <>
      {NAV.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.end} onClick={onPick}
          className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-[10px] text-[13.5px] transition-colors ${isActive ? 'bg-surface-2 text-ink font-medium' : 'text-ink-2 hover:text-ink hover:bg-surface-2/60'}`}>
          <n.icon size={18} />{n.label}
        </NavLink>
      ))}
      <a href="/docs" target="_blank" rel="noreferrer" onClick={onPick} className="flex items-center gap-3 px-3 py-2 rounded-[10px] text-[13.5px] text-ink-2 hover:text-ink hover:bg-surface-2/60">
        <PiBookOpenTextLight size={18} />Docs<PiArrowUpRightLight size={13} className="ml-auto text-ink-3" />
      </a>
    </>
  );
}

function Layout() {
  const loc = useLocation();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [menu, setMenu] = useState(false);
  const me = useQuery({ queryKey: ['portal-me'], queryFn: portal.me, staleTime: 5 * 60_000 });
  const m = me.data?.member;
  useEffect(() => { setMenu(false); }, [loc.pathname]);
  const signOut = () => { portalAuth.setToken(null); qc.removeQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('portal') }); nav('/portal/login'); };
  const partner = (
    <div className="mx-1 rounded-xl border border-line px-3 py-2.5 flex items-center justify-between gap-2">
      <div className="min-w-0"><div className="text-[11px] text-ink-3">Partner</div><div className="text-[14px] font-semibold truncate">{m?.partner.name || '—'}</div></div>
      <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0" style={{ color: 'var(--positive)', background: 'color-mix(in srgb, var(--positive) 13%, transparent)' }}><span className="w-1.5 h-1.5 rounded-full bg-positive animate-pulse" />Live</span>
    </div>
  );
  const footer = (
    <div className="px-2">
      {m && <div className="text-sm min-w-0"><div className="font-semibold truncate">{m.name}</div><div className="text-ink-3 text-xs truncate">{m.email}</div></div>}
      <div className="mt-3 flex items-center justify-between">
        <button onClick={signOut} className="flex items-center gap-2 text-sm text-ink-3 hover:text-ink"><PiSignOutLight size={17} /> Sign out</button>
        <ThemeToggle />
      </div>
    </div>
  );
  return (
    <div className="ledger min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="hidden lg:flex flex-col gap-6 sticky top-0 h-dvh border-r border-line px-3 py-6">
        <Link to="/portal" className="px-3"><Brand /></Link>
        {partner}
        <nav aria-label="Portal" className="flex flex-col gap-px">{<NavItems />}</nav>
        <div className="mt-auto">{footer}</div>
      </aside>

      <header className="lg:hidden sticky top-0 z-30 glass !border-x-0 !border-t-0 px-4 h-14 flex items-center justify-between">
        <Link to="/portal"><Brand /></Link>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button onClick={() => setMenu(true)} className="grid place-items-center w-9 h-9 rounded-full bg-surface-2" aria-label="Open menu" aria-expanded={menu}><PiListLight size={18} /></button>
        </div>
      </header>
      <AnimatePresence>
        {menu && (
          <motion.div className="lg:hidden fixed inset-0 z-50 bg-black/50" onClick={() => setMenu(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div role="dialog" aria-modal="true" aria-label="Menu" className="absolute right-0 top-0 h-full w-[84%] max-w-[320px] bg-[var(--surface-solid)] border-l border-line px-3 py-5 flex flex-col gap-6" onClick={(e) => e.stopPropagation()}
              initial={{ x: 40 }} animate={{ x: 0 }} exit={{ x: 40 }} transition={{ type: 'spring', damping: 30, stiffness: 320 }}>
              <div className="flex items-center justify-between px-2"><Brand /><button onClick={() => setMenu(false)} className="w-8 h-8 grid place-items-center rounded-full hover:bg-surface-2" aria-label="Close menu"><FiX /></button></div>
              {partner}
              <nav aria-label="Portal" className="flex flex-col gap-px"><NavItems onPick={() => setMenu(false)} /></nav>
              <div className="mt-auto">{footer}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="min-w-0 px-4 sm:px-6 lg:px-10 py-6 lg:py-9 pb-16">
        <div className="max-w-[1320px] mx-auto">
          <motion.div key={loc.pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: 'easeOut' }}>
            <Suspense fallback={<div className="grid gap-5"><Skeleton h={40} className="w-72 max-w-full" /><Skeleton h={300} className="!rounded-[22px]" /></div>}>
              <Outlet />
            </Suspense>
          </motion.div>
        </div>
      </main>
    </div>
  );
}

function RequirePortal() {
  const loc = useLocation();
  if (!portalAuth.signedIn()) return <Navigate to="/portal/login" replace state={{ from: loc.pathname }} />;
  return <Layout />;
}

export default function Portal() {
  useEffect(() => { const t = document.title; document.title = 'Integration Portal · Spend Tracker'; return () => { document.title = t; }; }, []);
  return (
    <Routes>
      <Route path="login" element={<Login />} />
      <Route element={<RequirePortal />}>
        <Route index element={<Overview />} />
        <Route path="keys" element={<Keys />} />
        <Route path="deliveries" element={<Deliveries />} />
        <Route path="users" element={<Users />} />
        <Route path="revenue" element={<Revenue />} />
      </Route>
      <Route path="*" element={<Navigate to="/portal" replace />} />
    </Routes>
  );
}
