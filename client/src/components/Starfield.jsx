import { useEffect, useRef } from 'react';

/**
 * A quiet, sparse starfield on pure black — fine white points that drift
 * almost imperceptibly and breathe very slightly. One canvas; paused in
 * background tabs; static under reduced motion; hidden in light theme.
 */
export default function Starfield() {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext('2d');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w, h, dpr, stars = [], raf, last = performance.now();
    const seed = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = cv.width = innerWidth * dpr; h = cv.height = innerHeight * dpr;
      cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px';
      const n = Math.round((innerWidth * innerHeight) / 11000);
      stars = Array.from({ length: n }, () => {
        const z = Math.pow(Math.random(), 2.2); // mostly faint, a few brighter
        return { x: Math.random() * w, y: Math.random() * h, z, r: (0.3 + z * 0.75) * dpr, a: 0.12 + z * 0.55, tw: Math.random() * 6.28, ts: 0.15 + Math.random() * 0.35 };
      });
    };
    const draw = (now) => {
      const dt = Math.min(50, now - last); last = now;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#fff';
      for (const s of stars) {
        if (!reduced) { s.x -= (0.0015 + s.z * 0.004) * dt * dpr; if (s.x < -2) s.x = w + 2; s.tw += s.ts * dt * 0.001; }
        ctx.globalAlpha = s.a * (reduced ? 1 : 0.85 + 0.15 * Math.sin(s.tw));
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!reduced) raf = requestAnimationFrame(draw);
    };
    const onVis = () => { cancelAnimationFrame(raf); if (!document.hidden && !reduced) { last = performance.now(); raf = requestAnimationFrame(draw); } };
    const onResize = () => { seed(); if (reduced) draw(performance.now()); };
    seed(); raf = requestAnimationFrame(draw);
    addEventListener('resize', onResize); document.addEventListener('visibilitychange', onVis);
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', onResize); document.removeEventListener('visibilitychange', onVis); };
  }, []);
  return <canvas ref={ref} aria-hidden="true" className="starfield fixed inset-0 -z-[1] pointer-events-none" />;
}
