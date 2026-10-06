// Deep-space backdrop (vanilla three.js, no post-processing): a real 3D starfield with depth, a faint
// Milky Way band, and a dark planet at the edge of the frame lit only by a thin champagne rim — the
// "sunrise from orbit" look. Calm by design: slow drift, gentle parallax, no bloom, no colour wash.
import * as THREE from 'three';

const rnd = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

const STAR_VERT = /* glsl */`
  attribute float aSize; attribute float aPhase; attribute vec3 aColor;
  uniform float uTime; uniform float uPixelRatio;
  varying vec3 vColor; varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(1.2 * uPixelRatio, aSize * uPixelRatio * (1500.0 / -mv.z));
    float tw = 0.78 + 0.22 * sin(uTime * (0.35 + fract(aPhase * 7.13) * 0.9) + aPhase * 6.2831);
    vAlpha = tw; vColor = aColor;
  }`;
const STAR_FRAG = /* glsl */`
  varying vec3 vColor; varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5; float d = length(c);
    float core = smoothstep(0.5, 0.0, d); core *= core;
    if (core < 0.01) discard;
    gl_FragColor = vec4(vColor, core * vAlpha);
  }`;

const PLANET_VERT = /* glsl */`
  varying vec3 vNormal; varying vec3 vView; varying vec3 vPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - wp.xyz);
    vPos = position;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const PLANET_FRAG = /* glsl */`
  uniform vec3 uLight; uniform vec3 uRim; uniform float uTime; uniform float uFade;
  varying vec3 vNormal; varying vec3 vView; varying vec3 vPos;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  float noise(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z); }
  void main() {
    vec3 n = normalize(vNormal); vec3 v = normalize(vView);
    float ndl = dot(n, normalize(uLight));
    // Back-lit: only a sliver of the day side shows; the rest is near-black with faint cloud bands.
    float day = smoothstep(0.0, 0.5, ndl);
    float bands = noise(vec3(vPos.x * 3.0, vPos.y * 9.0 + uTime * 0.02, vPos.z * 3.0)) * 0.6 + noise(vPos * 8.0) * 0.4;
    vec3 surface = vec3(0.006) + vec3(0.016, 0.014, 0.012) * day * (0.6 + bands * 0.8);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 5.0);
    float limb = fres * smoothstep(0.05, 0.75, ndl);          // thin, only where the limb faces the light
    float crescent = pow(max(ndl, 0.0), 6.0) * fres * 0.6;     // a sliver of lit atmosphere hugging the edge
    vec3 col = surface + uRim * (limb * 1.25 + crescent);
    gl_FragColor = vec4(col * uFade, 1.0);
  }`;
const ATMO_FRAG = /* glsl */`
  uniform vec3 uLight; uniform vec3 uRim; uniform float uFade;
  varying vec3 vNormal; varying vec3 vView;
  void main() {
    vec3 n = normalize(vNormal); vec3 v = normalize(vView);
    // Back faces of a slightly larger shell: brightest right at the planet's edge, fading out into space.
    float d = -dot(n, v);                       // 0 at the shell's outer edge → ~0.33 at the planet's limb
    float glow = pow(smoothstep(0.0, 0.34, d), 2.2);
    float lit = smoothstep(-0.1, 0.65, dot(n, normalize(uLight))); // only the limb facing the light
    gl_FragColor = vec4(uRim, glow * lit * 0.42 * uFade);
  }`;

export function createSpaceScene(canvas, { mobile = false, reduced = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
  const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 4000);

  // ── Stars: three depth layers + a dim Milky Way band ──
  const r = rnd(20261006);
  const starCount = mobile ? 4500 : 12000, bandCount = mobile ? 6000 : 16000;
  const total = starCount + bandCount;
  const pos = new Float32Array(total * 3), size = new Float32Array(total), phase = new Float32Array(total), color = new Float32Array(total * 3);
  const warm = new THREE.Color('#fff1dc'), white = new THREE.Color('#ffffff'), pale = new THREE.Color('#e9edf5');
  const bandAxis = new THREE.Euler(0.42, 0.15, -0.62); // tilted band across the sky
  const q = new THREE.Quaternion().setFromEuler(bandAxis);
  const v = new THREE.Vector3();
  for (let i = 0; i < total; i++) {
    const inBand = i >= starCount;
    if (!inBand) {
      // Uniform sphere shell, 300–1600 units away, so parallax separates near and far stars.
      const u = r() * 2 - 1, th = r() * Math.PI * 2, rad = 300 + Math.pow(r(), 0.6) * 1300;
      v.set(Math.sqrt(1 - u * u) * Math.cos(th), u, Math.sqrt(1 - u * u) * Math.sin(th)).multiplyScalar(rad);
      size[i] = 0.55 + Math.pow(r(), 6) * 2.4;
    } else {
      // Gaussian-thick ring = galactic plane; tiny, dim points read as haze.
      const th = r() * Math.PI * 2, g = (r() + r() + r() - 1.5) * 0.11, rad = 900 + r() * 500;
      v.set(Math.cos(th), g, Math.sin(th)).multiplyScalar(rad).applyQuaternion(q);
      size[i] = 0.28 + r() * 0.42;
    }
    pos.set([v.x, v.y, v.z], i * 3);
    phase[i] = r();
    const c = inBand ? (r() < 0.5 ? warm : pale) : (r() < 0.75 ? white : r() < 0.6 ? warm : pale);
    const k = inBand ? 0.38 + r() * 0.3 : 0.6 + r() * 0.4;
    color.set([c.r * k, c.g * k, c.b * k], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  g.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
  const starMat = new THREE.ShaderMaterial({
    vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPixelRatio: { value: dpr } },
  });
  const stars = new THREE.Points(g, starMat);
  scene.add(stars);

  // ── Planet at the edge of the frame, back-lit ──
  const light = new THREE.Vector3(-0.55, 0.62, -0.56).normalize();
  const rim = new THREE.Color('#f3e6c8');
  const planetGroup = new THREE.Group();
  const planet = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 96), new THREE.ShaderMaterial({
    vertexShader: PLANET_VERT, fragmentShader: PLANET_FRAG,
    uniforms: { uLight: { value: light }, uRim: { value: rim }, uTime: { value: 0 }, uFade: { value: 1 } },
  }));
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.06, 96, 96), new THREE.ShaderMaterial({
    vertexShader: PLANET_VERT, fragmentShader: ATMO_FRAG, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uLight: { value: light }, uRim: { value: rim }, uFade: { value: 1 } },
  }));
  planetGroup.add(planet, atmo);
  scene.add(planetGroup);

  // Keep the planet in the bottom-right corner at any aspect ratio (top-left limb visible).
  const home = new THREE.Vector3(); let rise = 0;
  function layout(w, h) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    const dist = 520, halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist, halfW = halfH * camera.aspect;
    const R = Math.max(halfH, halfW) * (mobile ? 0.62 : 0.55);
    planetGroup.scale.setScalar(R);
    home.set(halfW * (mobile ? 0.55 : 0.78) + R * 0.32, -halfH - R * (mobile ? 0.48 : 0.42), -dist);
    rise = R * 0.35;
    placePlanet();
  }

  // The landing hero has its own focal point (the dial), so the planet stays below the horizon there
  // and rises into frame once the hero scrolls away. Elsewhere it is always up.
  let vis = planetTarget(), curVis = vis;
  function planetTarget() {
    if (location.pathname !== '/') return 1;
    const t = (window.scrollY - innerHeight * 0.55) / (innerHeight * 0.7);
    return Math.min(1, Math.max(0, t));
  }
  function placePlanet() {
    const e = curVis * curVis * (3 - 2 * curVis);
    planetGroup.position.set(home.x, home.y - rise * (1 - e), home.z);
    planet.material.uniforms.uFade.value = e; atmo.material.uniforms.uFade.value = e;
    planetGroup.visible = e > 0.002;
  }

  // Gentle parallax from pointer and scroll (eased; tiny amplitudes).
  const target = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
  const onPointer = (e) => { target.x = (e.clientX / innerWidth - 0.5) * 2; target.y = (e.clientY / innerHeight - 0.5) * 2; };
  let scrollY = window.scrollY;
  const onScroll = () => { scrollY = window.scrollY; };
  if (!reduced) { addEventListener('pointermove', onPointer, { passive: true }); addEventListener('scroll', onScroll, { passive: true }); }

  const clock = new THREE.Timer();
  let raf = 0, running = false, last = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (now - last < 1000 / 40) return; // ~40 fps is plenty for slow motion and saves battery
    last = now;
    clock.update(now); const t = clock.getElapsed();
    cur.x += (target.x - cur.x) * 0.03; cur.y += (target.y - cur.y) * 0.03;
    const sc = Math.min(scrollY, 3000) / 3000;
    camera.position.set(cur.x * 6, -cur.y * 4 - sc * 10, 0);
    camera.lookAt(cur.x * 2, -cur.y * 1.5 - sc * 6, -500);
    stars.rotation.y = t * 0.0035; stars.rotation.x = t * 0.0012;
    planet.rotation.y = t * 0.01;
    vis = planetTarget(); curVis += (vis - curVis) * 0.06; placePlanet();
    starMat.uniforms.uTime.value = t; planet.material.uniforms.uTime.value = t;
    renderer.render(scene, camera);
  }
  const renderOnce = () => { curVis = planetTarget(); placePlanet(); renderer.render(scene, camera); };
  // Reduced motion: no animation loop, but the planet still has to appear when the landing hero scrolls away.
  let pending = 0;
  const onReducedScroll = () => { if (!pending && running) pending = requestAnimationFrame(() => { pending = 0; renderOnce(); }); };
  if (reduced) addEventListener('scroll', onReducedScroll, { passive: true });

  return {
    resize(w, h) { layout(w, h); if (!running) renderOnce(); },
    start() { if (running) return; running = true; if (reduced) { renderOnce(); return; } clock.reset(); raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); },
    dispose() {
      this.stop();
      removeEventListener('pointermove', onPointer); removeEventListener('scroll', onScroll); removeEventListener('scroll', onReducedScroll);
      g.dispose(); starMat.dispose(); planet.geometry.dispose(); planet.material.dispose(); atmo.geometry.dispose(); atmo.material.dispose();
      renderer.dispose();
    },
  };
}
