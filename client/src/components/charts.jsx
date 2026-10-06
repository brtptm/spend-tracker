import { useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, AreaChart, Area, ReferenceLine, Cell } from 'recharts';
import { inr, inrShort } from '../lib/format.js';

import { CAT_COLORS, CAT_NAMES } from '../lib/cats.js';
export { CAT_COLORS, CAT_NAMES };
const ORDER = Object.keys(CAT_COLORS);

// Shared chart grammar: hairline dashed grid, no axis lines, quiet ticks,
// one dashed reference for the average, glass tooltip.
const axis = { tickLine: false, axisLine: false, tick: { fill: 'var(--ink-3)', fontSize: 11 }, tickMargin: 10 };
const grid = { vertical: false, stroke: 'rgba(255,255,255,.06)', strokeDasharray: '2 6' };
const avgOf = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

function Tip({ active, payload, label, names = {}, fmt = inr }) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.value).reverse();
  const total = rows.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div className="glass rounded-2xl px-4 py-3 text-[13px] shadow-2xl min-w-48">
      {label != null && <div className="eyebrow mb-2">{label}</div>}
      {rows.length > 1 && <div className="num text-xl mb-2">{fmt(total)}</div>}
      <div className="grid gap-1">
        {rows.map((p) => (
          <div key={p.dataKey || p.name} className="flex items-center justify-between gap-5">
            <span className="inline-flex items-center gap-2 text-ink-2"><span className="w-1.5 h-1.5 rounded-full" style={{ background: p.color || p.payload?.color }} />{names[p.dataKey] || p.name}</span>
            <span className="num">{fmt(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const AvgLabel = ({ viewBox, value }) => (
  <text x={viewBox.x + viewBox.width} y={viewBox.y - 6} textAnchor="end" fill="var(--ink-3)" fontSize={10.5} letterSpacing="0.06em">AVG {value}</text>
);

const Legend = ({ items, note }) => (
  <ul className="flex flex-wrap gap-x-5 gap-y-2 mt-4 text-[12px] text-ink-2" aria-label="Legend">
    {items.map(([k, color, name]) => <li key={k} className="inline-flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />{name}</li>)}
    {note && <li className="text-ink-3">{note}</li>}
  </ul>
);

/** Stacked monthly columns by category: slim, segmented with hairline gaps; hover isolates a month. */
export function MonthlyStack({ months, height = 280, keys = ORDER }) {
  const [hover, setHover] = useState(null);
  const present = keys.filter((k) => months.some((m) => m[k] > 0));
  const data = months.map((m) => ({ ...m, label: m.partial ? `${m.label}*` : m.label, _total: present.reduce((s, k) => s + (m[k] || 0), 0) }));
  const avg = avgOf(data.filter((m) => !m.partial).map((m) => m._total));
  return (
    <figure>
      <div style={{ height }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 18, right: 0, left: 0, bottom: 0 }} barCategoryGap="38%"
            onMouseMove={(s) => setHover(s?.activeTooltipIndex ?? null)} onMouseLeave={() => setHover(null)}>
            <CartesianGrid {...grid} />
            <XAxis dataKey="label" {...axis} />
            <YAxis {...axis} width={48} tickFormatter={inrShort} tickCount={4} />
            <Tooltip content={<Tip names={CAT_NAMES} />} cursor={false} />
            {avg > 0 && <ReferenceLine y={avg} stroke="rgba(255,255,255,.28)" strokeDasharray="3 4" label={<AvgLabel value={inrShort(avg)} />} />}
            {present.map((k, i) => (
              <Bar key={k} dataKey={k} stackId="s" fill={CAT_COLORS[k]} stroke="var(--bg)" strokeWidth={2} radius={i === present.length - 1 ? [6, 6, 2, 2] : 2} maxBarSize={30} isAnimationActive animationDuration={700}>
                {data.map((m, j) => <Cell key={j} fillOpacity={(hover != null && hover !== j) ? 0.28 : m.partial ? 0.55 : 1} style={{ transition: 'fill-opacity .2s' }} />)}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Legend items={present.map((k) => [k, CAT_COLORS[k], CAT_NAMES[k]])} note={months.some((m) => m.partial) ? '* month in progress' : null} />
    </figure>
  );
}

/** Single-series trend: fine line, faint fade, average reference, a lit final point. */
export function TrendArea({ data, dataKey = 'amount', color = 'var(--ink)', height = 210, name = 'Spent' }) {
  const id = `g-${dataKey}-${String(color).replace(/\W/g, '')}`;
  const avg = avgOf(data.map((d) => d[dataKey] || 0));
  const last = data.length - 1;
  const LastDot = ({ cx, cy, index }) => index !== last ? null : (
    <g><circle cx={cx} cy={cy} r={9} fill={color} fillOpacity={0.18} /><circle cx={cx} cy={cy} r={3.5} fill={color} stroke="var(--bg)" strokeWidth={1.5} /></g>
  );
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 18, right: 10, left: 0, bottom: 0 }}>
          <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.22} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
          <CartesianGrid {...grid} />
          <XAxis dataKey="label" {...axis} />
          <YAxis {...axis} width={48} tickFormatter={inrShort} tickCount={4} />
          <Tooltip content={<Tip names={{ [dataKey]: name }} />} cursor={{ stroke: 'rgba(255,255,255,.18)', strokeWidth: 1 }} />
          {avg > 0 && <ReferenceLine y={avg} stroke="rgba(255,255,255,.24)" strokeDasharray="3 4" label={<AvgLabel value={inrShort(avg)} />} />}
          <Area type="monotone" dataKey={dataKey} name={name} stroke={color} strokeWidth={1.75} fill={`url(#${id})`} dot={<LastDot />} activeDot={{ r: 4, stroke: 'var(--bg)', strokeWidth: 2, fill: color }} animationDuration={900} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** You vs similar users: bullet bars — your spend as a fine bar, peers as a tick. */
export function CompareBars({ rows }) {
  const list = rows.filter((r) => r.you || r.average);
  const max = Math.max(1, ...list.flatMap((r) => [r.you, r.average])) * 1.06;
  return (
    <figure>
      <ul className="flex gap-5 text-[12px] text-ink-2 mb-4" aria-label="Legend">
        <li className="inline-flex items-center gap-2"><span className="w-4 h-[3px] rounded-full bg-ink" />You</li>
        <li className="inline-flex items-center gap-2"><span className="w-[2px] h-3 rounded-full bg-ink-3" />Similar users</li>
      </ul>
      <ul className="grid gap-4">
        {list.map((r) => {
          const over = r.you > r.average * 1.1, under = r.you < r.average * 0.9;
          const diff = r.average ? Math.round(((r.you - r.average) / r.average) * 100) : 0;
          return (
            <li key={r.id || r.name} title={`${r.name}: you ${inr(r.you)} · similar users ${inr(r.average)}`}>
              <div className="flex items-baseline justify-between gap-3 text-[13px]">
                <span className="text-ink-2 truncate">{r.name}</span>
                <span className="flex items-baseline gap-2.5 shrink-0">
                  <span className="num">{inrShort(r.you)}</span>
                  <span className={`text-[11px] w-11 text-right ${over ? 'text-warning' : under ? 'text-positive' : 'text-ink-3'}`}>{diff > 0 ? '+' : ''}{diff}%</span>
                </span>
              </div>
              <div className="relative h-3 mt-1.5">
                <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/[.07]" />
                <div className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full transition-[width] duration-700" style={{ width: `${(r.you / max) * 100}%`, background: r.color || 'var(--ink)' }} />
                <div className="absolute top-0 bottom-0 w-[2px] rounded-full bg-ink-2" style={{ left: `calc(${(r.average / max) * 100}% - 1px)` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

/** Weekday × hour as a star map: each payment window is a point whose size and light follow spend. */
export function Heatmap({ grid: cells }) {
  const max = Math.max(1, ...cells.flat());
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const W = 24 * 22, H = 7 * 22;
  return (
    <figure>
      <div className="flex gap-2">
        <div className="grid shrink-0 text-[10.5px] text-ink-3 w-8" style={{ gridTemplateRows: 'repeat(7, 1fr)' }}>{days.map((d) => <span key={d} className="self-center">{d}</span>)}</div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Spending by weekday and hour">
          {cells.map((row, d) => row.map((v, h) => {
            const t = v / max;
            return (
              <circle key={`${d}-${h}`} cx={h * 22 + 11} cy={d * 22 + 11} r={v ? 1.6 + Math.sqrt(t) * 7.4 : 1} fill={v ? 'var(--gold)' : '#fff'} fillOpacity={v ? 0.18 + t * 0.82 : 0.08}>
                <title>{`${days[d]} ${h}:00 — ${inr(v)}`}</title>
              </circle>
            );
          }))}
        </svg>
      </div>
      <div className="relative h-4 ml-10 mt-2 text-[10.5px] text-ink-3" aria-hidden="true">
        {[0, 6, 12, 18].map((h) => <span key={h} className="absolute -translate-x-1/2" style={{ left: `${((h + 0.5) / 24) * 100}%` }}>{h === 0 ? '12a' : h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`}</span>)}
      </div>
      <figcaption className="flex items-center gap-2.5 mt-4 text-[11px] text-ink-3">
        Less
        {[0.1, 0.35, 0.65, 1].map((t) => <svg key={t} width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r={1.6 + Math.sqrt(t) * 5.5} fill="var(--gold)" fillOpacity={0.18 + t * 0.82} /></svg>)}
        More
      </figcaption>
    </figure>
  );
}

/** Capsule columns; the peak is lit, the rest recede, hover isolates. */
export function SimpleBars({ data, dataKey = 'amount', xKey = 'label', color = 'var(--ink)', height = 180, name = 'Spent', format = inr, tickFormat = inrShort }) {
  const [hover, setHover] = useState(null);
  const values = data.map((d) => d[dataKey] || 0);
  const peak = values.indexOf(Math.max(...values));
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 10, right: 0, left: 0, bottom: 0 }} barCategoryGap="30%"
          onMouseMove={(s) => setHover(s?.activeTooltipIndex ?? null)} onMouseLeave={() => setHover(null)}>
          <CartesianGrid {...grid} />
          <XAxis dataKey={xKey} {...axis} interval="preserveStartEnd" minTickGap={6} />
          <YAxis {...axis} width={52} tickFormatter={tickFormat} allowDecimals={false} tickCount={4} />
          <Tooltip content={<Tip names={{ [dataKey]: name }} fmt={format} />} cursor={false} />
          <Bar dataKey={dataKey} name={name} fill={color} radius={[99, 99, 99, 99]} maxBarSize={14} animationDuration={700}>
            {data.map((_, i) => <Cell key={i} fillOpacity={hover != null ? (hover === i ? 1 : 0.25) : i === peak ? 1 : 0.42} style={{ transition: 'fill-opacity .2s' }} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
