import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';

const LIME = new THREE.Color('#c6f432');
const CYAN = new THREE.Color('#45d7ff');
const inrShort = (n) => { const a = Math.abs(n); return a >= 1e5 ? `₹${(n / 1e5).toFixed(1)}L` : a >= 1e3 ? `₹${Math.round(n / 1e3)}k` : `₹${Math.round(n)}`; };

function useGlow() {
  return useMemo(() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'); const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.22, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }, []);
}

function Stars({ count = 1400 }) {
  const glow = useGlow();
  const ref = useRef();
  const pos = useMemo(() => {
    const p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { const r = 30 + Math.random() * 40, t = Math.random() * Math.PI * 2, f = Math.acos(2 * Math.random() - 1); p.set([r * Math.sin(f) * Math.cos(t), r * Math.sin(f) * Math.sin(t), r * Math.cos(f)], i * 3); }
    return p;
  }, [count]);
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * 0.006; });
  return (
    <points ref={ref}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[pos, 3]} /></bufferGeometry>
      <pointsMaterial size={0.28} map={glow} color="#9fb2ff" transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

/** The wallet: a glowing lime core inside a slowly turning cyan lattice. */
function Core() {
  const lattice = useRef(), halo = useRef(), glow = useGlow();
  useFrame((s, dt) => {
    if (lattice.current) { lattice.current.rotation.y += dt * 0.25; lattice.current.rotation.x += dt * 0.08; }
    if (halo.current) { const k = 3.2 + Math.sin(s.clock.elapsedTime * 1.6) * 0.25; halo.current.scale.setScalar(k); }
  });
  return (
    <group>
      <mesh>
        <icosahedronGeometry args={[0.78, 3]} />
        <meshStandardMaterial color={LIME} emissive={LIME} emissiveIntensity={0.9} roughness={0.35} metalness={0.2} toneMapped={false} />
      </mesh>
      <mesh ref={lattice}>
        <icosahedronGeometry args={[1.12, 1]} />
        <meshBasicMaterial color={CYAN} wireframe transparent opacity={0.35} />
      </mesh>
      <sprite ref={halo} scale={3.2}>
        <spriteMaterial map={glow} color="#d9ff6a" transparent opacity={0.35} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
    </group>
  );
}

function orbitOf(i, n) {
  return { radius: 2.35 + i * 0.78, tilt: ((i % 3) - 1) * 0.16 + (i % 2 ? 0.08 : -0.05), speed: 0.32 / (1 + i * 0.35), phase: (i / Math.max(1, n)) * Math.PI * 2 + i * 0.7 };
}
const planetPos = (o, t, out) => {
  const a = o.phase + t * o.speed;
  out.set(Math.cos(a) * o.radius, Math.sin(a) * o.radius * Math.sin(o.tilt) * 1.4, Math.sin(a) * o.radius);
  return out;
};

function OrbitRing({ radius, tilt, color }) {
  const pts = useMemo(() => {
    const arr = [];
    for (let k = 0; k <= 128; k++) { const a = (k / 128) * Math.PI * 2; arr.push(Math.cos(a) * radius, Math.sin(a) * radius * Math.sin(tilt) * 1.4, Math.sin(a) * radius); }
    return new Float32Array(arr);
  }, [radius, tilt]);
  return (
    <line>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[pts, 3]} /></bufferGeometry>
      <lineBasicMaterial color={color} transparent opacity={0.16} />
    </line>
  );
}

function Planet({ p, orbit, size, selected, onSelect, onHover, hovered, interactive, positions }) {
  const ref = useRef(), glowRef = useRef(), glow = useGlow();
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame((s) => {
    planetPos(orbit, s.clock.elapsedTime, v);
    ref.current?.position.copy(v);
    positions.current[p.id] = { v, size };
    const target = hovered || selected ? 1.35 : 1;
    if (ref.current) ref.current.scale.lerp(new THREE.Vector3(target, target, target), 0.12);
    if (glowRef.current) glowRef.current.material.opacity = selected ? 0.75 : hovered ? 0.6 : 0.32;
  });
  return (
    <group ref={ref}>
      <mesh
        onPointerOver={interactive ? (e) => { e.stopPropagation(); onHover(p.id); document.body.style.cursor = 'pointer'; } : undefined}
        onPointerOut={interactive ? () => { onHover(null); document.body.style.cursor = ''; } : undefined}
        onClick={interactive ? (e) => { e.stopPropagation(); onSelect?.(p.id); } : undefined}
      >
        <sphereGeometry args={[size, 32, 32]} />
        <meshStandardMaterial color={p.color} emissive={p.color} emissiveIntensity={0.45} roughness={0.4} metalness={0.25} />
      </mesh>
      <sprite ref={glowRef} scale={size * 5}>
        <spriteMaterial map={glow} color={p.color} transparent opacity={0.32} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
    </group>
  );
}

