import os from 'node:os';
import Anthropic from '@anthropic-ai/sdk';

// Provider order: Claude API (ANTHROPIC_API_KEY) → Claude Agent SDK (local Claude Code
// login, e.g. a Pro/Max subscription) → built-in engine. AI_PROVIDER=api|agent-sdk|off forces one.
export const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5';
const forced = process.env.AI_DISABLED === '1' ? 'off' : (process.env.AI_PROVIDER || 'auto');
const useApi = forced === 'api' || (forced === 'auto' && Boolean(process.env.ANTHROPIC_API_KEY));
const client = useApi ? new Anthropic({ timeout: 120_000, maxRetries: 1 }) : null;
let fallbacksSupported = true;

// Agent SDK availability is confirmed by a tiny probe at startup (see probeAgentSdk).
const agentAllowed = !useApi && (forced === 'auto' || forced === 'agent-sdk');
let agentReady = false;
let agentFailures = 0;

export const aiStatus = () => {
  if (useApi) return { enabled: true, provider: 'api', model: MODEL };
  if (agentReady) return { enabled: true, provider: 'agent-sdk', model: MODEL };
  return { enabled: false, provider: 'engine', model: null };
};

const SYSTEM = `You are Spend Tracker's financial behaviour analyst for Indian Paytm users.
You read aggregated spending data and explain it like a smart, kind friend who is good with money.
Rules:
- Be specific: use the exact rupee amounts, merchants, counts and times you are given. Never invent numbers.
- Encouraging and non-judgemental. No moralising about "wasting" money.
- Suggestions must be small, concrete and doable this week.
- Use Indian Rupees (₹) with Indian digit grouping (₹1,20,000).
- Respond with a single JSON object only. No markdown fences, no commentary.`;

function extractJSON(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object in model output');
  return JSON.parse(cleaned.slice(start, end + 1));
}

async function send(params) {
  if (fallbacksSupported) {
    try {
      // Server-side refusal fallback: a declined request is retried on a suitable model in the same call.
      return await client.beta.messages
        .stream({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
        .finalMessage();
    } catch (err) {
      if (!(err instanceof Anthropic.BadRequestError)) throw err;
      fallbacksSupported = false; // account/region without the beta — use the plain endpoint from now on
    }
  }
  return client.messages.stream(params).finalMessage();
}

// ------------------------------------------------------------- Agent SDK path

/** One-shot, tool-less Claude Code call through the Agent SDK. Returns the final text. */
async function agentText(prompt, { effort = 'low', timeoutMs = 150_000 } = {}) {
  const { query } = await import('@anthropic-ai/claude-agent-sdk');
  const abortController = new AbortController();
  const timer = setTimeout(() => abortController.abort(), timeoutMs);
  try {
    const q = query({
      prompt,
      options: {
        systemPrompt: SYSTEM,
        model: MODEL,
        effort,
        tools: [],               // pure text generation: no file, shell or web access
        maxTurns: 1,
        settingSources: [],      // don't load the user's CLAUDE.md, hooks or plugins
        persistSession: false,
        permissionMode: 'dontAsk',
        cwd: os.tmpdir(),
        abortController,
        env: { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: 'spend-tracker/1.0' },
      },
    });
    for await (const m of q) {
      if (m.type !== 'result') continue;
      if (m.subtype === 'success' && !m.is_error) return m.result;
      throw new Error(`Agent SDK ${m.subtype}${m.result ? `: ${String(m.result).slice(0, 160)}` : ''}`);
    }
    throw new Error('Agent SDK returned no result');
  } finally {
    clearTimeout(timer);
  }
}

/** Check once at startup whether a local Claude Code login can serve requests. */
export async function probeAgentSdk() {
  if (!agentAllowed || process.env.AGENT_SDK_PROBE === '0') {
    if (agentAllowed) agentReady = true; // trust it without probing
    return aiStatus();
  }
  try {
    const out = await agentText('Reply with exactly: {"ok":true}', { timeoutMs: 60_000 });
    agentReady = /"ok"\s*:\s*true/.test(out);
  } catch (err) {
    console.warn(`[ai] Claude Agent SDK unavailable (${err.message.split('\n')[0]}). Using the built-in engine.`);
  }
  return aiStatus();
}

/** Ask Claude for a JSON object. Throws on any failure so callers can fall back. */
export async function askJSON(task, { effort = 'low', maxTokens = 8000 } = {}) {
  if (!client && agentReady) {
    try {
      const out = extractJSON(await agentText(task, { effort }));
      agentFailures = 0;
      return out;
    } catch (err) {
      // Stop sending traffic to a broken login after repeated failures.
      if (++agentFailures >= 3) { agentReady = false; console.warn('[ai] Agent SDK disabled after repeated failures.'); }
      throw err;
    }
  }
  if (!client) throw new Error('AI disabled');
  const msg = await send({
    model: MODEL,
    max_tokens: maxTokens,
    system: SYSTEM,
    output_config: { effort },
    messages: [{ role: 'user', content: task }],
  });
  if (msg.stop_reason === 'refusal') throw new Error('Model declined the request');
  if (msg.stop_reason === 'max_tokens') throw new Error('Model output truncated');
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return extractJSON(text);
}

// ------------------------------------------------------------- small cache

const cache = new Map();
const TTL = 60 * 60 * 1000;
export async function cached(key, fn) {
  const hit = cache.get(key);
  if (hit && hit.exp > Date.now()) return hit.value;
  const value = await fn();
  cache.set(key, { value, exp: Date.now() + TTL });
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return value;
}
