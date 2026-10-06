// Guards for small-model output — run with `pnpm --filter ./server test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowedNumbers, grounded, checkSmallModelOutput } from '../src/ai/grounding.js';

const prompt = (kind) => ({
  kind, task: 'Facts: delivery fees ₹3,432 a month; food ₹25,319 vs ₹18,000 for similar users; saving ₹5,300.', task_small: '',
  base: kind === 'briefing'
    ? { headline: 'Rohan, you could keep ₹16,700 more every month.', summary: 'Your last 30 days came to ₹1,07,868.', observations: ['Food is 41% above similar users.'], personality: 'Convenience spender.' }
    : { answer: 'Fallback answer.', followUps: ['Where do I overspend?'] },
});

test('numbers from the input (and ×12) are allowed; invented ones are not', () => {
  const allowed = allowedNumbers(prompt('ask').task);
  assert.ok(grounded('Delivery fees cost you ₹3,432 a month.', allowed));
  assert.ok(grounded('That is ₹41,184 a year.', allowed)); // 3,432 × 12
  assert.ok(grounded('You order 76 times, mostly at 8 pm.', allowed)); // small counts are fine
  assert.equal(grounded('You could save ₹9,969 a month.', allowed), false);
  assert.equal(grounded('Food is ₹7,319 above average.', allowed), false); // derived differences are not trusted
});

test('instruction echoes and fragments are rejected; good text passes', () => {
  assert.throws(() => checkSmallModelOutput(prompt('ask'), { answer: 'Max 12 words', followUps: [] }));
  assert.throws(() => checkSmallModelOutput(prompt('ask'), { answer: 'Save ₹9,999 now by cancelling.', followUps: [] }));
  const ok = checkSmallModelOutput(prompt('ask'), { answer: 'Your delivery fees come to about ₹3,432 a month.', followUps: ['How can I cut them?', 'x'] });
  assert.equal(ok.answer, 'Your delivery fees come to about ₹3,432 a month.');
  assert.deepEqual(ok.followUps, ['How can I cut them?']); // junk follow-ups are dropped, good ones kept
  assert.deepEqual(checkSmallModelOutput(prompt('ask'), { answer: 'Your delivery fees come to about ₹3,432 a month.', followUps: ['x'] }).followUps, ['Where do I overspend?']); // none left → engine's
});

test('a briefing that only repeats the draft counts as a failure (so the next provider is used)', () => {
  const p = prompt('briefing');
  assert.throws(() => checkSmallModelOutput(p, { headline: 'Top 12 Words', summary: 'json', observations: [], personality: '' }));
  const d = checkSmallModelOutput(p, { headline: 'Rohan, ₹16,700 a month is yours to keep.', summary: 'You spent ₹1,07,868 in the last 30 days, mostly on food.', observations: ['Food runs 41% above similar users.'], personality: 'You value convenience over cost.' });
  assert.equal(d.headline, 'Rohan, ₹16,700 a month is yours to keep.');
});
