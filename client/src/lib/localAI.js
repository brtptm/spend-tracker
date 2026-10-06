// On-device AI (WebLLM): a small open model running in the browser on WebGPU. Used when Claude is
// unavailable, or always when the user prefers that their spending summary never leaves the device.
// The server still computes every number; the model only writes words over the same prompt Claude gets,
// and any rupee amount it writes that isn't in its input is rejected (small models invent numbers).
import { useSyncExternalStore } from 'react';
import { api } from './api.js';

// Tested on real data: 1.5B answers questions accurately in ~3–6 s; 0.5B is fine for rephrasing the
// briefing but mixes up figures when it has to reason, so 1.5B is the default.
export const MODELS = [
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 1.5B', tier: 'Recommended', sizeMB: 869, note: 'Accurate answers to your questions. A few seconds per reply.' },
  { id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC', name: 'Qwen2.5 0.5B', tier: 'Lite', sizeMB: 278, note: 'Smallest download. Good for the briefing; weaker at questions.' },
];
const KEY = 'st-local-ai';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const saved = read();

let state = {
  supported: null, reason: '',                        // WebGPU availability
  enabled: !!saved.enabled, prefer: !!saved.prefer,  // user settings
  model: MODELS.some((m) => m.id === saved.model) ? saved.model : MODELS[0].id,
  status: 'idle', progress: 0, detail: '', error: '', // idle | loading | ready | error
  cached: {},                                         // model id → downloaded?
};
const subs = new Set();
const set = (patch) => {
  state = { ...state, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify({ enabled: state.enabled, prefer: state.prefer, model: state.model })); } catch { /* storage blocked */ }
  subs.forEach((f) => f());
};
const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };
export const useLocalAI = () => useSyncExternalStore(subscribe, () => state);
export const localAI = () => state;

const lib = () => import('@mlc-ai/web-llm');
export const modelInfo = (id = state.model) => MODELS.find((m) => m.id === id);

export async function checkSupport() {
  if (state.supported !== null) return state.supported;
  if (!('gpu' in navigator)) { set({ supported: false, reason: 'This browser has no WebGPU. Use a recent Chrome, Edge or Safari on a laptop or desktop.' }); return false; }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('No GPU adapter');
    set({ supported: true, reason: '' });
  } catch { set({ supported: false, reason: 'WebGPU is available but no compatible GPU was found on this device.' }); }
  return state.supported;
}

export async function refreshCached() {
  try {
    const { hasModelInCache } = await lib();
    const cached = {};
    for (const m of MODELS) cached[m.id] = await hasModelInCache(m.id);
    set({ cached });
  } catch { /* cache API unavailable */ }
}

let engine = null, loadedId = null, loading = null;
/** Download (first time) and load the chosen model into the GPU. Safe to call repeatedly. */
export function load() {
  if (engine && loadedId === state.model) return Promise.resolve(engine);
  if (loading) return loading;
  const id = state.model;
  loading = (async () => {
    if (!(await checkSupport())) throw new Error(state.reason);
    set({ status: 'loading', progress: 0, detail: 'Starting…', error: '' });
    try {
      const { CreateWebWorkerMLCEngine } = await lib();
      if (engine) { await engine.unload().catch(() => {}); engine = null; }
      engine = await CreateWebWorkerMLCEngine(new Worker(new URL('./llm.worker.js', import.meta.url), { type: 'module' }), id, {
        initProgressCallback: (p) => set({ progress: p.progress ?? 0, detail: p.text || '' }),
      });
      loadedId = id;
      set({ status: 'ready', progress: 1, detail: '' });
      refreshCached();
      return engine;
    } catch (e) {
      engine = null; loadedId = null;
      set({ status: 'error', error: e?.message || String(e) });
      throw e;
    } finally { loading = null; }
  })();
  return loading;
}

export async function removeModel(id = state.model) {
  const { deleteModelAllInfoInCache } = await lib();
  if (loadedId === id && engine) { await engine.unload().catch(() => {}); engine = null; loadedId = null; set({ status: 'idle' }); }
  await deleteModelAllInfoInCache(id);
  await refreshCached();
}

export function configure(patch) {
  const switching = patch.model && patch.model !== state.model;
  set(patch);
  if (switching && state.status === 'ready') set({ status: 'idle' });
  if (patch.enabled === false && engine) { engine.unload().catch(() => {}); engine = null; loadedId = null; set({ status: 'idle' }); }
}

/** Use on-device AI for this response? Only when enabled and the model is already downloaded (no surprise downloads). */
export const shouldUseLocal = (serverSource) => state.enabled && state.cached[state.model] && (state.prefer || serverSource !== 'claude');

