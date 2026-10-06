import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { api, auth } from '../lib/api.js';
import { Logo, ErrorNote } from '../components/ui.jsx';
import PaytmSignIn from '../components/PaytmSignIn.jsx';
import Ring from '../components/three/Ring.jsx';
import { CAT_COLORS, CAT_NAMES } from '../lib/cats.js';

const SAMPLE = [['food', 20000], ['shopping', 14000], ['transport', 9000], ['entertainment', 7000], ['bills', 6000], ['p2p', 4000]].map(([id, amount]) => ({ id, amount, name: CAT_NAMES[id], color: CAT_COLORS[id] }));

export default function Auth({ mode }) {
  const signup = mode === 'signup';
  const nav = useNavigate();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function finish(p) {
    setBusy(true); setError(null);
    try {
      const { token } = await p; auth.setToken(token); qc.clear();
      const me = await qc.fetchQuery({ queryKey: ['me'], queryFn: api.me });
      nav(me.hasData ? '/dashboard' : '/connect');
    } catch (e) { setError(e); setBusy(false); }
  }

  return (
    <div className="ledger min-h-dvh grid lg:grid-cols-2">
      <div className="flex flex-col px-4 sm:px-10 py-8">
        <Link to="/"><Logo /></Link>
        <div className="flex-1 grid place-items-center py-10">
          <form className="w-full max-w-sm" noValidate onSubmit={(e) => { e.preventDefault(); finish(signup ? api.register(form) : api.login(form)); }}>
            <h1 className="text-[2.4rem]">{signup ? 'Create your account' : 'Welcome back'}</h1>
            <p className="text-ink-2 mt-2">{signup ? 'Two minutes to connect your history and see where your money goes.' : 'Your money map is waiting.'}</p>
            <div className="mt-8"><PaytmSignIn onToken={(token) => finish(Promise.resolve({ token }))} /></div>
            <div className="flex items-center gap-3 my-6 text-xs text-ink-3"><span className="h-px flex-1 bg-line" />or with email<span className="h-px flex-1 bg-line" /></div>
            <div className="grid gap-4">
              {signup && <label className="grid gap-1.5"><span className="label">Name</span><input className="field" value={form.name} onChange={set('name')} autoComplete="name" /></label>}
              <label className="grid gap-1.5"><span className="label">Email</span><input className="field" type="email" value={form.email} onChange={set('email')} autoComplete="email" /></label>
              <label className="grid gap-1.5"><span className="label">Password</span><input className="field" type="password" value={form.password} onChange={set('password')} autoComplete={signup ? 'new-password' : 'current-password'} />{signup && <span className="text-xs text-ink-3">At least 8 characters.</span>}</label>
              <ErrorNote error={error} />
              <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'One moment…' : signup ? 'Create account' : 'Sign in'}</button>
            </div>
            <p className="text-sm text-ink-3 mt-6">{signup ? <>Have an account? <Link className="text-link font-medium" to="/signin">Sign in</Link></> : <>New here? <Link className="text-link font-medium" to="/signup">Create an account</Link></>}</p>
          </form>
        </div>
      </div>
      <aside className="hidden lg:block relative isolate overflow-hidden border-l border-line" aria-hidden="true">
        <Ring segments={SAMPLE} variant="hero" interactive={false} className="-z-10" />
        <div className="absolute inset-x-0 bottom-0 p-12 pt-32" style={{ background: 'linear-gradient(transparent, var(--bg))' }}>
          <p className="text-[1.9rem] font-semibold tracking-[-0.035em] max-w-sm leading-tight">You can’t change<br /><span className="text-ink-3">what you can’t see.</span></p>
        </div>
      </aside>
    </div>
  );
}
