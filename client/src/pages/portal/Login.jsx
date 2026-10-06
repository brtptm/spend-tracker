import { useState } from 'react';
import { useNavigate, useLocation, Navigate, Link } from 'react-router';
import { motion } from 'motion/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PiWebhooksLogoLight, PiStackLight, PiBroomLight, PiTagLight, PiDeviceMobileLight } from 'react-icons/pi';
import { portal, portalAuth } from '../../lib/portalApi.js';
import { Logo, ErrorNote, ThemeToggle } from '../../components/ui.jsx';


/** Pipeline sketch: two ways in, one deterministic path through, read back by phone. */
function Pipeline() {
  const step = (Icon, title, sub, i) => (
    <motion.div className="flex items-center gap-3.5" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + i * 0.12, duration: 0.5 }}>
      <span className="grid place-items-center w-10 h-10 rounded-xl border border-line bg-surface-2 shrink-0"><Icon size={19} /></span>
      <span className="min-w-0"><span className="block text-[14px] font-medium">{title}</span><span className="block text-[12.5px] text-ink-3">{sub}</span></span>
    </motion.div>
  );
  const line = <span className="block w-px h-5 ml-5 bg-[var(--line-strong)]" aria-hidden="true" />;
  return (
    <div aria-label="How the integration works">
      <div className="grid grid-cols-2 gap-3">
        {step(PiWebhooksLogoLight, 'Webhook', 'POST /v1/events', 0)}
        {step(PiStackLight, 'Batch', 'POST /v1/transactions/batch', 1)}
      </div>
      {line}{step(PiBroomLight, 'Clean & filter', 'Normalise, de-duplicate, drop junk', 2)}
      {line}{step(PiTagLight, 'Categorise', 'Catalog → MCC → keywords → P2P', 3)}
      {line}{step(PiDeviceMobileLight, 'Read by phone', 'Summary, merchants, behaviour, reports', 4)}
    </div>
  );
}

export default function Login() {
  const nav = useNavigate();
  const loc = useLocation();
  const qc = useQueryClient();
  const [form, setForm] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Demo sign-in is decided by the server (PORTAL_DEMO=1, never in production); no credentials live in this bundle.
  const config = useQuery({ queryKey: ['portal-config'], queryFn: portal.config, staleTime: Infinity, retry: false });
  if (portalAuth.signedIn()) return <Navigate to="/portal" replace />;


  async function signIn(request) {
    setBusy(true); setError(null);
    try {
      const { token } = await request();
      portalAuth.setToken(token);
      qc.removeQueries({ predicate: (q) => String(q.queryKey[0]).startsWith('portal') });
      nav(loc.state?.from && loc.state.from !== '/portal/login' ? loc.state.from : '/portal', { replace: true });
    } catch (err) { setError(err); setBusy(false); }
  }
  const submit = (e) => { e.preventDefault(); signIn(() => portal.login(form.email.trim(), form.password)); };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="ledger min-h-dvh grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <section className="hidden lg:flex flex-col justify-between border-r border-line p-12 xl:p-16">
        <Logo size={24} />
        <div className="max-w-[460px]">
          <div className="eyebrow">Integration Portal</div>
          <h1 className="text-[2.6rem] leading-[1.04] mt-3">Raw UPI payments in.<br /><span className="text-ink-3">Clean spending out.</span></h1>
          <p className="text-ink-2 mt-5 text-[15px] leading-relaxed">Stream payments by webhook or batch. Every one is cleaned, de-duplicated and categorised deterministically, then readable per user by phone number.</p>
          <div className="mt-10"><Pipeline /></div>
        </div>
        <div className="flex items-center gap-5 text-[12.5px] text-ink-3">
          <a href="/docs" className="hover:text-ink">API docs</a><Link to="/" className="hover:text-ink">Spend Tracker app</Link><span>Keys hashed at rest · DPDP-ready erasure</span>
        </div>
      </section>

      <section className="flex flex-col p-6 sm:p-10">
        <div className="flex items-center justify-between lg:justify-end"><span className="lg:hidden"><Logo size={22} /></span><ThemeToggle /></div>
        <div className="flex-1 grid place-items-center py-10">
          <motion.form onSubmit={submit} className="w-full max-w-[380px]" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
            <h2 className="text-[1.7rem]">Sign in</h2>
            <p className="text-ink-2 mt-1.5 text-[14.5px]">For partner engineering and operations teams.</p>
            <div className="grid gap-4 mt-8">
              <label className="grid gap-1.5"><span className="label">Work email</span><input className="field" type="email" autoComplete="username" value={form.email} onChange={set('email')} required /></label>
              <label className="grid gap-1.5"><span className="label">Password</span><input className="field" type="password" autoComplete="current-password" value={form.password} onChange={set('password')} required /></label>
              <ErrorNote error={error} />
              <button className="btn btn-primary w-full mt-1" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
            </div>
            {config.data?.demo && (
              <button type="button" disabled={busy} onClick={() => signIn(portal.demo)} className="mt-6 w-full rounded-2xl border border-dashed border-[var(--line-strong)] px-4 py-3 text-left hover:bg-surface-2 transition-colors">
                <span className="block text-[13px] font-medium">Use demo account</span>
                <span className="block text-[12px] text-ink-3 mt-0.5">Sign in as Paytm Integrations — demo environments only</span>
              </button>
            )}
            <p className="lg:hidden text-[12.5px] text-ink-3 mt-6"><a href="/docs" className="hover:text-ink">Read the API docs →</a></p>
          </motion.form>
        </div>
      </section>
    </div>
  );
}
