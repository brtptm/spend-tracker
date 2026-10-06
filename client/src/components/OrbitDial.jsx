import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { inr } from '../lib/format.js';

const C = 300; // viewBox centre
const polar = (r, deg) => { const a = ((deg - 90) * Math.PI) / 180; return [C + r * Math.cos(a), C + r * Math.sin(a)]; };
function arcPath(r, a0, a1) {
  const [x0, y0] = polar(r, a0), [x1, y1] = polar(r, a1);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

/**
 * Spending as an instrument: a graduated bezel, faint orbits, and one thin arc
 * per category. Hover/focus an arc to read it in the centre.
 */
export default function OrbitDial({ segments, total, label = 'Spent', sub, onSelect, interactive = true, children }) {
  const [active, setActive] = useState(null);
  const R = 222, GAP = 2.4;
  const segs = useMemo(() => {
    const list = segments.filter((s) => s.amount > 0);
    const sum = list.reduce((a, s) => a + s.amount, 0) || 1;
    const usable = 360 - GAP * list.length;
    let a = 0;
    return list.map((s, i) => { const span = Math.max(1.2, (s.amount / sum) * usable); const seg = { ...s, a0: a, a1: a + span, pct: Math.round((s.amount / sum) * 100), i }; a += span + GAP; return seg; });
  }, [segments]);
  const cur = segs.find((s) => s.id === active);
  const ticks = useMemo(() => Array.from({ length: 120 }, (_, i) => i * 3), []);

  return (
    <div className="relative w-full aspect-square select-none">
      <svg viewBox="0 0 600 600" className="absolute inset-0 w-full h-full overflow-visible" role="img" aria-label={`${label} ${inr(total)} across ${segs.length} categories`}>
        <defs>
          <radialGradient id="dial-core" cx="50%" cy="38%" r="70%"><stop offset="0" stopColor="#1c1c1f" /><stop offset=".7" stopColor="#0b0b0c" /><stop offset="1" stopColor="#050505" /></radialGradient>
          <radialGradient id="dial-halo" cx="50%" cy="50%" r="50%"><stop offset=".55" stopColor="#fff" stopOpacity="0" /><stop offset=".78" stopColor="#fff" stopOpacity=".035" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
          <filter id="dial-glow" filterUnits="userSpaceOnUse" x="0" y="0" width="600" height="600"><feGaussianBlur stdDeviation="9" /></filter>
          <linearGradient id="dial-sweep" gradientUnits="userSpaceOnUse" x1={polar(R, 0)[0]} y1={polar(R, 0)[1]} x2={polar(R, 50)[0]} y2={polar(R, 50)[1]}><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#fff" stopOpacity=".85" /></linearGradient>
        </defs>
        <circle cx={C} cy={C} r={290} fill="url(#dial-halo)" />
        <circle cx={C} cy={C} r={168} fill="url(#dial-core)" stroke="#fff" strokeOpacity=".09" />
        <circle cx={C} cy={C} r={160} fill="none" stroke="#fff" strokeOpacity=".04" />

        {/* Bezel: graduated ticks; quadrant marks read as share of spend. */}
        <g stroke="currentColor" className="text-ink">
          {ticks.map((d) => { const long = d % 30 === 0; const [x0, y0] = polar(long ? 268 : 272, d), [x1, y1] = polar(280, d); return <line key={d} x1={x0} y1={y0} x2={x1} y2={y1} strokeOpacity={long ? 0.6 : 0.22} strokeWidth={long ? 1.4 : 0.9} />; })}
        </g>
        {segs.filter((x) => x.pct >= 4).map((x) => { const [lx, ly] = polar(250, (x.a0 + x.a1) / 2); return (
          <motion.text key={`l-${x.id}`} x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fill={x.color} initial={{ opacity: 0 }} animate={{ opacity: active && active !== x.id ? 0.3 : 1 }} transition={{ delay: active ? 0 : 1 + x.i * 0.08 }} style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.01em' }}>{x.pct}%</motion.text>
        ); })}

        {/* Faint orbits + two slow satellites (the only ambient motion). */}
        <circle cx={C} cy={C} r={R} fill="none" stroke="#fff" strokeOpacity=".06" strokeWidth={12} />
        <circle cx={C} cy={C} r={194} fill="none" stroke="#fff" strokeOpacity=".07" strokeDasharray="1 6" />
        <g className="dial-orbit" style={{ transformOrigin: '300px 300px', animationDuration: '80s' }}><circle cx={C} cy={C - 194} r={2.2} fill="#fff" fillOpacity=".8" /></g>

        {/* Category arcs */}
        {segs.map((s) => {
          const on = active === s.id, dim = active && !on;
          const [px, py] = polar(R, s.a0);
          return (
            <g key={s.id} {...(interactive ? { role: 'button', tabIndex: 0, 'aria-label': `${s.name}: ${inr(s.amount)}, ${s.pct}%` } : {})}
              onMouseEnter={() => setActive(s.id)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(s.id)} onBlur={() => setActive(null)}
              onClick={() => onSelect?.(s.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(s.id); } }}
              style={{ cursor: onSelect ? 'pointer' : 'default', outline: 'none', pointerEvents: interactive ? 'auto' : 'none' }}>
              <path d={arcPath(R, s.a0, s.a1)} fill="none" stroke="transparent" strokeWidth={34} />
              <motion.path d={arcPath(R, s.a0, s.a1)} fill="none" stroke={s.color} strokeLinecap="round" strokeWidth={14} filter="url(#dial-glow)"
                initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: dim ? 0.1 : on ? 0.9 : 0.55 }}
                transition={{ pathLength: { duration: 1.1, delay: 0.15 + s.i * 0.09, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: 0.25 } }} />
              <motion.path d={arcPath(R, s.a0, s.a1)} fill="none" stroke={s.color} strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }} animate={{ pathLength: 1, opacity: dim ? 0.3 : 1, strokeWidth: on ? 14 : 10 }}
                transition={{ pathLength: { duration: 1.1, delay: 0.15 + s.i * 0.09, ease: [0.22, 1, 0.36, 1] }, opacity: { duration: 0.25 }, strokeWidth: { duration: 0.25 } }} />
              <motion.circle cx={px} cy={py} r={on ? 4 : 3} fill="#fff" stroke={s.color} strokeWidth={1.5}
                initial={{ opacity: 0 }} animate={{ opacity: dim ? 0.3 : 1 }} transition={{ delay: 0.15 + s.i * 0.09 }} />
            </g>
          );
        })}
        {/* A single soft highlight that travels the ring. */}
        <g className="dial-orbit pointer-events-none" style={{ transformOrigin: '300px 300px', animationDuration: '9s' }}>
          <path d={arcPath(R, 0, 50)} fill="none" stroke="url(#dial-sweep)" strokeWidth={10} strokeLinecap="round" opacity=".35" style={{ mixBlendMode: 'overlay' }} />
          <circle cx={polar(R, 50)[0]} cy={polar(R, 50)[1]} r={9} fill="#fff" opacity=".18" filter="url(#dial-glow)" />
        </g>
      </svg>

      <div className="absolute inset-0 grid place-items-center pointer-events-none">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={cur?.id || 'total'} className="text-center px-6" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
            {!cur && children ? children : (<>
              <div className="eyebrow">{cur ? cur.name : label}</div>
              <div className="num text-[clamp(1.9rem,6.2vw,3rem)] leading-none mt-1.5">{inr(cur ? cur.amount : total)}</div>
              <div className="text-xs text-ink-3 mt-2">{cur ? `${cur.pct}% of spend` : sub}</div>
            </>)}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
