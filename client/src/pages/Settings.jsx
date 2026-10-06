import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { FiDownload, FiTrash2, FiRefreshCw } from 'react-icons/fi';
import { api, auth, useMe, useHealth } from '../lib/api.js';
import { useTheme } from '../lib/theme.js';
import { PageHead, Segmented, ErrorNote, Toast } from '../components/ui.jsx';
import { useSignOut } from '../components/Shell.jsx';
import OnDeviceAI from '../components/OnDeviceAI.jsx';

function Toggle({ label, hint, checked, onChange }) {
  return (
    <label className="flex items-start justify-between gap-4 py-4 cursor-pointer">
      <span><span className="font-semibold block">{label}</span>{hint && <span className="text-sm text-ink-3">{hint}</span>}</span>
      <span className="relative shrink-0 mt-1">
        <input type="checkbox" className="peer sr-only" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="block w-11 h-6 rounded-full bg-surface-3 border border-line transition-colors peer-checked:bg-[var(--positive)] peer-checked:border-[var(--positive)] peer-focus-visible:outline-2 peer-focus-visible:outline-[var(--link)]" />
        <span className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export default function Settings() {
  const { data: me } = useMe();
  const { data: health } = useHealth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const signOut = useSignOut();
  const [theme, setTheme] = useTheme();
  const [form, setForm] = useState(null);
  const [toast, setToast] = useState('');
  const [error, setError] = useState(null);
  useEffect(() => { if (me?.user && !form) setForm({ name: me.user.name, city: me.user.city || '', income: me.user.income || '', age: me.user.age || '', household: me.user.household || '' }); }, [me, form]);
  if (!me || !form) return null;
  const u = me.user;
  const isDemo = u.email.endsWith('@demo.spendtracker.app');

  async function save(patch, msg = 'Saved') {
    setError(null);
    try { await api.settings(patch); await qc.invalidateQueries(); setToast(msg); } catch (e) { setError(e); }
  }

  return (
    <div className="grid gap-6 max-w-3xl">
      <Toast message={toast} onDone={() => setToast('')} />
      <PageHead title="Settings" sub={u.email} />
      <ErrorNote error={error} />

      <section className="panel p-6">
        <h2 className="text-xl">Profile</h2>
        <p className="text-sm text-ink-3 mt-1">Income is used only to pick a fair comparison group.</p>
        <form className="mt-5 grid sm:grid-cols-2 gap-4" onSubmit={(e) => { e.preventDefault(); save({ ...form, income: form.income === '' ? null : Number(form.income), age: form.age === '' ? null : Number(form.age) }, 'Profile saved'); }}>
          {[['name', 'Name'], ['city', 'City'], ['income', 'Monthly income (₹)', 'number'], ['age', 'Age', 'number'], ['household', 'Household']].map(([k, l, type]) => (
            <label key={k} className="grid gap-1.5"><span className="label">{l}</span><input className="field" type={type || 'text'} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} /></label>
          ))}
          <div className="sm:col-span-2"><button className="btn btn-primary btn-sm">Save profile</button></div>
        </form>
      </section>

      <section className="panel p-6">
        <h2 className="text-xl">Privacy</h2>
        <div className="divide-y divide-line mt-2">
          <Toggle label="Share spending insights with Paytm" hint="Lets Paytm use your spending profile for offers in the Paytm app. When off, partner APIs return 403 for you." checked={u.consentPartner} onChange={(v) => save({ consentPartner: v }, v ? 'Sharing turned on' : 'Sharing turned off')} />
          <Toggle label="Personalised offers" hint="Rank offers by how you spend. When off, you’ll see general offers only." checked={u.adPersonalization} onChange={(v) => save({ adPersonalization: v })} />
        </div>
        <p className="text-sm text-ink-3 mt-3">{health?.ai?.enabled ? `Insights are written by Claude (${health.ai.provider === 'agent-sdk' ? 'via local Claude Code login' : 'API'}). Only aggregated totals are sent — never raw transactions.` : 'Claude isn’t available right now. Turn on on-device AI below, or insights use the built-in engine.'}</p>
      </section>

      <OnDeviceAI />

      <section className="panel p-6">
        <h2 className="text-xl">Alerts</h2>
        <div className="divide-y divide-line mt-2">
          {[['budgetAlerts', 'Budget pace', 'When a category is on track to go over budget.'], ['unusualSpending', 'Unusual spending', 'Spikes, duplicates and late-night payments.'], ['dealAlerts', 'Deals that match you', 'At most one a week.'], ['weeklySummary', 'Weekly summary', 'Every Sunday.']].map(([k, l, h]) => (
            <Toggle key={k} label={l} hint={h} checked={u.settings[k] !== false} onChange={(v) => save({ [k]: v })} />
          ))}
        </div>
      </section>

      <section className="panel p-6 grid gap-5">
        <div><h2 className="text-xl">Data</h2><p className="text-sm text-ink-3 mt-1">Source: {u.dataSource === 'csv' ? 'CSV upload' : 'Paytm history (simulated)'}</p></div>
        <div className="flex flex-wrap items-center gap-3"><span className="text-sm text-ink-2">Analysis window</span><Segmented label="Window" value={String(u.periodMonths)} onChange={(v) => save({ periodMonths: Number(v) })} options={[['3', '3 months'], ['6', '6 months'], ['12', '12 months']]} /></div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost btn-sm" onClick={() => api.download('/export/csv', 'spend-tracker.csv')}><FiDownload /> Export CSV</button>
          <button className="btn btn-ghost btn-sm" onClick={() => api.download('/export/pdf', 'spend-tracker-monthly.pdf')}><FiDownload /> Monthly PDF</button>
          <button className="btn btn-ghost btn-sm" onClick={() => api.download('/export/pdf?kind=annual', 'spend-tracker-annual.pdf')}><FiDownload /> Annual PDF</button>
          {!isDemo && <Link to="/connect" className="btn btn-ghost btn-sm"><FiRefreshCw /> Reconnect data</Link>}
        </div>
      </section>

      <section className="panel p-6">
        <h2 className="text-xl">Appearance</h2>
        <div className="mt-4"><Segmented label="Theme" value={theme} onChange={setTheme} options={[['dark', 'Dark'], ['light', 'Light'], ['system', 'System']]} /></div>
      </section>

      <section className="flex flex-wrap gap-3">
        <button className="btn btn-ghost" onClick={signOut}>Sign out</button>
        {!isDemo && <button className="btn btn-ghost" style={{ color: 'var(--coral)' }} onClick={async () => { if (!confirm('Delete your account and all data? This cannot be undone.')) return; await api.deleteAccount(); auth.setToken(null); qc.clear(); nav('/'); }}><FiTrash2 /> Delete account</button>}
      </section>
    </div>
  );
}
