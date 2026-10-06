import { ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, AreaChart, Area, Legend } from 'recharts';
import { inr, inrShort } from '../lib/format.js';

import { CAT_COLORS, CAT_NAMES } from '../lib/cats.js';
export { CAT_COLORS, CAT_NAMES };
const ORDER = Object.keys(CAT_COLORS);
const axis = { tickLine: false, axisLine: false, tick: { fill: 'var(--ink-3)', fontSize: 12 } };

function Tip({ active, payload, label, names = {}, fmt = inr }) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => p.value);
  const total = rows.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div className="glass rounded-xl px-3.5 py-2.5 text-sm shadow-xl min-w-44">
      {label != null && <div className="font-semibold mb-1.5">{label}</div>}
      {rows.map((p) => (
        <div key={p.dataKey || p.name} className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-2 text-ink-2"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: p.color || p.payload?.color }} />{names[p.dataKey] || p.name}</span>
          <span className="num">{fmt(p.value)}</span>
        </div>
      ))}
      {rows.length > 1 && <div className="flex justify-between gap-4 mt-1.5 pt-1.5 border-t border-line"><span className="text-ink-3">Total</span><span className="num">{fmt(total)}</span></div>}
    </div>
  );
}

/** Category share donut with total in the middle and a legend list. */
export function Donut({ data, total, onSelect, height = 240 }) {
  return (
    <div className="grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-6 items-center">
      <figure className="relative" style={{ height }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="amount" nameKey="name" innerRadius="66%" outerRadius="96%" paddingAngle={1.5} stroke="var(--surface)" strokeWidth={2} cornerRadius={4} onClick={(d) => onSelect?.(d.id)} style={{ cursor: onSelect ? 'pointer' : 'default' }}>
              {data.map((d) => <Cell key={d.id} fill={d.color} />)}
            </Pie>
            <Tooltip content={<Tip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 grid place-items-center pointer-events-none text-center">
          <div><div className="num text-2xl">{inrShort(total)}</div><div className="text-xs text-ink-3">total</div></div>
        </div>
        <figcaption className="sr-only">Spending share by category</figcaption>
      </figure>
      <ul className="grid gap-2" aria-label="Legend">
        {data.map((d) => (
          <li key={d.id}>
            <button className="w-full flex items-center gap-3 text-sm rounded-lg px-2 py-1.5 hover:bg-surface-2 text-left" onClick={() => onSelect?.(d.id)}>
              <span className="w-3 h-3 rounded-[4px] shrink-0" style={{ background: d.color }} />
              <span className="flex-1 truncate">{d.name}</span>
              <span className="num">{inrShort(d.amount)}</span>
              <span className="text-ink-3 w-10 text-right">{d.percentage}%</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Stacked monthly bars by category; partial month flagged. */
export function MonthlyStack({ months, height = 280, keys = ORDER }) {
  const present = keys.filter((k) => months.some((m) => m[k] > 0));
  const data = months.map((m) => ({ ...m, label: m.partial ? `${m.label}*` : m.label }));
  return (
    <figure>
      <div style={{ height }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="26%">
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" {...axis} />
            <YAxis {...axis} width={52} tickFormatter={inrShort} />
            <Tooltip content={<Tip names={CAT_NAMES} />} cursor={{ fill: 'var(--surface-2)' }} />
            {present.map((k, i) => <Bar key={k} dataKey={k} stackId="s" fill={CAT_COLORS[k]} stroke="var(--surface)" strokeWidth={1.5} radius={i === present.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={44} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 text-xs text-ink-2" aria-label="Legend">
        {present.map((k) => <li key={k} className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: CAT_COLORS[k] }} />{CAT_NAMES[k]}</li>)}
        {months.some((m) => m.partial) && <li className="text-ink-3">* month in progress</li>}
      </ul>
    </figure>
  );
}

/** Single-series area (trend of one category or merchant). */
export function TrendArea({ data, dataKey = 'amount', color = 'var(--cyan)', height = 200, name = 'Spent' }) {
  const id = `g-${dataKey}-${String(color).replace(/\W/g, '')}`;
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
          <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.35} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" {...axis} />
          <YAxis {...axis} width={52} tickFormatter={inrShort} />
          <Tooltip content={<Tip names={{ [dataKey]: name }} />} />
          <Area type="monotone" dataKey={dataKey} name={name} stroke={color} strokeWidth={2} fill={`url(#${id})`} dot={{ r: 3.5, strokeWidth: 2, stroke: 'var(--surface)', fill: color }} activeDot={{ r: 6 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** You vs similar users, per category (two series → legend). */
export function CompareBars({ rows, height = 300 }) {
  const data = rows.filter((r) => r.you || r.average).map((r) => ({ name: r.name.replace(' & ', ' & '), you: r.you, average: r.average }));
  return (
    <figure>
      <ul className="flex gap-4 text-xs text-ink-2 mb-3" aria-label="Legend">
        <li className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: 'var(--cyan)' }} />You</li>
        <li className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: 'var(--ink-3)' }} />Similar users</li>
      </ul>
      <div style={{ height }}>
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid horizontal={false} />
            <XAxis type="number" {...axis} tickFormatter={inrShort} />
            <YAxis type="category" dataKey="name" {...axis} width={128} />
            <Tooltip content={<Tip names={{ you: 'You', average: 'Similar users' }} />} cursor={{ fill: 'var(--surface-2)' }} />
            <Bar dataKey="you" fill="var(--cyan)" radius={[0, 4, 4, 0]} maxBarSize={14} />
            <Bar dataKey="average" fill="var(--ink-3)" radius={[0, 4, 4, 0]} maxBarSize={14} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/** Weekday × hour heatmap (sequential cyan). */
export function Heatmap({ grid }) {
  const max = Math.max(1, ...grid.flat());
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return (
    <figure className="overflow-x-auto">
      <div className="grid gap-[3px] min-w-[560px]" style={{ gridTemplateColumns: '38px repeat(24, minmax(0, 1fr))' }}>
        {grid.map((row, d) => [
          <div key={`l${d}`} className="text-[11px] text-ink-3 self-center">{days[d]}</div>,
          ...row.map((v, h) => (
            <div key={`${d}-${h}`} title={`${days[d]} ${h}:00 — ${inr(v)}`} className="aspect-square rounded-[3px]"
              style={{ background: v ? `color-mix(in srgb, var(--cyan) ${12 + Math.round((v / max) * 88)}%, var(--surface-2))` : 'var(--surface-2)' }} />
          )),
        ])}
        <div />
        {Array.from({ length: 24 }, (_, h) => <div key={`h${h}`} className="text-[10px] text-ink-3 text-center">{h % 3 === 0 ? h : ''}</div>)}
      </div>
      <figcaption className="flex items-center gap-2 mt-3 text-xs text-ink-3">Less <span className="h-2 w-24 rounded-full" style={{ background: 'linear-gradient(90deg, var(--surface-2), var(--cyan))' }} /> More</figcaption>
    </figure>
  );
}

export function SimpleBars({ data, dataKey = 'amount', xKey = 'label', color = 'var(--cyan)', height = 180, name = 'Spent', format = inr, tickFormat = inrShort }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} />
          <XAxis dataKey={xKey} {...axis} />
          <YAxis {...axis} width={48} tickFormatter={tickFormat} allowDecimals={false} />
          <Tooltip content={<Tip names={{ [dataKey]: name }} fmt={format} />} cursor={{ fill: 'var(--surface-2)' }} labelFormatter={(l, p) => p?.[0]?.payload?.tip || l} />
          <Bar dataKey={dataKey} name={name} fill={color} radius={[4, 4, 0, 0]} maxBarSize={30} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
