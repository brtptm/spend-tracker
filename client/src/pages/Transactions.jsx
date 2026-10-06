import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { FiSearch, FiTrash2, FiEdit2, FiMoreHorizontal } from 'react-icons/fi';
import { isToday, isYesterday, format } from 'date-fns';
import { api } from '../lib/api.js';
import { inr, dt, inrShort } from '../lib/format.js';
import { Spinner, ErrorNote, PageHead, Modal, Toast, CategoryIcon, Segmented } from '../components/ui.jsx';
import { CAT_COLORS, CAT_NAMES } from '../lib/cats.js';


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

function RowMenu({ onEdit, onDelete, label }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button className="w-8 h-8 grid place-items-center rounded-full text-ink-3 hover:text-ink hover:bg-surface-2 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity" aria-label={`Options for ${label}`} aria-expanded={open} onClick={() => setOpen((x) => !x)}><FiMoreHorizontal /></button>
      {open && (
        <div className="absolute right-0 top-9 z-20 glass rounded-xl p-1 w-44 text-sm shadow-2xl" role="menu" onMouseLeave={() => setOpen(false)}>
          <button role="menuitem" className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg hover:bg-surface-3" onClick={() => { setOpen(false); onEdit(); }}><FiEdit2 size={13} /> Change category</button>
          <button role="menuitem" className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg hover:bg-surface-3 text-negative" onClick={() => { setOpen(false); onDelete(); }}><FiTrash2 size={13} /> Delete</button>
        </div>
      )}
    </div>
  );
}

const dayLabel = (d) => (isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : format(d, Date.now() - d < 6 * 864e5 ? 'EEEE' : 'EEE, d MMM yyyy'));

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
      <PageHead title="Transactions" sub={first ? `${first.total.toLocaleString('en-IN')} payments · ${inrShort(first.totalAmount)} spent` : ' '} />
      <div className="flex flex-wrap gap-3 items-center">
        <label className="relative flex-1 min-w-[220px]"><span className="sr-only">Search</span><FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <input className="field !pl-10" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <Segmented label="Sort" value={sort} onChange={(v) => setParam('sort', v)} options={[['date_desc', 'Newest'], ['amount_desc', 'Largest'], ['date_asc', 'Oldest']]} />
      </div>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1" role="group" aria-label="Filter by category">
        <button className="chip shrink-0" aria-pressed={!category} onClick={() => setParam('category', '')}>All</button>
        {Object.entries(CAT_NAMES).map(([id, n]) => <button key={id} className="chip shrink-0" aria-pressed={category === id} onClick={() => setParam('category', id)}><span className="w-2 h-2 rounded-full" style={{ background: CAT_COLORS[id] }} />{n}</button>)}
      </div>
      {list.isLoading ? <Spinner /> : list.error ? <ErrorNote error={list.error} onRetry={list.refetch} /> : !rows.length ? (
        <p className="panel p-12 text-center text-ink-3">No payments match. Try a different search.</p>
      ) : (
        <div className="grid gap-6">
          {(sort.startsWith('date') ? Object.entries(rows.reduce((g, t) => { const k = t.timestamp.slice(0, 10); (g[k] ||= []).push(t); return g; }, {})) : [['all', rows]]).map(([day, items]) => (
            <section key={day}>
              {day !== 'all' && (
                <div className="flex items-baseline justify-between px-1 mb-2">
                  <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{dayLabel(new Date(items[0].timestamp))}</h2>
                  <span className="text-[13px] text-ink-3">{inr(items.filter((t) => t.status === 'completed').reduce((a, t) => a + t.amount, 0))}</span>
                </div>
              )}
              <ul className="panel !rounded-[18px] divide-y divide-line overflow-visible">
                {items.map((t) => (
                  <li key={t.transactionId} className="pl-4 pr-2 py-3 flex items-center gap-3.5 group">
                    <CategoryIcon id={t.categoryAssigned} color={CAT_COLORS[t.categoryAssigned]} size={15} />
                    <div className="min-w-0 flex-1">
                      <Link to={`/merchant/${t.merchantId || t.merchantName.toLowerCase().replace(/\W+/g, '-')}`} className="font-medium truncate block hover:underline">{t.merchantName}</Link>
                      <div className="text-[12.5px] text-ink-3 truncate">
                        {t.status === 'failed' ? <span className="text-negative">Failed · </span> : t.status === 'pending' ? <span className="text-warning">Pending · </span> : null}
                        {t.description || CAT_NAMES[t.categoryAssigned]}{t.categoryConfidence < 0.6 ? ' · needs review' : ''}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`num text-[15px] ${t.status === 'failed' ? 'line-through text-ink-3' : ''}`}>{inr(t.amount)}</div>
                      <div className="text-[11px] text-ink-3">{format(new Date(t.timestamp), 'h:mm a')} · {t.paymentMethod}</div>
                    </div>
                    <RowMenu label={t.merchantName} onEdit={() => setEdit(t)} onDelete={() => remove(t)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {list.hasNextPage && <div className="text-center"><button className="btn btn-ghost btn-sm" disabled={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>{list.isFetchingNextPage ? 'Loading…' : 'Show more'}</button></div>}
        </div>
      )}
    </div>
  );
}
