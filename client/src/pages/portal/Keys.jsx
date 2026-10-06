import { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FiPlus, FiAlertTriangle } from 'react-icons/fi';
import { PiKeyLight } from 'react-icons/pi';
import { portal } from '../../lib/portalApi.js';
import { Toast, ErrorNote, Skeleton } from '../../components/ui.jsx';
import { ago, dt } from '../../lib/format.js';
import { PageTitle, Chip, CopyButton, Dialog } from './common.jsx';

function CreateKey({ scopes, onClose, onCreated }) {
  const all = Object.keys(scopes);
  const [name, setName] = useState('');
  const [picked, setPicked] = useState(new Set(all));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);
  const toggle = (s) => setPicked((p) => { const n = new Set(p); n.has(s) ? n.delete(s) : n.add(s); return n; });
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError(null);
    try { const r = await portal.createKey(name.trim(), [...picked]); setCreated(r); onCreated(); }
    catch (err) { setError(err); } finally { setBusy(false); }
  }
  if (created) {
    return (
      <Dialog title="Your new key" onClose={onClose}>
        <div className="rounded-2xl p-4 flex gap-3 text-[13.5px]" style={{ background: 'color-mix(in srgb, var(--warning) 12%, transparent)', color: 'var(--warning)' }}>
          <FiAlertTriangle className="mt-0.5 shrink-0" />
          <span>Copy this secret now and store it in your secrets manager. For your security it is <b>shown only once</b> — we keep only a hash.</span>
        </div>
        <div className="mt-5"><div className="label">{created.key.name}</div>
          <div className="mt-2 flex items-center gap-2 rounded-2xl border border-line bg-[var(--bg)] p-3">
            <code className="font-mono text-[13px] break-all flex-1 select-all" aria-label="API key secret">{created.secret}</code>
            <CopyButton text={created.secret} />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">{created.key.scopes.map((s) => <Chip key={s} mono dot={false}>{s}</Chip>)}</div>
        <pre className="mt-5 rounded-2xl bg-[var(--bg)] border border-line p-4 text-[12px] font-mono overflow-x-auto text-ink-2"><code>{`export STK_KEY="${created.secret}"`}</code></pre>
        <button className="btn btn-primary w-full mt-6" onClick={onClose}>I’ve stored it safely</button>
      </Dialog>
    );
  }
  return (
    <Dialog title="Create API key" onClose={onClose}>
      <form onSubmit={submit} className="grid gap-5">
        <label className="grid gap-1.5">
          <span className="label">Name</span>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Payments webhook (prod)" maxLength={60} autoFocus required />
          <span className="text-xs text-ink-3">Name it after the system that will use it, so you know what breaks if you revoke it.</span>
        </label>
        <fieldset>
          <legend className="label">Scopes</legend>
          <p className="text-xs text-ink-3 mt-1">Give each system the narrowest key it needs — a payment webhook only needs <span className="font-mono">transactions:write</span>.</p>
          <div className="mt-3 grid gap-2">
            {all.map((s) => (
              <label key={s} className={`flex items-start gap-3 rounded-2xl border px-3.5 py-3 cursor-pointer transition-colors ${picked.has(s) ? 'border-[var(--line-strong)] bg-surface-2' : 'border-line hover:bg-surface-2/60'}`}>
                <input type="checkbox" className="mt-1 accent-[var(--ink)]" checked={picked.has(s)} onChange={() => toggle(s)} />
                <span className="min-w-0"><span className="block font-mono text-[13px]">{s}</span><span className="block text-[12.5px] text-ink-3 mt-0.5">{scopes[s]}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
        <ErrorNote error={error} />
        <div className="flex gap-2 justify-end"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !name.trim() || !picked.size}>{busy ? 'Creating…' : 'Create key'}</button></div>
      </form>
    </Dialog>
  );
}

function RevokeKey({ k, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function go() { setBusy(true); setError(null); try { await portal.revokeKey(k.id); onDone(); } catch (e) { setError(e); setBusy(false); } }
  return (
    <Dialog title="Revoke key?" onClose={onClose}>
      <p className="text-[14.5px] text-ink-2"><b className="text-ink">{k.name}</b> (<span className="font-mono">{k.prefix}</span>) will stop working immediately. Any system using it will get <span className="font-mono">401 invalid_api_key</span>. This can’t be undone.</p>
      <div className="mt-4"><ErrorNote error={error} /></div>
      <div className="mt-6 flex gap-2 justify-end"><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn" style={{ background: 'var(--negative)', color: '#fff' }} onClick={go} disabled={busy}>{busy ? 'Revoking…' : 'Revoke key'}</button></div>
    </Dialog>
  );
}

export default function Keys() {
  const qc = useQueryClient();
  const keys = useQuery({ queryKey: ['portal-keys'], queryFn: portal.keys });
  const me = useQuery({ queryKey: ['portal-me'], queryFn: portal.me, staleTime: 5 * 60_000 });
  const [creating, setCreating] = useState(false);
  const [revoking, setRevoking] = useState(null);
  const [toast, setToast] = useState('');
  const refresh = () => { qc.invalidateQueries({ queryKey: ['portal-keys'] }); qc.invalidateQueries({ queryKey: ['portal-stats'] }); };
  const list = keys.data?.keys || [];
  const active = list.filter((k) => k.status === 'active');
  return (
    <>
      <Toast message={toast} onDone={() => setToast('')} />
      <PageTitle title="API keys" sub="Secret keys for the Partner API. Stored as SHA-256 hashes; each key carries only the scopes you give it."
        right={<button className="btn btn-primary" onClick={() => setCreating(true)} disabled={!me.data}><FiPlus /> Create key</button>} />
      {keys.isLoading ? <Skeleton h={260} className="!rounded-[22px]" /> : keys.error ? <ErrorNote error={keys.error} onRetry={keys.refetch} /> : !list.length ? (
        <div className="panel p-10 text-center">
          <span className="inline-grid place-items-center w-12 h-12 rounded-2xl bg-surface-2"><PiKeyLight size={22} /></span>
          <h2 className="text-lg mt-4">No keys yet</h2>
          <p className="text-sm text-ink-3 mt-1.5 max-w-sm mx-auto">Create a key for each system that sends payments or reads insights.</p>
          <button className="btn btn-primary mt-6" onClick={() => setCreating(true)} disabled={!me.data}><FiPlus /> Create key</button>
        </div>
      ) : (
        <section className="panel p-2 sm:p-3 min-w-0" aria-label="Keys">
          <div className="px-3 sm:px-4 pt-2 pb-1 text-[12px] text-ink-3">{active.length} active · {list.length - active.length} revoked</div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] min-w-[760px]">
              <thead><tr className="text-left text-[11.5px] text-ink-3 border-b border-line">
                <th className="font-medium py-2.5 px-3 sm:px-4">Name</th><th className="font-medium py-2.5 px-2">Key</th><th className="font-medium py-2.5 px-2">Scopes</th>
                <th className="font-medium py-2.5 px-2">Created</th><th className="font-medium py-2.5 px-2">Last used</th><th className="font-medium py-2.5 px-2">Status</th><th className="py-2.5 px-3" />
              </tr></thead>
              <tbody>
                {list.map((k) => (
                  <tr key={k.id} className={`border-b border-line last:border-0 ${k.status === 'revoked' ? 'opacity-55' : ''}`}>
                    <td className="py-3.5 px-3 sm:px-4 font-medium max-w-[220px] truncate">{k.name}</td>
                    <td className="py-3.5 px-2 font-mono text-[12px] whitespace-nowrap">{k.prefix}</td>
                    <td className="py-3.5 px-2"><div className="flex flex-wrap gap-1 max-w-[300px]">{k.scopes.map((s) => <Chip key={s} mono dot={false} className="!text-[10.5px]">{s}</Chip>)}</div></td>
                    <td className="py-3.5 px-2 whitespace-nowrap text-ink-2" title={dt(k.created_at, 'd MMM yyyy, h:mm a')}>{dt(k.created_at, 'd MMM yyyy')}</td>
                    <td className="py-3.5 px-2 whitespace-nowrap text-ink-2">{k.last_used_at ? ago(k.last_used_at) : <span className="text-ink-3">Never</span>}</td>
                    <td className="py-3.5 px-2">{k.status === 'active' ? <Chip color="var(--positive)">Active</Chip> : <Chip color="var(--ink-3)">Revoked {k.revoked_at ? ago(k.revoked_at) : ''}</Chip>}</td>
                    <td className="py-3.5 px-3 text-right">{k.status === 'active' && <button className="text-[12.5px] font-medium hover:underline-offset-2" style={{ color: 'var(--negative)' }} onClick={() => setRevoking(k)}>Revoke</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <AnimatePresence>
        {creating && me.data && <CreateKey scopes={me.data.scopes} onClose={() => setCreating(false)} onCreated={() => { refresh(); setToast('Key created'); }} />}
        {revoking && <RevokeKey k={revoking} onClose={() => setRevoking(null)} onDone={() => { setRevoking(null); refresh(); setToast('Key revoked'); }} />}
      </AnimatePresence>
    </>
  );
}
