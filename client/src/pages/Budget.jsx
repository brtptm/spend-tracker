import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FiTrash2 } from 'react-icons/fi';
import { api } from '../lib/api.js';
import { inr, inrShort } from '../lib/format.js';
import { Spinner, ErrorNote, PageHead, Bar, CategoryIcon, Toast } from '../components/ui.jsx';

const FEAS = { easy: ['Easy', 'var(--lime-text)'], moderate: ['Doable', 'var(--cyan-text)'], hard: ['Stretch', 'var(--amber)'], very_hard: ['Very hard', 'var(--coral)'] };
const STATUS = { on_track: ['On track', 'var(--lime)'], at_risk: ['At risk', 'var(--amber)'], over: ['Over budget', 'var(--coral)'] };

function feas(current, target) {
  if (!current || target >= current) return 'easy';
  const cut = (current - target) / current;
  return cut < 0.1 ? 'easy' : cut < 0.25 ? 'moderate' : cut < 0.4 ? 'hard' : 'very_hard';
}

export default function Budget() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['budget'], queryFn: api.budgetStatus });
  const sug = useQuery({ queryKey: ['budget-suggest'], queryFn: api.budgetSuggest });
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!sug.data || !status.data) return;
    const existing = Object.fromEntries(status.data.items.map((i) => [i.category, i.budget]));
    setDraft(Object.fromEntries(sug.data.suggestions.map((s) => [s.category, existing[s.category] ?? ''])));
  }, [sug.data, status.data]);

  if (status.isLoading || sug.isLoading) return <Spinner />;
  if (status.error) return <ErrorNote error={status.error} onRetry={status.refetch} />;
  const st = status.data;

  async function save() {
    setSaving(true); setError(null);
    try {
      const budgets = Object.entries(draft).filter(([, v]) => Number(v) >= 100).map(([category, amount]) => ({ category, amount: Number(amount) }));
      if (!budgets.length) throw new Error('Set at least one budget of ₹100 or more.');
      await api.budgetSave(budgets);
      setToast('Budgets saved'); qc.invalidateQueries();
    } catch (e) { setError(e); } finally { setSaving(false); }
  }
  const useSuggested = () => setDraft(Object.fromEntries(sug.data.suggestions.map((s) => [s.category, s.suggested])));

  return (
    <div className="grid gap-6">
      <Toast message={toast} onDone={() => setToast('')} />
      <PageHead title="Budget" sub={`Day ${st.dayOfMonth} of ${st.daysInMonth}. The white line shows where you should be by today.`} />
      {st.items.length > 0 && (
        <section className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
          {st.items.map((b) => { const [label, color] = STATUS[b.status]; return (
            <article key={b.category} className="panel p-5">
              <div className="flex items-center gap-3">
                <CategoryIcon id={b.category} color={b.color} size={18} />
                <div className="flex-1"><div className="font-semibold">{b.name}</div><div className="text-xs font-semibold" style={{ color }}>{label}</div></div>
                <button className="w-8 h-8 grid place-items-center rounded-full text-ink-3 hover:text-coral hover:bg-surface-2" aria-label={`Remove ${b.name} budget`} onClick={async () => { await api.budgetDelete(b.budgetId); qc.invalidateQueries(); }}><FiTrash2 /></button>
              </div>
              <div className="mt-4 flex items-baseline justify-between"><span className="num text-2xl">{inr(b.spent)}</span><span className="text-sm text-ink-3">of {inr(b.budget)}</span></div>
              <div className="mt-2"><Bar value={b.spent} max={b.budget} marker={b.expectedByToday} color={color} height={10} label={`${b.name} budget used`} /></div>
              <p className="text-sm text-ink-2 mt-3">{b.remaining >= 0 ? <>You can spend <b className="text-ink">{inr(b.dailyAllowance)}/day</b> for the rest of the month.</> : <>Over by <b style={{ color: 'var(--coral)' }}>{inr(-b.remaining)}</b>.</>} On pace for {inrShort(b.projected)}.</p>
            </article>
          ); })}
        </section>
      )}
      <section className="panel p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-xl">{st.items.length ? 'Adjust budgets' : 'Set your first budgets'}</h2><p className="text-sm text-ink-3 mt-1">Based on your last 3 months and your savings opportunities.</p></div>
          <button className="btn btn-ghost btn-sm" onClick={useSuggested}>Use suggested budgets</button>
        </div>
        <div className="mt-5 divide-y divide-line">
          {sug.data.suggestions.map((s) => { const level = feas(s.current, Number(draft[s.category]) || s.current); const [fl, fc] = FEAS[level]; return (
            <div key={s.category} className="py-4 grid sm:grid-cols-[1.4fr_1fr_1fr_auto] gap-3 items-center">
              <div className="flex items-center gap-3"><CategoryIcon id={s.category} color={s.color} size={17} /><div><div className="font-semibold">{s.name}</div><div className="text-xs text-ink-3">Now {inr(s.current)}/mo · similar users {inr(s.peerAverage)}</div></div></div>
              <div className="text-sm text-ink-2">Suggested <b className="text-ink num">{inr(s.suggested)}</b></div>
              <label className="relative"><span className="sr-only">{s.name} budget</span><span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">₹</span>
                <input className="field !pl-7" type="number" min="0" step="500" inputMode="numeric" value={draft[s.category] ?? ''} placeholder="No budget" onChange={(e) => setDraft((d) => ({ ...d, [s.category]: e.target.value }))} /></label>
              <span className="text-xs font-semibold w-20 text-right" style={{ color: draft[s.category] ? fc : 'var(--ink-3)' }}>{draft[s.category] ? fl : '—'}</span>
            </div>
          ); })}
        </div>
        <div className="mt-4"><ErrorNote error={error} /></div>
        <button className="btn btn-primary mt-4" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save budgets'}</button>
      </section>
    </div>
  );
}
