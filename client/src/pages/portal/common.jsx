import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { FiCopy, FiCheck, FiX } from 'react-icons/fi';
import { portal } from '../../lib/portalApi.js';
import { inr, dt, ago } from '../../lib/format.js';
import { Skeleton, ErrorNote } from '../../components/ui.jsx';

export const n = (v) => Math.round(Number(v) || 0).toLocaleString('en-IN');

/** Outcome colours used everywhere in the portal. */
export const OUTCOME = {
  accepted: { color: 'var(--positive)', label: 'Accepted' },
  updated: { color: 'var(--ink)', label: 'Updated' },
  duplicate: { color: 'var(--ink-3)', label: 'Duplicate' },
  duplicates: { color: 'var(--ink-3)', label: 'Duplicates' },
  filtered: { color: 'var(--warning)', label: 'Filtered' },
  rejected: { color: 'var(--negative)', label: 'Rejected' },
};

export function Chip({ color = 'var(--ink-2)', children, mono, dot = true, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap ${mono ? 'font-mono' : ''} ${className}`}
      style={{ color, background: `color-mix(in srgb, ${color} 13%, transparent)` }}>
      {dot && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />}{children}
    </span>
  );
}
export const StatusChip = ({ status }) => <Chip color={OUTCOME[status]?.color}>{OUTCOME[status]?.label || status}</Chip>;
export const KindChip = ({ kind }) => <Chip dot={false} mono color={kind === 'batch' ? 'var(--link)' : kind === 'test' ? 'var(--gold)' : kind === 'simulated' ? 'var(--ink-3)' : 'var(--ink-2)'}>{kind}</Chip>;

export function useCopy() {
  const [copied, setCopied] = useState(null);
  const copy = useCallback(async (text, id = text) => {
    try { await navigator.clipboard.writeText(text); } catch {
      const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
    }
    setCopied(id); setTimeout(() => setCopied((c) => (c === id ? null : c)), 1600);
  }, []);
  return [copied, copy];
}
export function CopyButton({ text, label = 'Copy', className = '' }) {
  const [copied, copy] = useCopy();
  return (
    <button type="button" onClick={() => copy(text)} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 h-7 text-[12px] font-medium bg-surface-2 hover:bg-surface-3 text-ink-2 hover:text-ink ${className}`} aria-label={label}>
      {copied ? <FiCheck style={{ color: 'var(--positive)' }} /> : <FiCopy />}{copied ? 'Copied' : label}
    </button>
  );
}

export function PageTitle({ title, sub, right }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div className="min-w-0"><h1 className="text-[1.6rem] sm:text-[2rem]">{title}</h1>{sub && <p className="text-ink-2 mt-1.5 text-[14.5px] max-w-[70ch]">{sub}</p>}</div>
      {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
    </header>
  );
}

export function Kpi({ label, value, sub, tone }) {
  return (
    <div className="panel p-5 min-w-0">
      <div className="eyebrow truncate">{label}</div>
      <div className="num text-[1.7rem] mt-1.5 leading-none truncate" style={tone ? { color: tone } : undefined}>{value}</div>
      {sub && <div className="text-[12px] text-ink-3 mt-2 line-clamp-2">{sub}</div>}
    </div>
  );
}

/** Proportional outcome strip for one delivery (accepted / duplicates / filtered / rejected). */
export function OutcomeBar({ row, width = 'w-24' }) {
  const parts = [['accepted', row.accepted], ['duplicates', row.duplicates], ['filtered', row.filtered], ['rejected', row.rejected]].filter(([, v]) => v > 0);
  const total = parts.reduce((s, [, v]) => s + v, 0) || 1;
  return (
    <div className={`flex h-1.5 rounded-full overflow-hidden bg-surface-3 ${width}`} role="img" aria-label={parts.map(([k, v]) => `${v} ${k}`).join(', ')}>
      {parts.map(([k, v]) => <span key={k} style={{ width: `${(v / total) * 100}%`, background: OUTCOME[k].color }} />)}
    </div>
  );
}

export function QueryState({ q, skeleton = 220, children }) {
  if (q.isLoading) return <Skeleton h={skeleton} className="!rounded-[22px]" />;
  if (q.error) return <ErrorNote error={q.error} onRetry={q.refetch} />;
  return children(q.data);
}

