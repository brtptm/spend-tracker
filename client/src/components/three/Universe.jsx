import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';

const UniverseScene = lazy(() => import('./UniverseScene.jsx'));
const hasWebGL = () => { try { return Boolean(window.WebGL2RenderingContext && document.createElement('canvas').getContext('webgl2')); } catch { return false; } };

/** Static fallback: concentric orbits with category dots (no WebGL / while loading). */
function Fallback({ planets }) {
  const list = [...planets].sort((a, b) => b.amount - a.amount).slice(0, 7);
  return (
    <svg viewBox="-200 -120 400 240" className="absolute inset-0 w-full h-full" aria-hidden="true">
      <circle r="16" fill="#c6f432" opacity=".9" />
      {list.map((p, i) => { const r = 40 + i * 20; const a = i * 1.3; return (
        <g key={p.id}><ellipse rx={r} ry={r * 0.35} fill="none" stroke={p.color} opacity=".25" /><circle cx={Math.cos(a) * r} cy={Math.sin(a) * r * 0.35} r={4 + 6 * Math.sqrt(p.amount / (list[0]?.amount || 1))} fill={p.color} /></g>
      ); })}
    </svg>
  );
}

export default function Universe({ planets, className = '', ...props }) {
  const ref = useRef(null);
  const [inView, setInView] = useState(true);
  const [ready, setReady] = useState(false);
  const webgl = useMemo(hasWebGL, []);
  useEffect(() => {
    if (!ref.current) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: '120px' });
    io.observe(ref.current);
    const t = setTimeout(() => setReady(true), 80);
    return () => { io.disconnect(); clearTimeout(t); };
  }, []);
  if (!planets?.length) return null;
  return (
    <div ref={ref} className={`absolute inset-0 overflow-hidden ${className}`}>
      {!webgl && <Fallback planets={planets} />}
      {webgl && (
        <div className="absolute inset-0 transition-opacity duration-[1200ms]" style={{ opacity: ready ? 1 : 0 }}>
          <Suspense fallback={<Fallback planets={planets} />}>
            <UniverseScene planets={planets} paused={!inView} {...props} />
          </Suspense>
        </div>
      )}
    </div>
  );
}
