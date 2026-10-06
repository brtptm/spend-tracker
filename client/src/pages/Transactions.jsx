import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { FiSearch, FiTrash2, FiEdit2 } from 'react-icons/fi';
import { api } from '../lib/api.js';
import { inr, dt } from '../lib/format.js';
import { Spinner, ErrorNote, PageHead, Modal, Toast, CategoryIcon } from '../components/ui.jsx';
import { CAT_COLORS, CAT_NAMES } from '../lib/cats.js';

const SOURCE = { user: 'You', ai: 'Claude', rule: 'Auto' };

function Recategorize({ txn, categories, onClose, onSaved }) {
  const [cat, setCat] = useState(txn.categoryAssigned);
  const [sub, setSub] = useState(txn.subcategory);
  const [all, setAll] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const subs = categories.find((c) => c.id === cat)?.subcategories || [];
  useEffect(() => { if (!subs.some((s) => s.id === sub)) setSub(subs[0]?.id); }, [cat]); // eslint-disable-line
  async function save() { setBusy(true); try { await api.recategorize(txn.transactionId, { category: cat, subcategory: sub, applyToMerchant: all }); onSaved(all); } catch (e) { setError(e); setBusy(false); } }
  return (
    <Modal title={`Categorise ${txn.merchantName}`} onClose={onClose}>
      <p className="text-sm text-ink-2">{inr(txn.amount)} · {dt(txn.timestamp)} · currently <b>{CAT_NAMES[txn.categoryAssigned]}</b> ({Math.round(txn.categoryConfidence * 100)}% confident)</p>
      <div role="radiogroup" aria-label="Category" className="mt-5 grid grid-cols-2 gap-2">
        {categories.map((c) => (
          <button key={c.id} role="radio" aria-checked={cat === c.id} onClick={() => setCat(c.id)} className="flex items-center gap-2 panel-quiet px-3 py-2.5 text-sm text-left" style={cat === c.id ? { boxShadow: `0 0 0 2px ${c.color}` } : undefined}>
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />{c.name}
          </button>
        ))}
      </div>
      <label className="grid gap-1.5 mt-4"><span className="label">Subcategory</span>
        <select className="field" value={sub} onChange={(e) => setSub(e.target.value)}>{subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label className="flex items-start gap-3 mt-4 text-sm cursor-pointer"><input type="checkbox" className="mt-1 accent-[var(--lime)]" checked={all} onChange={(e) => setAll(e.target.checked)} /><span>Remember this for all <b>{txn.merchantName}</b> payments</span></label>
      <div className="mt-4"><ErrorNote error={error} /></div>
      <div className="mt-6 flex gap-3"><button className="btn btn-primary" disabled={busy} onClick={save}>Save</button><button className="btn btn-ghost" onClick={onClose}>Cancel</button></div>
    </Modal>
  );
}

export default function Transactions() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const [debounced, setDebounced] = useState(q);
  const [edit, setEdit] = useState(null);
  const [toast, setToast] = useState('');
  const category = params.get('category') || '';
  const sort = params.get('sort') || 'date_desc';
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(t); }, [q]);
  const cats = useQuery({ queryKey: ['categories'], queryFn: api.categories, staleTime: Infinity });
  const list = useInfiniteQuery({
    queryKey: ['txns', debounced, category, sort],
    queryFn: ({ pageParam = 0 }) => api.transactions({ q: debounced, category, sort, limit: 40, offset: pageParam }),
    getNextPageParam: (last, pages) => { const n = pages.reduce((s, p) => s + p.transactions.length, 0); return n < last.total ? n : undefined; },
    initialPageParam: 0,
  });
  const setParam = (k, v) => { const p = new URLSearchParams(params); v ? p.set(k, v) : p.delete(k); setParams(p, { replace: true }); };
  const rows = list.data?.pages.flatMap((p) => p.transactions) || [];
  const first = list.data?.pages[0];

  async function remove(t) {
    if (!confirm(`Delete this ${inr(t.amount)} payment to ${t.merchantName}? It will no longer count in your analysis.`)) return;
    await api.deleteTxn(t.transactionId); setToast('Payment removed'); qc.invalidateQueries();
  }

  return (
    <div className="grid gap-5">
      <Toast message={toast} onDone={() => setToast('')} />
      {edit && cats.data && <Recategorize txn={edit} categories={cats.data.categories} onClose={() => setEdit(null)} onSaved={(all) => { setEdit(null); setToast(all ? 'Saved — future payments will follow this' : 'Saved'); qc.invalidateQueries(); }} />}
      <PageHead title="Transactions" sub={first ? `${first.total.toLocaleString('en-IN')} payments · ${inr(first.totalAmount)} completed` : ' '} />
      <div className="flex flex-wrap gap-3 items-center">
        <label className="relative flex-1 min-w-[220px]"><span className="sr-only">Search</span><FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <input className="field !pl-10" placeholder="Search merchant, note or category" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <select className="field !w-auto" value={sort} onChange={(e) => setParam('sort', e.target.value)} aria-label="Sort">
          <option value="date_desc">Newest first</option><option value="date_asc">Oldest first</option><option value="amount_desc">Largest first</option><option value="amount_asc">Smallest first</option>
        </select>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter by category">
        <button className="chip shrink-0" aria-pressed={!category} onClick={() => setParam('category', '')}>All</button>
        {Object.entries(CAT_NAMES).map(([id, n]) => <button key={id} className="chip shrink-0" aria-pressed={category === id} onClick={() => setParam('category', id)}><span className="w-2 h-2 rounded-full" style={{ background: CAT_COLORS[id] }} />{n}</button>)}
      </div>
      {list.isLoading ? <Spinner /> : list.error ? <ErrorNote error={list.error} onRetry={list.refetch} /> : (
        <section className="panel">
          <ul className="divide-y divide-line">
            {rows.map((t) => (
              <li key={t.transactionId} className="px-4 sm:px-5 py-3.5 flex items-center gap-3.5 group">
                <CategoryIcon id={t.categoryAssigned} color={CAT_COLORS[t.categoryAssigned]} size={16} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><Link to={`/merchant/${t.merchantId || t.merchantName.toLowerCase().replace(/\W+/g, '-')}`} className="font-medium truncate hover:underline">{t.merchantName}</Link>{t.status !== 'completed' && <span className="text-[11px] rounded-full px-2 py-0.5" style={{ background: t.status === 'failed' ? 'color-mix(in srgb, var(--coral) 18%, transparent)' : 'var(--surface-3)', color: t.status === 'failed' ? 'var(--coral)' : 'var(--ink-2)' }}>{t.status}</span>}</div>
                  <div className="text-xs text-ink-3 truncate">{dt(t.timestamp)} · {t.paymentMethod} · {CAT_NAMES[t.categoryAssigned]}{t.categoryConfidence < 0.6 ? ' (needs review)' : ''} · {SOURCE[t.categorySource] || 'Auto'}{t.description ? ` · ${t.description}` : ''}</div>
                </div>
                <div className={`num text-right ${t.status === 'failed' ? 'line-through text-ink-3' : ''}`}>{inr(t.amount)}</div>
                <div className="flex opacity-60 group-hover:opacity-100 focus-within:opacity-100">
                  <button className="w-8 h-8 grid place-items-center rounded-full hover:bg-surface-2" aria-label={`Recategorise ${t.merchantName}`} onClick={() => setEdit(t)}><FiEdit2 size={14} /></button>
                  <button className="w-8 h-8 grid place-items-center rounded-full hover:bg-surface-2 hover:text-coral" aria-label={`Delete payment to ${t.merchantName}`} onClick={() => remove(t)}><FiTrash2 size={14} /></button>
                </div>
              </li>
            ))}
            {!rows.length && <li className="p-10 text-center text-ink-3">No payments match. Try a different search.</li>}
          </ul>
          {list.hasNextPage && <div className="p-4 border-t border-line text-center"><button className="btn btn-ghost btn-sm" disabled={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>{list.isFetchingNextPage ? 'Loading…' : 'Load more'}</button></div>}
        </section>
      )}
    </div>
  );
}
