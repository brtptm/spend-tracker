import { useEffect, useRef, useState } from 'react';
import { animate, motion, useInView, AnimatePresence } from 'motion/react';
import { FiAlertTriangle, FiInbox, FiX, FiCheck } from 'react-icons/fi';
import { PiForkKnifeFill, PiShoppingBagFill, PiCarProfileFill, PiFilmSlateFill, PiLightningFill, PiHeartbeatFill, PiUsersFill, PiWalletFill } from 'react-icons/pi';
import { inr } from '../lib/format.js';
import { useTheme } from '../lib/theme.js';

export const CAT_ICON = { food: PiForkKnifeFill, shopping: PiShoppingBagFill, transport: PiCarProfileFill, entertainment: PiFilmSlateFill, bills: PiLightningFill, personal: PiHeartbeatFill, p2p: PiUsersFill, total: PiWalletFill };

export function Logo({ size = 26, text = true }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r="11" fill="none" stroke="var(--surface-3)" strokeWidth="4" />
        <path d="M16 5a11 11 0 0 1 10.46 14.4" fill="none" stroke="var(--ink)" strokeWidth="4" strokeLinecap="round" />
      </svg>
      {text && <span className="font-semibold text-[1.02rem] tracking-[-0.02em]">Spend Tracker</span>}
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

/** Apple-Card style: white glyph on a solid category circle. */
export function CategoryIcon({ id, color, size = 18 }) {
  const Icon = CAT_ICON[id] || PiWalletFill;
  const d = Math.round(size * 2);
  return <span className="inline-grid place-items-center rounded-full shrink-0 text-white" style={{ width: d, height: d, background: color || `var(--cat-${id}, var(--surface-3))` }}><Icon size={size} /></span>;
}

/** Matte-glass progress: a faint track; the fill fades in from translucent to its color, with a soft lit tip. */
export function Bar({ value, max = 100, color = 'var(--ink)', height = 5, marker, label }) {
  const v = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  return (
    <div className="relative w-full rounded-full bg-fg/[.06]" style={{ height }} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <motion.div className="h-full rounded-full" style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${color} 55%, transparent), ${color})`, boxShadow: `0 0 12px -2px color-mix(in srgb, ${color} 55%, transparent)` }} initial={{ width: 0 }} animate={{ width: `${v}%` }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }} />
      {marker != null && <span className="absolute -top-0.5 -bottom-0.5 w-[2px] rounded-full bg-ink-2" style={{ left: `${Math.min(100, (marker / (max || 1)) * 100)}%` }} />}
    </div>
  );
}

export const SEVERITY = {
  critical: { color: 'var(--negative)', label: 'Overspending' },
  warning: { color: 'var(--warning)', label: 'Heads up' },
  info: { color: 'var(--link)', label: 'Opportunity' },
  positive: { color: 'var(--positive)', label: 'Doing well' },
};

/** Page loader: a thin rotating arc (echoing the logo), fixed to the centre of the screen. */
export function Spinner({ label = 'Loading' }) {
  return (
    <div className="fixed inset-0 z-20 grid place-items-center pointer-events-none" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3.5 text-ink-3">
        <svg width="34" height="34" viewBox="0 0 34 34" className="spin" style={{ animationDuration: '.9s' }} aria-hidden="true">
          <circle cx="17" cy="17" r="14" fill="none" stroke="currentColor" strokeOpacity=".15" strokeWidth="2.5" />
          <circle cx="17" cy="17" r="14" fill="none" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="22 88" />
        </svg>
        <span className="text-[13px]">{label}</span>
      </div>
    </div>
  );
}
export function Skeleton({ h = 120, className = '' }) { return <div className={`skeleton ${className}`} style={{ height: h }} />; }

export function ErrorNote({ error, onRetry }) {
  if (!error) return null;
  return (
    <div role="alert" className="panel-quiet px-4 py-3 text-sm flex items-start gap-2.5" style={{ color: 'var(--coral)' }}>
      <FiAlertTriangle className="mt-0.5 shrink-0" /><span className="flex-1">{error.message || String(error)}</span>
      {onRetry && <button className="font-semibold" onClick={onRetry}>Try again</button>}
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

/** iOS-style segmented control. */
export function Segmented({ options, value, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex p-[3px] rounded-[11px] bg-surface-2 max-w-full overflow-x-auto no-scrollbar">
      {options.map(([v, l]) => (
        <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)} className="relative px-3.5 py-[5px] text-[13px] font-medium rounded-[9px] whitespace-nowrap transition-colors" style={{ color: value === v ? 'var(--ink)' : 'var(--ink-2)' }}>
          {value === v && <motion.span layoutId={`seg-${label}`} className="absolute inset-0 rounded-[9px] bg-surface-3 shadow-[0_1px_3px_rgba(0,0,0,.3)]" transition={{ type: 'spring', damping: 32, stiffness: 420 }} />}
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
          <FiCheck style={{ color: 'var(--positive)' }} /> {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function SourceTag({ source }) {
  if (!source) return null;
  return <span className="text-xs text-ink-3">{source === 'claude' ? 'Written by Claude' : 'Spend Tracker engine'}</span>;
}

export function PageHead({ title, sub, right }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div><h1 className="text-[2rem] sm:text-[2.6rem]">{title}</h1>{sub && <p className="text-ink-2 mt-2 text-[15px]">{sub}</p>}</div>
      {right && <div className="min-w-0 max-w-full">{right}</div>}
    </header>
  );
}

/** Staggered entrance for a list of cards — used once per page, not everywhere. */
export const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
export const rise = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } } };

/**
 * Period control: a segmented bar on wider screens; on phones a single pill
 * that opens the native picker (familiar, thumb-friendly, never overflows).
 */
export function PeriodPicker({ options, value, onChange, label = 'Period' }) {
  const current = options.find(([v]) => v === value)?.[1] || '';
  return (
    <>
      <div className="hidden sm:block"><Segmented label={label} value={value} onChange={onChange} options={options} /></div>
      <label className="sm:hidden relative inline-flex items-center gap-1.5 h-9 pl-4 pr-3 rounded-full bg-surface-2 border border-line text-[14px] font-medium">
        <span className="text-ink-3 font-normal">Showing</span> {current}
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="text-ink-3 ml-0.5"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 opacity-0 w-full cursor-pointer">
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
    </>
  );
}

/** Sun/moon switch between dark and light (long-press-free, one tap). */
export function ThemeToggle({ className = '' }) {
  const [, setTheme, resolved] = useTheme();
  const light = resolved === 'light';
  return (
    <button type="button" onClick={() => setTheme(light ? 'dark' : 'light')} aria-label={light ? 'Switch to dark theme' : 'Switch to light theme'} title={light ? 'Dark theme' : 'Light theme'}
      className={`relative grid place-items-center w-9 h-9 rounded-full bg-surface-2 hover:bg-surface-3 text-ink-2 hover:text-ink transition-colors overflow-hidden ${className}`}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.svg key={light ? 'moon' : 'sun'} width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          initial={{ y: 14, opacity: 0, rotate: -30 }} animate={{ y: 0, opacity: 1, rotate: 0 }} exit={{ y: -14, opacity: 0, rotate: 30 }} transition={{ duration: 0.25 }}>
          {light ? <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" /> : <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>}
        </motion.svg>
      </AnimatePresence>
    </button>
  );
}