// ── Grounding: every money-like number the model writes must come from its input ──
const NUM = /₹\s?\d[\d,]*(?:\.\d+)?|\b\d{1,3}(?:,\d{2,3})+(?:\.\d+)?\b|\b\d{3,}(?:\.\d+)?\b/g;
const toNum = (s) => Number(s.replace(/[₹,\s]/g, ''));
function allowedNumbers(...sources) {
  const out = new Set();
  for (const src of sources) for (const m of String(src).matchAll(/\d[\d,]*(?:\.\d+)?/g)) { const n = toNum(m[0]); if (Number.isFinite(n)) { out.add(Math.round(n)); out.add(Math.round(n * 12)); } }
  return [...out];
}
function grounded(text, allowed) {
  for (const m of String(text).matchAll(NUM)) {
    const n = toNum(m[0]);
    if (!Number.isFinite(n) || (n < 100 && !m[0].includes('₹'))) continue; // counts, hours and dates are fine
    if (!allowed.some((a) => Math.abs(a - n) <= Math.max(1, a * 0.01))) return false;
  }
  return true;
}

// Constrained decoding: the model can only emit these shapes (WebLLM's JSON mode needs a schema string).
const S = { type: 'string' }, LIST = { type: 'array', items: S };
const SCHEMAS = {
  briefing: { type: 'object', properties: { headline: S, summary: S, observations: LIST, personality: S }, required: ['headline', 'summary', 'observations', 'personality'] },
  ask: { type: 'object', properties: { answer: S, followUps: LIST }, required: ['answer', 'followUps'] },
};

/** Run a prompt from /api/analysis/ai/prompt on the device. Returns { data, source, model, rejected }. */
export async function generate(prompt) {
  const eng = await load();
  const t0 = performance.now();
  const r = await eng.chat.completions.create({
    messages: [{ role: 'system', content: prompt.system }, { role: 'user', content: prompt.task_small || prompt.task }],
    temperature: 0.3, max_tokens: prompt.max_tokens, response_format: { type: 'json_object', schema: JSON.stringify(SCHEMAS[prompt.kind]) },
  });
  let out = {};
  try { out = JSON.parse(r.choices[0].message.content || '{}'); } catch { out = {}; }
  const allowed = allowedNumbers(prompt.task, prompt.task_small || '', JSON.stringify(prompt.base));
  const base = prompt.base;
  let rejected = 0;
  // Reject made-up numbers, instruction echoes ("max 12 words") and fragments too short to mean anything.
  const ECHO = /\b(\d+\s+words?|sentences?|json|headline|observations?|personality|field|placeholder)\b/i;
  const ok = (x, minWords) => typeof x === 'string' && x.trim().split(/\s+/).length >= minWords && !ECHO.test(x) && grounded(x, allowed);
  const pick = (v, fb, minWords = 4) => { if (ok(v, minWords)) return v.trim(); if (typeof v === 'string' && v.trim()) rejected++; return fb; };
  const list = (v, fb, max) => { const good = (Array.isArray(v) ? v : []).filter((x) => ok(x, 4) || (typeof x === 'string' && x.trim() && (rejected++, false))); return (good.length ? good : fb).slice(0, max); };
  const model = modelInfo(loadedId)?.name, ms = Math.round(performance.now() - t0);
  if (prompt.kind === 'briefing') {
    const data = { headline: pick(out.headline, base.headline), summary: pick(out.summary, base.summary), observations: list(out.observations, base.observations, 4), personality: pick(out.personality, base.personality) };
    // Only credit the model if its own words survived the checks.
    const own = data.headline !== base.headline || data.summary !== base.summary;
    return { data, source: own ? 'on-device' : 'engine', model, ms, rejected };
  }
  const answer = pick(out.answer, null, 5);
  if (!answer) {
    // Held back rather than show a guess; say so plainly.
    return { data: { answer: 'The on-device model couldn’t answer that reliably, so I’m not going to guess. Try rephrasing it, or open the dashboard for the full breakdown.', followUps: base.followUps }, source: 'engine', model, ms, rejected };
  }
  return { data: { answer, followUps: list(out.followUps, base.followUps, 3) }, source: 'on-device', model, ms, rejected };
}

/** Fetch the shared prompt, generate on the device and cache the result in this browser by the server's cache key. */
export async function onDevice(kind, question, model = state.model) {
  const prompt = await api.aiPrompt(kind, question);
  const k = `st-ai-v4-${kind}-${model}-${prompt.cache_key}`; // bump v when prompts change
  try { const hit = JSON.parse(localStorage.getItem(k)); if (hit) return hit; } catch { /* ignore */ }
  try {
    const r = { ...(await generate(prompt)), generatedAt: new Date().toISOString() };
    try { localStorage.setItem(k, JSON.stringify(r)); } catch { /* quota */ }
    return r;
  } catch (e) {
    console.warn('[on-device AI] generation failed, using engine text:', e);
    return { data: prompt.base, source: 'engine', error: e?.message || String(e) };
  }
}
