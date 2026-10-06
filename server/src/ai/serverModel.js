// In-process small model (llama.cpp via node-llama-cpp): the server-side twin of the browser's WebLLM.
// No external service: the GGUF file lives in server/data/models and runs on Metal/CUDA/Vulkan or CPU.
// Never downloads during a request — fetch it once with `pnpm --filter ./server model:pull`.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMAS } from './grounding.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const MODELS_DIR = path.resolve(__dirname, '..', '..', 'data', 'models');
export const MODEL_URI = process.env.SERVER_LLM_MODEL || 'hf:Qwen/Qwen2.5-1.5B-Instruct-GGUF:Q4_K_M';
const DISABLED = process.env.SERVER_LLM === 'off';
const TIMEOUT_MS = 60_000;

const state = { available: false, loaded: false, name: null, gpu: null, error: null, failures: 0 };
let llama = null, model = null, context = null, loading = null;
let queue = Promise.resolve(); // one generation at a time keeps memory bounded and latency predictable

export const serverModelStatus = () => ({ ready: state.available && !DISABLED, loaded: state.loaded, model: state.name, gpu: state.gpu, error: state.error });
const prettyName = (file) => (file.match(/Qwen[\d.]+-[\d.]+B/i)?.[0].replace('-', ' ') || path.basename(file, '.gguf'));

/** At startup: is the model file present? (Cheap — no load.) */
export async function initServerModel() {
  if (DISABLED) return serverModelStatus();
  try {
    const { resolveModelFile } = await import('node-llama-cpp');
    const file = await resolveModelFile(MODEL_URI, { directory: MODELS_DIR, download: false, cli: false });
    Object.assign(state, { available: true, file, name: prettyName(file) });
  } catch {
    state.available = false;
  }
  return serverModelStatus();
}

async function ensureLoaded() {
  if (context) return context;
  if (loading) return loading;
  loading = (async () => {
    const { getLlama } = await import('node-llama-cpp');
    llama ||= await getLlama();
    model = await llama.loadModel({ modelPath: state.file });
    context = await model.createContext({ contextSize: 4096 });
    Object.assign(state, { loaded: true, gpu: llama.gpu || 'cpu', error: null });
    return context;
  })().finally(() => { loading = null; });
  return loading;
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('Server model timed out')), ms))]);

/** Generate JSON for a promptFor() prompt (small-model task + schema-constrained decoding). */
export function serverModelJSON(prompt) {
  if (!serverModelStatus().ready) return Promise.reject(new Error('Server model not available'));
  const run = async () => {
    const ctx = await ensureLoaded();
    const { LlamaChatSession } = await import('node-llama-cpp');
    const sequence = ctx.getSequence();
    try {
      const session = new LlamaChatSession({ contextSequence: sequence, systemPrompt: prompt.system });
      const grammar = await llama.createGrammarForJsonSchema(SCHEMAS[prompt.kind]);
      const text = await withTimeout(session.prompt(prompt.task_small || prompt.task, { grammar, maxTokens: prompt.max_tokens, temperature: 0.3 }), TIMEOUT_MS);
      state.failures = 0;
      return grammar.parse(text);
    } catch (e) {
      // Stop routing traffic to a model that keeps failing (e.g. out of memory).
      if (++state.failures >= 3) { state.available = false; state.error = e.message; console.warn('[ai] Server model disabled after repeated failures:', e.message); }
      throw e;
    } finally {
      sequence.dispose();
    }
  };
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}