/** Light particles flowing from the wallet to each category, rate ∝ spend. */
function Flows({ planets, orbits, budget = 900 }) {
  const glow = useGlow();
  const { geo, meta } = useMemo(() => {
    const total = planets.reduce((s, p) => s + p.amount, 0) || 1;
    const meta = [];
    planets.forEach((p, i) => { const n = Math.max(14, Math.round((p.amount / total) * budget)); for (let k = 0; k < n; k++) meta.push({ i, t: Math.random(), speed: 0.18 + Math.random() * 0.22, lift: 0.4 + Math.random() * 0.9, jitter: (Math.random() - 0.5) * 0.5 }); });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(meta.length * 3), 3));
    const col = new Float32Array(meta.length * 3);
    meta.forEach((m, k) => { const c = new THREE.Color(planets[m.i].color); col.set([c.r, c.g, c.b], k * 3); });
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return { geo: g, meta };
  }, [planets, budget]);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame((s, dt) => {
    const pos = geo.attributes.position.array;
    const time = s.clock.elapsedTime;
    const targets = orbits.map((o) => planetPos(o, time, new THREE.Vector3()));
    for (let k = 0; k < meta.length; k++) {
      const m = meta[k];
      m.t += dt * m.speed; if (m.t > 1) m.t -= 1;
      const P = targets[m.i];
      const t = m.t, u = 1 - t;
      // Quadratic bezier from the core, arcing upward, into the planet.
      const cx = P.x * 0.5 + m.jitter, cy = P.y * 0.5 + m.lift, cz = P.z * 0.5 - m.jitter;
      tmp.set(2 * u * t * cx + t * t * P.x, 2 * u * t * cy + t * t * P.y, 2 * u * t * cz + t * t * P.z);
      pos[k * 3] = tmp.x; pos[k * 3 + 1] = tmp.y; pos[k * 3 + 2] = tmp.z;
    }
    geo.attributes.position.needsUpdate = true;
  });
  return (
    <points geometry={geo}>
      <pointsMaterial size={0.11} map={glow} vertexColors transparent opacity={0.9} depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

/** Moves one DOM label to follow the hovered/selected planet (no extra React roots). */
function LabelTracker({ id, positions, labelRef, group }) {
  const { camera, size } = useThree();
  const w = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const el = labelRef.current;
    const hit = id && positions.current[id];
    if (!el) return;
    if (!hit || !group.current) { el.style.opacity = '0'; return; }
    w.copy(hit.v).add(new THREE.Vector3(0, hit.size + 0.35, 0));
    group.current.localToWorld(w);
    w.project(camera);
    el.style.opacity = '1';
    el.style.transform = `translate(-50%, -100%) translate(${((w.x + 1) / 2) * size.width}px, ${((1 - w.y) / 2) * size.height}px)`;
  });
  return null;
}

function Rig({ strength, base }) {
  const { camera, pointer } = useThree();
  useFrame((s, dt) => {
    const t = s.clock.elapsedTime;
    camera.position.x += (base[0] + pointer.x * strength + Math.sin(t * 0.1) * 0.4 - camera.position.x) * Math.min(1, dt * 2);
    camera.position.y += (base[1] + pointer.y * strength * 0.5 - camera.position.y) * Math.min(1, dt * 2);
    camera.lookAt(0, 0, 0);
  });
  return null;
}

export default function UniverseScene({ planets, total, onSelect, selected, variant = 'dashboard', paused, interactive = true, offset = [0, 0, 0] }) {
  const [hovered, setHovered] = useState(null);
  const positions = useRef({});
  const group = useRef();
  const labelRef = useRef(null);
  const list = useMemo(() => [...planets].sort((a, b) => b.amount - a.amount).slice(0, 7), [planets]);
  const sum = list.reduce((s, p) => s + p.amount, 0) || 1;
  const orbits = useMemo(() => list.map((_, i) => orbitOf(i, list.length)), [list]);
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cam = variant === 'hero' ? [0, 4.4, 14.5] : [0, 6.4, 14];
  const labelled = list.find((p) => p.id === (hovered || selected));
  return (
    <div className="absolute inset-0">
    <Canvas frameloop={paused ? 'never' : reduced ? 'demand' : 'always'} dpr={[1, 1.75]} camera={{ position: cam, fov: 42 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }} style={{ position: 'absolute', inset: 0 }}
      eventSource={document.getElementById('root')} eventPrefix="client" onPointerMissed={() => interactive && onSelect?.(null)}>
      <ambientLight intensity={0.35} />
      <pointLight position={[0, 0, 0]} intensity={40} distance={20} color="#d9ff6a" />
      <directionalLight position={[6, 8, 6]} intensity={0.9} color="#bfe9ff" />
      <Stars />
      <group ref={group} position={offset} rotation={[0.12, 0, -0.06]}>
        <Core />
        {list.map((p, i) => <OrbitRing key={`r-${p.id}`} radius={orbits[i].radius} tilt={orbits[i].tilt} color={p.color} />)}
        {list.map((p, i) => (
          <Planet key={p.id} p={p} orbit={orbits[i]} size={0.2 + 0.62 * Math.sqrt(p.amount / sum)} interactive={interactive}
            hovered={hovered === p.id} selected={selected === p.id} onHover={setHovered} onSelect={onSelect} positions={positions} />
        ))}
        <Flows planets={list} orbits={orbits} budget={variant === 'hero' ? 1100 : 800} />
      </group>
      {!reduced && <Rig strength={variant === 'hero' ? 1.2 : 0.7} base={cam} />}
      <LabelTracker id={labelled?.id} positions={positions} labelRef={labelRef} group={group} />
    </Canvas>
    <div ref={labelRef} aria-hidden="true" className="absolute left-0 top-0 pointer-events-none transition-opacity duration-150" style={{ opacity: 0 }}>
      {labelled && (
        <div style={{ background: 'rgba(7,10,19,.88)', border: `1px solid ${labelled.color}`, borderRadius: 10, padding: '6px 10px', whiteSpace: 'nowrap', font: '500 12px Geist, sans-serif', color: '#eef1fa' }}>
          {labelled.name} <b style={{ color: labelled.color, marginLeft: 6 }}>{inrShort(labelled.amount)}</b>
        </div>
      )}
    </div>
    </div>
  );
}
