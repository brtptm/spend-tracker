import { useEffect, useRef, useState } from 'react';
import { animate, motion, useInView, AnimatePresence } from 'motion/react';
import { FiAlertTriangle, FiInbox, FiX, FiLoader, FiCheck } from 'react-icons/fi';
import {
  PiHamburgerDuotone, PiShoppingBagOpenDuotone, PiTaxiDuotone, PiFilmSlateDuotone, PiLightningDuotone, PiFirstAidKitDuotone, PiUsersThreeDuotone, PiWalletDuotone,
} from 'react-icons/pi';
import { inr } from '../lib/format.js';

export const CAT_ICON = { food: PiHamburgerDuotone, shopping: PiShoppingBagOpenDuotone, transport: PiTaxiDuotone, entertainment: PiFilmSlateDuotone, bills: PiLightningDuotone, personal: PiFirstAidKitDuotone, p2p: PiUsersThreeDuotone, total: PiWalletDuotone };

export function Logo({ size = 28, text = true }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <ellipse cx="16" cy="16" rx="13" ry="5.6" fill="none" stroke="var(--cyan)" strokeWidth="1.8" transform="rotate(-24 16 16)" />
        <circle cx="16" cy="16" r="5.4" fill="var(--lime)" />
        <circle cx="27" cy="11.3" r="2.3" fill="var(--cyan)" />
      </svg>
      {text && <span className="font-display font-bold text-[1.12rem] tracking-tight" style={{ fontVariationSettings: "'wdth' 88" }}>Spend Tracker</span>}
    </span>
  );
}

/** Animated rupee/number ticker. Animates from whatever is currently shown to the new value. */
export function Ticker({ value, format = inr, duration = 1.1 }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const shown = useRef(0);
  const fmt = useRef(format);
  fmt.current = format;
  useEffect(() => {
    const el = ref.current;
    if (!inView || !el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || shown.current === value) { el.textContent = fmt.current(value); shown.current = value; return; }
    const c = animate(shown.current, value, { duration, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => { shown.current = v; el.textContent = fmt.current(v); }, onComplete: () => { shown.current = value; el.textContent = fmt.current(value); } });
    return () => c.stop();
  }, [value, inView, duration]);
  return <span ref={ref}>{format(0)}</span>;
}

export function CategoryIcon({ id, color, size = 20 }) {
  const Icon = CAT_ICON[id] || PiWalletDuotone;
  return <span className="inline-grid place-items-center rounded-xl shrink-0" style={{ width: size * 1.9, height: size * 1.9, background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}><Icon size={size} /></span>;
}

export function Bar({ value, max = 100, color = 'var(--cyan)', height = 8, marker, label }) {
  const v = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return (
    <div className="relative w-full rounded-full bg-surface-3 overflow-hidden" style={{ height }} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <motion.div className="h-full rounded-full" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${v}%` }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }} />
      {marker != null && <span className="absolute top-0 bottom-0 w-0.5 bg-ink" style={{ left: `${Math.min(100, (marker / (max || 1)) * 100)}%` }} />}
    </div>
  );
}

export const SEVERITY = {
  critical: { color: 'var(--coral)', label: 'Overspending' },
  warning: { color: 'var(--amber)', label: 'Heads up' },
  info: { color: 'var(--cyan)', label: 'Opportunity' },
  positive: { color: 'var(--lime-text)', label: 'Doing well' },
};

export function Spinner({ label = 'Loading' }) {
  return <div className="grid place-items-center py-20 text-ink-3" role="status"><FiLoader className="spin" size={22} /><span className="mt-3 text-sm">{label}</span></div>;
}
export function Skeleton({ h = 120, className = '' }) { return <div className={`skeleton ${className}`} style={{ height: h }} />; }

export function ErrorNote({ error, onRetry }) {
  if (!error) return null;
  return (
    <div role="alert" className="panel-quiet px-4 py-3 text-sm flex items-start gap-2.5" style={{ color: 'var(--coral)' }}>
      <FiAlertTriangle className="mt-0.5 shrink-0" /><span className="flex-1">{error.message || String(error)}</span>
      {onRetry && <button className="underline font-semibold" onClick={onRetry}>Try again</button>}
    </div>
  );
}

export function Empty({ title, body, action }) {
  return <div className="panel p-10 text-center"><FiInbox className="mx-auto text-ink-3" size={26} /><h3 className="text-lg mt-3">{title}</h3>{body && <p className="text-ink-2 mt-2 max-w-sm mx-auto">{body}</p>}{action && <div className="mt-5">{action}</div>}</div>;
}

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  return (
    <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 sm:p-4" role="dialog" aria-modal="true" aria-label={title} onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <motion.div className={`panel w-full ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'} max-h-[88vh] overflow-y-auto rounded-b-none sm:rounded-b-[20px]`} onClick={(e) => e.stopPropagation()} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', damping: 26, stiffness: 300 }}>
        <div className="sticky top-0 z-10 bg-surface flex items-center justify-between gap-3 px-6 py-4 border-b border-line">
          <h2 className="text-lg">{title}</h2>
          <button className="w-8 h-8 grid place-items-center rounded-full text-ink-3 hover:text-ink hover:bg-surface-2" onClick={onClose} aria-label="Close"><FiX /></button>
        </div>
        <div className="p-6">{children}</div>
      </motion.div>
    </motion.div>
  );
}

export function Segmented({ options, value, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex p-1 rounded-full bg-surface-2 border border-line">
      {options.map(([v, l]) => (
        <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)} className="relative px-3.5 py-1.5 text-[13px] font-semibold rounded-full transition-colors" style={{ color: value === v ? 'var(--bg)' : 'var(--ink-2)' }}>
          {value === v && <motion.span layoutId={`seg-${label}`} className="absolute inset-0 rounded-full bg-ink" transition={{ type: 'spring', damping: 30, stiffness: 400 }} />}
          <span className="relative">{l}</span>
        </button>
      ))}
    </div>
  );
}

export function Toast({ message, onDone }) {
  useEffect(() => { if (!message) return; const t = setTimeout(onDone, 2600); return () => clearTimeout(t); }, [message, onDone]);
  return (
    <AnimatePresence>
      {message && (
        <motion.div role="status" className="fixed bottom-24 lg:bottom-8 left-1/2 z-50 -translate-x-1/2 glass rounded-full px-5 py-2.5 text-sm font-semibold flex items-center gap-2" initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}>
          <FiCheck style={{ color: 'var(--lime-text)' }} /> {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function SourceTag({ source }) {
  if (!source) return null;
  return <span className="text-xs text-ink-3">{source === 'claude' ? '✦ Written by Claude' : 'Spend Tracker engine'}</span>;
}

export function PageHead({ title, sub, right }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div><h1 className="text-[2rem] sm:text-[2.4rem]">{title}</h1>{sub && <p className="text-ink-2 mt-1.5">{sub}</p>}</div>
      {right}
    </header>
  );
}

/** Staggered entrance for a list of cards — used once per page, not everywhere. */
export const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
export const rise = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } } };
