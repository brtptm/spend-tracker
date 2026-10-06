import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';

const RingScene = lazy(() => import('./RingScene.jsx'));
const hasWebGL = () => { try { return Boolean(window.WebGL2RenderingContext && document.createElement('canvas').getContext('webgl2')); } catch { return false; } };

/** 2D ring with rounded caps — used without WebGL and while the 3D chunk loads. */
export function FlatRing({ segments, size = 260, stroke = 22, gapDeg = 3 }) {
  const list = segments.filter((s) => s.amount > 0);
  const total = list.reduce((a, s) => a + s.amount, 0) || 1;
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%" className="-rotate-90" aria-hidden="true">
      {list.map((s) => {
        const frac = s.amount / total;
        const len = Math.max(0, frac * c - (gapDeg / 360) * c);
        const el = <circle key={s.id} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${len} ${c}`} strokeDashoffset={-offset} />;
        offset += frac * c;
        return el;
      })}
    </svg>
  );
}

export default function Ring({ segments, className = '', children, ...props }) {
  const ref = useRef(null);
  const [inView, setInView] = useState(true);
  const [ready, setReady] = useState(false);
  const webgl = useMemo(hasWebGL, []);
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: '120px' });
    io.observe(ref.current);
    const t = setTimeout(() => setReady(true), 60);
    return () => { io.disconnect(); clearTimeout(t); };
  }, []);
  if (!segments?.length) return null;
  const fallback = <div className="absolute inset-0 grid place-items-center"><div className="w-[62%] max-w-[300px] aspect-square opacity-90"><FlatRing segments={segments} /></div></div>;
  return (
    <div ref={ref} className={`absolute inset-0 ${className}`}>
      {!webgl ? fallback : (
        <div className="absolute inset-0 transition-opacity duration-700" style={{ opacity: ready ? 1 : 0 }}>
          <Suspense fallback={fallback}><RingScene segments={segments} paused={!inView} {...props} /></Suspense>
        </div>
      )}
      {children && <div className="absolute inset-0 grid place-items-center pointer-events-none">{children}</div>}
    </div>
  );
}
