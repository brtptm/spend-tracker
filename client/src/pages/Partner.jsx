import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { FiPlay, FiCopy, FiCheck, FiLock } from 'react-icons/fi';
import { api, useMe } from '../lib/api.js';
import { inr } from '../lib/format.js';
import { PageHead } from '../components/ui.jsx';

const DEMO_KEY = 'demo-paytm-partner-key';
const EPS = [
  { id: 'summary', method: 'GET', path: (u) => `/user/${u}/spending-summary`, label: 'Spending summary', desc: 'Monthly total, tier, top category and merchants.' },
  { id: 'cats', method: 'GET', path: (u) => `/user/${u}/category-breakdown`, label: 'Category breakdown', desc: 'Monthly average per category (last 3 months).' },
  { id: 'merchants', method: 'GET', path: (u) => `/user/${u}/merchant-behavior`, label: 'Merchant behaviour', desc: 'Preferred merchants, frequency, loyalty and price sensitivity.' },
  { id: 'profile', method: 'GET', path: (u) => `/user/${u}/behavioral-profile`, label: 'Behavioural profile', desc: 'Spender type, discount sensitivity, churn risk, LTV.' },
  { id: 'ads', method: 'GET', path: (u) => `/user/${u}/ad-recommendations`, label: 'Ad recommendations', desc: 'Offers by relevance tier with expected conversion and CPM.' },
  { id: 'ads-ai', method: 'GET', path: (u) => `/user/${u}/ad-recommendations?ai=1`, label: 'Ad strategy (AI)', desc: 'Adds a Claude-written ad persona and placement strategy.' },
  { id: 'segment', method: 'GET', path: () => '/users/segment/high_food_spenders', label: 'Segment: high food spenders', desc: 'Aggregated behaviour across consented users only.' },
  { id: 'feedback', method: 'POST', path: () => '/feedback/ad-performance', label: 'Report ad performance', desc: 'Send impressions, clicks and conversions back.', body: (u) => ({ ad_id: 'swiggy-one', user_id: u, shown: true, clicked: true, converted: true, conversion_amount: 450 }) },
  { id: 'perf', method: 'GET', path: () => '/ads/performance', label: 'Network ad performance', desc: 'CTR, conversions and effective CPM across all campaigns.' },
];