/** 14-day stacked outcomes: one continuous column per day, only the outer ends rounded. */
const SERIES = [['accepted', 'var(--positive)'], ['duplicates', 'var(--ink-3)'], ['filtered', 'var(--warning)'], ['rejected', 'var(--negative)']];
export function OutcomeChart({ series, height = 240 }) {
  const [hover, setHover] = useState(null);
  const data = series.map((d) => ({ ...d, label: new Date(d.day + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) }));
  const ends = data.map((m) => { const nz = SERIES.filter(([k]) => m[k] > 0).map(([k]) => k); return { bottom: nz[0], top: nz.at(-1) }; });
  const path = (x, y, w, h, rt, rb) => `M${x},${y + rt} a${rt},${rt} 0 0 1 ${rt},${-rt} h${w - 2 * rt} a${rt},${rt} 0 0 1 ${rt},${rt} v${h - rt - rb} a${rb},${rb} 0 0 1 ${-rb},${rb} h${-(w - 2 * rb)} a${rb},${rb} 0 0 1 ${-rb},${-rb} z`;
  const shape = (k, color) => ({ x, y, width, height: h, index }) => {
    if (!h || h < 0.5) return null;
    const top = ends[index]?.top === k, bottom = ends[index]?.bottom === k, R = Math.min(width / 2, 4);
    const rt = top ? Math.min(R, h / (bottom ? 2 : 1)) : 0, rb = bottom ? Math.min(R, h / (top ? 2 : 1)) : 0;
    const d = path(x, y, width, h, rt, rb);
    return <g opacity={hover != null && hover !== index ? 0.3 : 1} style={{ transition: 'opacity .2s' }}><path d={d} fill={color} style={{ fillOpacity: 'var(--bar-op)' }} /><path d={d} fill="url(#pt-sheen)" /></g>;
  };
  const Tip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
      <div className="glass rounded-2xl px-4 py-3 text-[13px] shadow-2xl min-w-44">
        <div className="eyebrow mb-1.5">{label}</div>
        <div className="num text-lg mb-1.5">{n(p.received)} <span className="text-[12px] text-ink-3 font-normal">received</span></div>
        {SERIES.map(([k, c]) => <div key={k} className="flex justify-between gap-5"><span className="inline-flex items-center gap-2 text-ink-2"><span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />{OUTCOME[k].label}</span><span className="num">{n(p[k])}</span></div>)}
      </div>
    );
  };
  return (
    <figure>
      <div style={{ height }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }} barCategoryGap="34%" onMouseMove={(s) => setHover(s?.activeTooltipIndex ?? null)} onMouseLeave={() => setHover(null)}>
            <defs>
              <linearGradient id="pt-sheen" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#fff" style={{ stopOpacity: 'var(--sheen-hi)' }} /><stop offset=".2" stopColor="#fff" stopOpacity=".06" />
                <stop offset=".55" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".28" />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--grid)" strokeDasharray="2 6" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'var(--ink-3)', fontSize: 11 }} tickMargin={10} interval="preserveStartEnd" minTickGap={14} />
            <YAxis tickLine={false} axisLine={false} tick={{ fill: 'var(--ink-3)', fontSize: 11 }} width={40} allowDecimals={false} tickCount={4} />
            <Tooltip content={<Tip />} cursor={false} />
            {SERIES.map(([k, c]) => <Bar key={k} dataKey={k} stackId="s" fill={c} shape={shape(k, c)} maxBarSize={26} animationDuration={700} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-2 mt-4 text-[12px] text-ink-2" aria-label="Legend">
        {SERIES.map(([k, c]) => <li key={k} className="inline-flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />{OUTCOME[k].label}</li>)}
      </ul>
    </figure>
  );
}

/** Solid dialog (the shared Modal is glass; dense forms need an opaque surface). */
export function Dialog({ title, onClose, children }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, [onClose]);
  return createPortal(
    <motion.div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 sm:p-4" role="dialog" aria-modal="true" aria-label={title} onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="w-full sm:max-w-[520px] max-h-[90dvh] overflow-y-auto rounded-t-[22px] sm:rounded-[22px] border border-[var(--line-strong)] bg-[var(--surface-solid)] shadow-[0_30px_80px_-20px_rgba(0,0,0,.7)]" onClick={(e) => e.stopPropagation()}
        initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }} transition={{ type: 'spring', damping: 28, stiffness: 320 }}>
        <div className="sticky top-0 z-10 bg-[var(--surface-solid)] flex items-center justify-between gap-3 px-6 py-4 border-b border-line">
          <h2 className="text-lg">{title}</h2>
          <button className="w-8 h-8 grid place-items-center rounded-full text-ink-3 hover:text-ink hover:bg-surface-2" onClick={onClose} aria-label="Close"><FiX /></button>
        </div>
        <div className="p-6">{children}</div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

/** Slide-over with the per-item results of one delivery. */
export function DeliveryDrawer({ id, onClose }) {
  const q = useQuery({ queryKey: ['portal-log', id], queryFn: () => portal.log(id), enabled: !!id });
  const [filter, setFilter] = useState('all');
  useEffect(() => { setFilter('all'); }, [id]);
  useEffect(() => { if (!id) return; const k = (e) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [id, onClose]);
  return createPortal(
    <AnimatePresence>
      {id && (
        <motion.div className="fixed inset-0 z-50 flex justify-end bg-black/45" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label="Delivery details">
          <motion.aside className="h-full w-full sm:w-[560px] bg-[var(--surface-solid)] border-l border-line flex flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}
            initial={{ x: 60, opacity: 0.6 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 60, opacity: 0 }} transition={{ type: 'spring', damping: 30, stiffness: 320 }}>
            <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-line">
              <div className="min-w-0">
                <div className="eyebrow">Delivery</div>
                <div className="font-mono text-[13px] mt-1 truncate">{id}</div>
                {q.data && <div className="flex items-center gap-2 mt-2 text-[12px] text-ink-3"><KindChip kind={q.data.kind} />{dt(q.data.created_at, 'd MMM yyyy, h:mm:ss a')} · {q.data.duration_ms ?? '—'} ms</div>}
              </div>
              <button className="w-8 h-8 grid place-items-center rounded-full text-ink-3 hover:text-ink hover:bg-surface-2 shrink-0" onClick={onClose} aria-label="Close"><FiX /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {q.isLoading ? <div className="grid gap-3"><Skeleton h={70} /><Skeleton h={220} /></div> : q.error ? <ErrorNote error={q.error} onRetry={q.refetch} /> : (() => {
                const d = q.data;
                const counts = [['all', d.received, 'var(--ink)'], ['accepted', d.accepted, OUTCOME.accepted.color], ['updated', d.updated || 0, OUTCOME.updated.color], ['duplicate', d.duplicates, OUTCOME.duplicate.color], ['filtered', d.filtered, OUTCOME.filtered.color], ['rejected', d.rejected, OUTCOME.rejected.color]];
                const rows = d.results.filter((r) => filter === 'all' || r.status === filter);
                return (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      {counts.map(([k, v, c]) => (
                        <button key={k} type="button" onClick={() => setFilter(k)} aria-pressed={filter === k}
                          className={`rounded-2xl px-3 py-2.5 text-left border transition-colors ${filter === k ? 'border-[var(--line-strong)] bg-surface-2' : 'border-line hover:bg-surface-2'}`}>
                          <div className="text-[11px] text-ink-3 capitalize">{k === 'all' ? 'Received' : k}</div>
                          <div className="num text-lg mt-0.5" style={{ color: v && k !== 'all' ? c : undefined }}>{n(v)}</div>
                        </button>
                      ))}
                    </div>
                    {d.users_created > 0 && <p className="text-[12px] text-ink-3 mt-3">{d.users_created} new {d.users_created === 1 ? 'user' : 'users'} created from first-seen phones.</p>}
                    <ul className="mt-5 grid gap-2.5">
                      {rows.map((r, i) => (
                        <li key={`${r.id}-${i}`} className="rounded-2xl border border-line p-4">
                          <div className="flex items-center justify-between gap-3">
                            <span className="font-mono text-[12.5px] truncate">{r.id ?? '—'}</span>
                            <StatusChip status={r.status} />
                          </div>
                          {(r.code || r.param) && <div className="mt-2 flex flex-wrap items-center gap-1.5">{r.code && <Chip mono dot={false} color={OUTCOME[r.status]?.color}>{r.code}</Chip>}{r.param && <Chip mono dot={false} color="var(--ink-2)">{r.param}</Chip>}</div>}
                          {r.message && <p className="text-[13px] text-ink-2 mt-2">{r.message}</p>}
                          {r.transaction?.merchant && (
                            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]">
                              <dt className="text-ink-3">Merchant</dt><dd className="truncate">{r.transaction.merchant}</dd>
                              <dt className="text-ink-3">Category</dt><dd className="font-mono truncate">{r.transaction.category}/{r.transaction.subcategory}</dd>
                              <dt className="text-ink-3">Confidence</dt><dd>{Math.round(r.transaction.confidence * 100)}% · <span className="font-mono">{r.transaction.categorised_by}</span></dd>
                              <dt className="text-ink-3">User</dt><dd className="font-mono">{r.transaction.user?.phone}{r.transaction.user?.created ? ' · new' : ''}</dd>
                            </dl>
                          )}
                        </li>
                      ))}
                      {!rows.length && <li className="text-sm text-ink-3 py-6 text-center">No items with this outcome.</li>}
                    </ul>
                  </>
                );
              })()}
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Deliveries table shared by Overview (compact) and Deliveries. */
export function DeliveriesTable({ rows, onOpen, compact }) {
  if (!rows.length) return <p className="text-sm text-ink-3 py-8 text-center">No deliveries yet. Send a test event or point your webhook at <span className="font-mono">/v1/events</span>.</p>;
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-[13px] min-w-[640px]">
        <thead>
          <tr className="text-left text-[11.5px] text-ink-3 border-b border-line">
            <th className="font-medium py-2.5 px-1">Time</th><th className="font-medium py-2.5 px-1">Kind</th>
            {!compact && <th className="font-medium py-2.5 px-1">Key</th>}
            <th className="font-medium py-2.5 px-1 text-right">Received</th><th className="font-medium py-2.5 px-1 text-right">Accepted</th>
            {!compact && <><th className="font-medium py-2.5 px-1 text-right">Dup.</th><th className="font-medium py-2.5 px-1 text-right">Filtered</th></>}
            <th className="font-medium py-2.5 px-1 text-right">Rejected</th><th className="font-medium py-2.5 px-1 pl-4">Outcome</th>
            {!compact && <th className="font-medium py-2.5 px-1 text-right">ms</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} onClick={() => onOpen(r.id)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen(r.id))} tabIndex={0} role="button" aria-label={`Open delivery ${r.id}`}
              className="border-b border-line last:border-0 cursor-pointer hover:bg-surface-2 transition-colors outline-none focus-visible:bg-surface-2">
              <td className="py-3 px-1 whitespace-nowrap" title={dt(r.created_at, 'd MMM yyyy, h:mm:ss a')}>{ago(r.created_at)}</td>
              <td className="py-3 px-1"><KindChip kind={r.kind} /></td>
              {!compact && <td className="py-3 px-1 max-w-[180px]">{r.key_name ? <div className="min-w-0"><div className="truncate">{r.key_name}</div><div className="font-mono text-[11px] text-ink-3 truncate">{r.key_prefix}</div></div> : <span className="text-ink-3">Portal</span>}</td>}
              <td className="py-3 px-1 text-right num">{n(r.received)}</td>
              <td className="py-3 px-1 text-right num" style={{ color: r.accepted ? OUTCOME.accepted.color : undefined }}>{n(r.accepted)}</td>
              {!compact && <><td className="py-3 px-1 text-right num text-ink-3">{n(r.duplicates)}</td><td className="py-3 px-1 text-right num" style={{ color: r.filtered ? OUTCOME.filtered.color : undefined }}>{n(r.filtered)}</td></>}
              <td className="py-3 px-1 text-right num" style={{ color: r.rejected ? OUTCOME.rejected.color : undefined }}>{n(r.rejected)}</td>
              <td className="py-3 px-1 pl-4"><OutcomeBar row={r} /></td>
              {!compact && <td className="py-3 px-1 text-right text-ink-3 num">{r.duration_ms ?? '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { inr };
