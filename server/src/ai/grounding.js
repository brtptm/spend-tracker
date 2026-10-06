// Guards for small models: they phrase well but invent or misplace numbers and echo instructions.
// Every money-like figure in their output must come from the input (or be its yearly ×12).
const NUM = /₹\s?\d[\d,]*(?:\.\d+)?|\b\d{1,3}(?:,\d{2,3})+(?:\.\d+)?\b|\b\d{3,}(?:\.\d+)?\b/g;
const toNum = (s) => Number(String(s).replace(/[₹,\s]/g, ''));

export function allowedNumbers(...sources) {
  const base = new Set();
  for (const src of sources) for (const m of String(src).matchAll(/\d[\d,]*(?:\.\d+)?/g)) { const n = Math.round(toNum(m[0])); if (Number.isFinite(n) && n > 0) base.add(n); }
  const nums = [...base];
  const out = new Set(nums);
  for (const n of nums) out.add(n * 12); // monthly → yearly
  // Deliberately no derived differences/sums: allowing them let invented figures slip through in testing.
  return [...out];
}

export function grounded(text, allowed) {
  for (const m of String(text).matchAll(NUM)) {
    const n = toNum(m[0]);
    if (!Number.isFinite(n) || (n < 100 && !m[0].includes('₹'))) continue; // counts, hours and dates are fine
    if (!allowed.some((a) => Math.abs(a - n) <= Math.max(1, a * 0.01))) return false;
  }
  return true;
}

const ECHO = /\b(\d+\s+words?|sentences?|json|headline|observations?|personality|field|placeholder)\b/i;

/** Apply the guards to a small model's JSON for a prompt from promptFor(). Throws when the main text fails. */
export function checkSmallModelOutput(prompt, out) {
  const allowed = allowedNumbers(prompt.task, prompt.task_small || '', JSON.stringify(prompt.base));
  const ok = (x, minWords) => typeof x === 'string' && x.trim().split(/\s+/).length >= minWords && !ECHO.test(x) && grounded(x, allowed);
  const pick = (v, fb, minWords = 4) => (ok(v, minWords) ? v.trim() : fb);
  const list = (v, fb, max) => { const good = (Array.isArray(v) ? v : []).filter((x) => ok(x, 4)); return (good.length ? good : fb).slice(0, max); };
  const base = prompt.base;
  if (prompt.kind === 'briefing') {
    const data = { headline: pick(out.headline, base.headline), summary: pick(out.summary, base.summary), observations: list(out.observations, base.observations, 4), personality: pick(out.personality, base.personality) };
    if (data.headline === base.headline && data.summary === base.summary) throw new Error('Small-model output failed the checks');
    return data;
  }
  const answer = pick(out.answer, null, 5);
  if (!answer) throw new Error('Small-model answer failed the checks');
  return { answer, followUps: list(out.followUps, base.followUps, 3) };
}

export const SCHEMAS = {
  briefing: { type: 'object', properties: { headline: { type: 'string' }, summary: { type: 'string' }, observations: { type: 'array', items: { type: 'string' } }, personality: { type: 'string' } }, required: ['headline', 'summary', 'observations', 'personality'] },
  ask: { type: 'object', properties: { answer: { type: 'string' }, followUps: { type: 'array', items: { type: 'string' } } }, required: ['answer', 'followUps'] },
};