function Json({ value }) {
  const html = JSON.stringify(value, null, 2)
    .replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
    .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g, (m) => {
      const color = /^"/.test(m) ? (/:$/.test(m) ? 'var(--cyan-text)' : 'var(--lime-text)') : /true|false|null/.test(m) ? 'var(--amber)' : 'var(--ink)';
      return `<span style="color:${color}">${m}</span>`;
    });
  return <pre className="text-[12.5px] leading-relaxed overflow-auto max-h-[460px] p-4 rounded-xl bg-bg border border-line" dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function Partner() {
  const { data: me } = useMe();
  const [key, setKey] = useState(DEMO_KEY);
  const [userId, setUserId] = useState('');
  const [sel, setSel] = useState(EPS[0]);
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const uid = userId || me?.user?.id || '';
  const perf = useQuery({ queryKey: ['partner-perf', key], queryFn: () => api.partner('/ads/performance', key), retry: false });

  async function run(ep = sel) {
    setSel(ep); setBusy(true);
    const t0 = performance.now();
    try { const data = await api.partner(ep.path(uid), key, { method: ep.method, data: ep.body?.(uid) }); setRes({ ok: true, data, ms: Math.round(performance.now() - t0) }); }
    catch (e) { setRes({ ok: false, data: { error: e.message }, status: e.status, ms: Math.round(performance.now() - t0) }); }
    finally { setBusy(false); }
  }
  const curl = `curl ${sel.method === 'POST' ? `-X POST -H 'content-type: application/json' -d '${JSON.stringify(sel.body?.(uid))}' ` : ''}-H 'x-api-key: ${key}' ${location.origin}/api/paytm${sel.path(uid)}`;
  const copy = async () => { try { await navigator.clipboard.writeText(curl); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} };
  const t = perf.data?.totals;

  return (
    <div className="grid grid-cols-1 gap-6">
      <PageHead title="Paytm partner API" sub="What Paytm sees — only for users who opted in. Try the endpoints live." />
      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[['Impressions', t?.views ?? '—'], ['Click-through', t ? `${(t.ctr * 100).toFixed(1)}%` : '—', t ? `vs ${(t.industryCtrBaseline * 100).toFixed(1)}% industry` : ''], ['Conversions', t?.conversions ?? '—', t ? `${(t.conversionRate * 100).toFixed(0)}% of clicks` : ''], ['Revenue / 1,000 views', t ? inr(t.revenuePer1kViews) : '—', t ? `${inr(t.revenue)} total · CPM ${inr(t.revenueByModel.cpm)} · CPC ${inr(t.revenueByModel.cpc)} · CPA ${inr(t.revenueByModel.cpa)}` : '']].map(([l, v, s]) => (
          <div key={l} className="panel p-5"><div className="text-sm text-ink-3">{l}</div><div className="num text-2xl mt-1">{v}</div>{s && <div className="text-xs text-ink-3 mt-1">{s}</div>}</div>
        ))}
      </section>
      <p className="text-xs text-ink-3 -mt-3">Network stats from recorded impressions and clicks{perf.data?.includesSimulated ? ', including 30 days of simulated history for the demo profiles' : ''}.</p>

      <section className="panel p-5 flex flex-wrap items-center gap-3 text-sm">
        <FiLock className="text-cyan-text" />
        {me?.user?.consentPartner
          ? <span>You’ve <b>opted in</b> to sharing insights with Paytm.</span>
          : <span>You haven’t opted in — partner calls for your user ID return <b>403</b>.</span>}
        <Link to="/settings" className="text-link font-medium">Change in Settings</Link>
      </section>

      <section className="grid lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)] gap-5 items-start">
        <div className="panel p-5 grid gap-4">
          <label className="grid gap-1.5"><span className="label">x-api-key</span><input className="field font-mono text-sm" value={key} onChange={(e) => setKey(e.target.value)} /></label>
          <label className="grid gap-1.5"><span className="label">User ID</span><input className="field font-mono text-sm" value={userId} placeholder={me?.user?.id} onChange={(e) => setUserId(e.target.value)} /></label>
          <ul className="grid gap-1.5">
            {EPS.map((ep) => (
              <li key={ep.id}>
                <button onClick={() => run(ep)} className="w-full text-left rounded-xl px-3.5 py-3 border transition-colors" style={sel.id === ep.id ? { borderColor: 'var(--cyan)', background: 'var(--surface-2)' } : { borderColor: 'var(--line)' }}>
                  <div className="flex items-center gap-2"><span className="text-[10px] font-bold rounded px-1.5 py-0.5" style={{ background: ep.method === 'GET' ? 'color-mix(in srgb, var(--cyan) 20%, transparent)' : 'color-mix(in srgb, var(--lime) 22%, transparent)', color: ep.method === 'GET' ? 'var(--cyan-text)' : 'var(--lime-text)' }}>{ep.method}</span><span className="font-semibold text-sm">{ep.label}</span><FiPlay className="ml-auto text-ink-3" size={13} /></div>
                  <div className="text-xs text-ink-3 mt-1">{ep.desc}</div>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="panel p-5 grid gap-4 lg:sticky lg:top-6">
          <div className="flex items-center gap-2 min-w-0">
            <code className="text-xs text-ink-2 truncate flex-1">{sel.method} /api/paytm{sel.path(uid)}</code>
            <button className="btn btn-ghost btn-sm" onClick={copy}>{copied ? <FiCheck /> : <FiCopy />} curl</button>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run()}><FiPlay /> {busy ? 'Running…' : 'Run'}</button>
          </div>
          {res ? (
            <>
              <div className="text-xs flex gap-3"><span style={{ color: res.ok ? 'var(--lime-text)' : 'var(--coral)' }} className="font-semibold">{res.ok ? '200 OK' : `${res.status || 'Error'}`}</span><span className="text-ink-3">{res.ms} ms</span></div>
              <Json value={res.data} />
            </>
          ) : <p className="text-ink-3 text-sm p-8 text-center">Pick an endpoint to see the live response.</p>}
        </div>
      </section>
    </div>
  );
}
