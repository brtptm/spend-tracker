import { useState } from 'react';
import { siPaytm, siJio, siAirtel, siBigbasket, siIkea, siUber, siNetflix, siSpotify, siYoutube, siStarbucks, siSwiggy, siZomato, siSteam } from 'simple-icons';
import LOGOS from '../lib/logos.json';
import { CategoryIcon } from './ui.jsx';

// Vector marks (CC0, simple-icons) used when the downloaded logo is missing or low-resolution.
const VECTOR = { paytm: siPaytm, paytmmoney: siPaytm, jio: siJio, airtel: siAirtel, airtelfiber: siAirtel, bigbasket: siBigbasket, ikea: siIkea, uber: siUber, netflix: siNetflix, spotify: siSpotify, youtube: siYoutube, starbucks: siStarbucks, swiggy: siSwiggy, zomato: siZomato, steam: siSteam };
const MIN_PNG = 64;

const initials = (name = '') => name.replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '·';
// Stable soft gradient per person, for P2P avatars.
function personHue(name) { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }

/**
 * Merchant/advertiser logo in a squircle tile.
 * Order: downloaded logo (≥64px) → vector brand mark → person avatar (P2P) → category glyph / monogram.
 */
export default function BrandLogo({ id, name = '', category, size = 40, color }) {
  const [broken, setBroken] = useState(false);
  const radius = Math.round(size * 0.28);
  const tile = { width: size, height: size, borderRadius: radius };
  const pngW = id ? LOGOS[id] : 0;
  const vector = id && VECTOR[id];

  if (id && pngW >= MIN_PNG && !broken) {
    return (
      <span className="relative inline-block shrink-0 overflow-hidden bg-white" style={{ ...tile, boxShadow: '0 0 0 1px var(--line), 0 4px 14px -6px rgba(0,0,0,.6)' }}>
        <img src={`/logos/${id}.png`} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} className="w-full h-full object-contain" />
      </span>
    );
  }
  if (vector) {
    return (
      <span className="inline-grid place-items-center shrink-0" style={{ ...tile, background: `#${vector.hex}`, boxShadow: '0 4px 14px -6px rgba(0,0,0,.6)' }} aria-hidden="true">
        <svg viewBox="0 0 24 24" width={size * 0.56} height={size * 0.56} fill={vector.hex === 'FFFFFF' ? '#000' : '#fff'}><path d={vector.path} /></svg>
      </span>
    );
  }
  if (id && pngW && !broken) {
    // Low-res logo: show it small inside a tile so it stays crisp.
    return (
      <span className="inline-grid place-items-center shrink-0 bg-white" style={tile}>
        <img src={`/logos/${id}.png`} alt="" loading="lazy" onError={() => setBroken(true)} style={{ width: Math.min(pngW, size * 0.62), height: Math.min(pngW, size * 0.62) }} />
      </span>
    );
  }
  if (category === 'p2p') {
    const h = personHue(name);
    return (
      <span className="inline-grid place-items-center shrink-0 rounded-full text-white font-semibold" style={{ width: size, height: size, fontSize: size * 0.36, background: `linear-gradient(140deg, hsl(${h} 55% 52%), hsl(${(h + 40) % 360} 55% 38%))` }} aria-hidden="true">
        {initials(name)}
      </span>
    );
  }
  if (category) return <CategoryIcon id={category} size={Math.round(size * 0.42)} />;
  return (
    <span className="inline-grid place-items-center shrink-0 text-white font-semibold" style={{ ...tile, fontSize: size * 0.34, background: color || 'var(--surface-3)' }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
