import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer } from '@react-three/drei';

const inrShort = (n) => { const a = Math.abs(n); return a >= 1e5 ? `₹${(n / 1e5).toFixed(1)}L` : a >= 1e3 ? `₹${Math.round(n / 1e3)}k` : `₹${Math.round(n)}`; };
const easeOut = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/** Procedural studio lighting — soft boxes reflected in the clearcoat. No HDR downloads. */
function Studio() {
  return (
    <Environment resolution={256} frames={1}>
      <Lightformer form="rect" intensity={2.2} position={[0, 5, -2]} scale={[10, 2.5, 1]} rotation-x={Math.PI / 2.4} />
      <Lightformer form="rect" intensity={1.2} position={[-6, 1, 2]} scale={[2, 8, 1]} rotation-y={Math.PI / 2} />
      <Lightformer form="rect" intensity={0.8} position={[6, -1, 2]} scale={[2, 8, 1]} rotation-y={-Math.PI / 2} />
      <Lightformer form="ring" intensity={0.6} position={[0, -4, 3]} scale={3} />
    </Environment>
  );
}

/** One category arc: a torus segment with rounded caps. */
function Segment({ seg, R, tube, hovered, dimmed, onHover, onSelect, interactive, index, start, labelPos }) {
  const group = useRef();
  const mats = useRef([]);
  const geo = useMemo(() => new THREE.TorusGeometry(R, tube, 40, Math.max(12, Math.round(220 * seg.span / (Math.PI * 2))), seg.span), [R, tube, seg.span]);
  const capA = useMemo(() => new THREE.Vector3(R, 0, 0), [R]);
  const capB = useMemo(() => new THREE.Vector3(Math.cos(seg.span) * R, Math.sin(seg.span) * R, 0), [R, seg.span]);
  const mid = seg.start + seg.span / 2;
  const dir = useMemo(() => new THREE.Vector3(Math.cos(mid), Math.sin(mid), 0), [mid]);
  const color = useMemo(() => new THREE.Color(seg.color), [seg.color]);

  useFrame((state) => {
    const g = group.current; if (!g) return;
    const t = state.clock.elapsedTime - start - index * 0.09;
    const k = easeOut(t / 1.1);
    const lift = hovered ? 0.2 : 0;
    // Rise in from below the plane, then settle; hovered segments slide outward.
    g.position.x += (dir.x * lift - g.position.x) * 0.14;
    g.position.y += (dir.y * lift - g.position.y) * 0.14;
    g.position.z = (1 - k) * -1.2 + (hovered ? 0.12 : 0);
    const s = 0.86 + 0.14 * k;
    g.scale.setScalar(s);
    for (const m of mats.current) if (m) { m.opacity = k * (dimmed ? 0.35 : 1); m.emissiveIntensity = hovered ? 0.18 : 0.02; }
    if (hovered && labelPos) labelPos.current = { v: dir.clone().multiplyScalar(R + tube + 0.55).add(g.position), color: seg.color };
  });

  const material = (i) => (
    <meshPhysicalMaterial ref={(m) => (mats.current[i] = m)} color={color} emissive={color} emissiveIntensity={0.02} roughness={0.5} metalness={0.02}
      clearcoat={0.25} clearcoatRoughness={0.35} sheen={0.25} sheenRoughness={0.8} envMapIntensity={0.85} transparent opacity={0} />
  );
  const handlers = interactive ? {
    onPointerOver: (e) => { e.stopPropagation(); onHover(seg.id); document.body.style.cursor = 'pointer'; },
    onPointerOut: () => { onHover(null); document.body.style.cursor = ''; },
    onClick: (e) => { e.stopPropagation(); onSelect?.(seg.id); },
  } : {};

  return (
    <group ref={group}>
      <group rotation-z={seg.start}>
        <mesh geometry={geo} {...handlers}>{material(0)}</mesh>
        <mesh position={capA} {...handlers}><sphereGeometry args={[tube, 32, 24]} />{material(1)}</mesh>
        <mesh position={capB} {...handlers}><sphereGeometry args={[tube, 32, 24]} />{material(2)}</mesh>
      </group>
    </group>
  );
}

