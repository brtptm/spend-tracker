import { useEffect, useState } from 'react';
import { FiCheck, FiCpu, FiDownload, FiTrash2 } from 'react-icons/fi';
import { MODELS, useLocalAI, checkSupport, refreshCached, load, removeModel, configure, onDevice, modelInfo } from '../lib/localAI.js';
import { ErrorNote } from './ui.jsx';

function Switch({ label, hint, checked, onChange, disabled }) {
  return (
    <label className={`flex items-start justify-between gap-4 py-4 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <span><span className="font-semibold block">{label}</span>{hint && <span className="text-sm text-ink-3">{hint}</span>}</span>
      <span className="relative shrink-0 mt-1">
        <input type="checkbox" className="peer sr-only" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="block w-11 h-6 rounded-full bg-surface-3 border border-line transition-colors peer-checked:bg-[var(--positive)] peer-checked:border-[var(--positive)]" />
        <span className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

/** Settings card: opt in to a small model running in this browser (WebGPU), with download, test and removal. */
export default function OnDeviceAI() {
  const s = useLocalAI();
  const [trial, setTrial] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // WebGPU check is free; the model-cache check loads the WebLLM library, so only do it once the feature is on.
  useEffect(() => { checkSupport(); }, []);
  useEffect(() => { if (s.enabled) refreshCached(); }, [s.enabled]);
  const m = modelInfo();
  const downloaded = !!s.cached[s.model];

  async function download() { setError(null); try { await load(); } catch (e) { setError(e); } }
  async function tryIt() {
    setBusy(true); setError(null); setTrial(null);
    try { const t0 = performance.now(); const r = await onDevice('briefing'); setTrial({ ...r, ms: r.ms ?? Math.round(performance.now() - t0) }); }
    catch (e) { setError(e); } finally { setBusy(false); }
  }

  // Only offered where it can actually run: hidden while checking and on browsers without WebGPU.
  if (s.supported !== true) return null;
  return (
    <section className="panel p-6" aria-labelledby="ondevice-h">
      <div className="flex items-center gap-2.5">
        <FiCpu className="text-ink-2" aria-hidden="true" />
        <h2 id="ondevice-h" className="text-xl">On-device AI</h2>
        <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ color: 'var(--positive)', background: 'color-mix(in srgb, var(--positive) 12%, transparent)' }}>Private</span>
      </div>
      <p className="text-sm text-ink-3 mt-1.5 max-w-[62ch]">A small open model runs inside this browser on your GPU. It writes your briefing and answers when Claude isn’t available — or every time, if you’d rather your spending summary never leaves this device. Numbers still come from Spend Tracker; any amount the model makes up is thrown away.</p>

      {(
        <>
          <div className="divide-y divide-line mt-2">
            <Switch label="Use on-device AI" hint="Download once; it’s cached by the browser and works offline afterwards." checked={s.enabled} onChange={(v) => configure({ enabled: v })} />
            {s.enabled && <Switch label="Prefer on-device" hint="Don’t send your summary to Claude at all, even when it’s available." checked={s.prefer} onChange={(v) => configure({ prefer: v })} />}
          </div>

          {s.enabled && (
            <div className="mt-2 grid gap-3">
              <div className="grid sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Model">
                {MODELS.map((x) => {
                  const on = x.id === s.model;
                  return (
                    <button key={x.id} type="button" role="radio" aria-checked={on} onClick={() => configure({ model: x.id })}
                      className={`text-left rounded-2xl border p-4 transition-colors ${on ? 'border-[var(--line-strong)] bg-surface-2' : 'border-line hover:bg-surface-2'}`}>
                      <div className="flex items-center justify-between gap-2"><span className="font-semibold">{x.tier} · {x.name}</span>{s.cached[x.id] && <span className="inline-flex items-center gap-1 text-[11px] text-positive"><FiCheck /> Downloaded</span>}</div>
                      <div className="text-[12.5px] text-ink-3 mt-1">{x.sizeMB} MB · {x.note}</div>
                    </button>
                  );
                })}
              </div>

              {s.status === 'loading' ? (
                <div className="rounded-2xl bg-surface-2 p-4" role="status" aria-live="polite">
                  <div className="flex justify-between text-sm"><span>{downloaded ? 'Loading into your GPU…' : `Downloading ${m.name}…`}</span><span className="num">{Math.round(s.progress * 100)}%</span></div>
                  <div className="mt-2 h-1.5 rounded-full bg-fg/[.08] overflow-hidden"><div className="h-full rounded-full bg-[var(--positive)] transition-[width] duration-300" style={{ width: `${Math.max(2, s.progress * 100)}%` }} /></div>
                  {s.detail && <div className="mt-2 text-[11.5px] text-ink-3 truncate">{s.detail}</div>}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {!downloaded ? (
                    <button className="btn btn-primary btn-sm" onClick={download}><FiDownload /> Download {m.sizeMB} MB</button>
                  ) : (
                    <>
                      <button className="btn btn-primary btn-sm" disabled={busy} onClick={tryIt}>{busy ? 'Writing on your device…' : 'Try it: write my briefing'}</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => removeModel().catch(setError)}><FiTrash2 /> Remove model</button>
                    </>
                  )}
                  {s.status === 'ready' && <span className="text-xs text-ink-3">Loaded and ready</span>}
                </div>
              )}

              {trial && (
                <div className="rounded-2xl border border-line p-4">
                  <div className="flex items-center justify-between gap-3 text-[11.5px] text-ink-3"><span>{trial.source === 'on-device' ? `${trial.model} · ${(trial.ms / 1000).toFixed(1)} s on this device` : 'The model failed — showing the engine’s text'}{trial.rejected ? ` · ${trial.rejected} made-up figure${trial.rejected > 1 ? 's' : ''} removed` : ''}</span></div>
                  <div className="font-semibold mt-2">{trial.data.headline}</div>
                  <p className="text-sm text-ink-2 mt-1">{trial.data.summary}</p>
                </div>
              )}
              <ErrorNote error={error || (s.status === 'error' ? { message: `Couldn’t load the model: ${s.error}` } : null)} />
            </div>
          )}
        </>
      )}
    </section>
  );
}
