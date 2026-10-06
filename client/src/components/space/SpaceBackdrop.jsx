import { useEffect, useRef, useState } from 'react';
import Starfield from '../Starfield.jsx';

const hasWebGL = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } };
const isDark = () => document.documentElement.dataset.theme !== 'light';

/**
 * Dark theme backdrop: the 2D starfield paints instantly, then the three.js deep-space scene
 * (loaded after first paint, in its own chunk) fades in over it. Light theme shows neither.
 */
export default function SpaceBackdrop() {
  const ref = useRef(null);
  const [ready, setReady] = useState(false);
  const [dark, setDark] = useState(isDark);

  useEffect(() => {
    const mo = new MutationObserver(() => setDark(isDark()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    if (!dark || !hasWebGL()) return;
    let scene = null, cancelled = false;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mobile = matchMedia('(max-width: 768px)').matches;
    const onResize = () => scene?.resize(innerWidth, innerHeight);
    const onVis = () => (document.hidden ? scene?.stop() : scene?.start());
    const boot = async () => {
      const { createSpaceScene } = await import('./SpaceScene.js');
      if (cancelled || !ref.current) return;
      try {
        scene = createSpaceScene(ref.current, { mobile, reduced });
        scene.resize(innerWidth, innerHeight);
        scene.start();
        setReady(true);
      } catch { /* WebGL context failed — the 2D starfield stays */ }
    };
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 300));
    const handle = idle(boot);
    addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true; (window.cancelIdleCallback || clearTimeout)(handle);
      removeEventListener('resize', onResize); document.removeEventListener('visibilitychange', onVis);
      scene?.dispose(); setReady(false);
    };
  }, [dark]);

  if (!dark) return null;
  return (
    <>
      {!ready && <Starfield />}
      <canvas ref={ref} aria-hidden="true" className="fixed inset-0 -z-[1] w-screen h-[100lvh] pointer-events-none transition-opacity duration-[1200ms]" style={{ opacity: ready ? 1 : 0 }} />
    </>
  );
}