function Label({ id, labelPos, labelRef, ring }) {
  const { camera, size } = useThree();
  const w = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const el = labelRef.current; if (!el) return;
    if (!id || !labelPos.current || !ring.current) { el.style.opacity = '0'; return; }
    w.copy(labelPos.current.v); ring.current.localToWorld(w); w.project(camera);
    el.style.opacity = '1';
    el.style.transform = `translate(-50%, -50%) translate(${((w.x + 1) / 2) * size.width}px, ${((1 - w.y) / 2) * size.height}px)`;
  });
  return null;
}

/** Float + pointer tilt for the whole ring. */
function Rig({ ring, tilt, strength }) {
  const { pointer } = useThree();
  useFrame((state) => {
    const g = ring.current; if (!g) return;
    const t = state.clock.elapsedTime;
    g.rotation.x += (tilt[0] - pointer.y * 0.18 * strength - g.rotation.x) * 0.05;
    g.rotation.y += (tilt[1] + pointer.x * 0.25 * strength - g.rotation.y) * 0.05;
    g.rotation.z = tilt[2] + t * 0.035;
    g.position.y = Math.sin(t * 0.8) * 0.06;
  });
  return null;
}

export default function RingScene({ segments, onSelect, interactive = true, variant = 'card', paused, gap }) {
  const [hovered, setHovered] = useState(null);
  const ring = useRef();
  const labelPos = useRef(null);
  const labelRef = useRef(null);
  const start = useRef(null);
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const hero = variant === 'hero';
  const segs = useMemo(() => {
    const list = segments.filter((s) => s.amount > 0);
    const total = list.reduce((a, s) => a + s.amount, 0) || 1;
    const n = list.length;
    const g = gap ?? (hero ? 0.085 : 0.06);
    const capAngle = (2 * (hero ? 0.2 : 0.15)) / (hero ? 2.45 : 2.1); // rounded caps add this much arc
    const usable = Math.PI * 2 - (g + capAngle) * n;
    let a = Math.PI / 2; // start at 12 o'clock, go clockwise
    return list.map((s) => {
      const span = Math.max(0.02, (s.amount / total) * usable);
      const seg = { ...s, span, start: a - span - capAngle / 2 };
      a -= span + g + capAngle;
      return seg;
    });
  }, [segments, gap, hero]);

  const R = hero ? 2.45 : 2.1;
  const tube = hero ? 0.2 : 0.15;
  const tilt = hero ? [-0.95, 0, 0] : [-0.22, 0.05, 0];
  const hov = segs.find((s) => s.id === hovered);

  return (
    <div className="absolute inset-0">
      <Canvas frameloop={paused ? 'never' : reduced ? 'demand' : 'always'} dpr={[1, 2]} camera={{ position: [0, 0, hero ? 8.6 : 9.2], fov: 36 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
        style={{ position: 'absolute', inset: 0 }} eventSource={document.getElementById('root')} eventPrefix="client"
        onCreated={(s) => { start.current = s.clock.elapsedTime + 0.15; }}>
        <Studio />
        <ambientLight intensity={0.15} />
        <group ref={ring} rotation={tilt}>
          {segs.map((s, i) => (
            <Segment key={s.id} seg={s} R={R} tube={tube} index={i} start={start.current ?? 0.15} interactive={interactive}
              hovered={hovered === s.id} dimmed={!!hovered && hovered !== s.id} onHover={setHovered} onSelect={onSelect} labelPos={labelPos} />
          ))}
        </group>
        {!reduced && <Rig ring={ring} tilt={tilt} strength={hero ? 1 : 0.6} />}
        <Label id={hovered} labelPos={labelPos} labelRef={labelRef} ring={ring} />
      </Canvas>
      <div ref={labelRef} aria-hidden="true" className="absolute left-0 top-0 pointer-events-none transition-opacity duration-200" style={{ opacity: 0 }}>
        {hov && (
          <div className="glass rounded-xl px-3 py-2 text-[12.5px] whitespace-nowrap shadow-xl">
            <span className="inline-block w-2 h-2 rounded-full mr-2 align-middle" style={{ background: hov.color }} />
            <span className="text-ink-2">{hov.name}</span> <b className="text-ink ml-1">{inrShort(hov.amount)}</b>
          </div>
        )}
      </div>
    </div>
  );
}
