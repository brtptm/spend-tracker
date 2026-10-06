import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { FiChevronRight, FiChevronLeft, FiCopy, FiCheck, FiMoreHorizontal, FiX } from 'react-icons/fi';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { inr } from '../lib/format.js';
import { SEVERITY, CategoryIcon } from './ui.jsx';
import BrandLogo from './BrandLogo.jsx';

const initials = (name) => name.replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export function Monogram({ offer, size = 40 }) {
  return <BrandLogo id={offer.logo} name={offer.advertiser} size={size} color={offer.color} />;
}

/** Impression/click/feedback logic shared by cards and carousel slides. */
function useOffer(offer, onRemoved) {
  const qc = useQueryClient();
  const [code, setCode] = useState(null);
  const [copied, setCopied] = useState(false);
  const claim = async () => { const r = await api.adClick(offer.adId).catch(() => null); setCode(r?.couponCode || ''); };
  const copy = async () => { try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} };
  const feedback = async (kind) => {
    onRemoved?.(offer.adId);
    await api.adFeedback(offer.adId, kind).catch(() => {});
    qc.invalidateQueries({ queryKey: ['offers'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
  return { code, copied, claim, copy, feedback };
}

/** Counts a view once the element is ≥50% visible for a second (and `active`). */
function useImpression(ref, adId, active = true) {
  useEffect(() => {
    if (!ref.current || !active) return;
    let t;
    const io = new IntersectionObserver(([e]) => {
      clearTimeout(t);
      if (e.intersectionRatio >= 0.5) t = setTimeout(() => { api.adView(adId).catch(() => {}); io.disconnect(); }, 1000);
    }, { threshold: [0, 0.5] });
    io.observe(ref.current);
    return () => { io.disconnect(); clearTimeout(t); };
  }, [ref, adId, active]);
}

function CodeButton({ o, primary }) {
  if (o.code === null) return <button className={`btn btn-sm ${primary ? 'btn-primary' : 'btn-ghost'}`} onClick={o.claim}>{o.offer.couponCode ? 'Reveal code' : 'Get offer'}</button>;
  if (!o.code) return <span className="text-sm font-medium text-positive">Applied at checkout</span>;
  return (
    <button onClick={o.copy} aria-label={`Copy code ${o.code}`} className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold tracking-wide border border-dashed" style={{ borderColor: 'var(--line-strong)' }}>
      {o.code} {o.copied ? <FiCheck className="text-positive" /> : <FiCopy className="text-ink-3" />}
    </button>
  );
}

function OfferMenu({ onPick }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button className="w-8 h-8 grid place-items-center rounded-full text-ink-3 hover:text-ink hover:bg-surface-2" aria-label="Offer options" aria-expanded={open} onClick={() => setOpen((x) => !x)}><FiMoreHorizontal /></button>
      {open && (
        <div className="absolute right-0 top-9 z-20 glass rounded-xl p-1 w-48 text-sm shadow-2xl" role="menu" onMouseLeave={() => setOpen(false)}>
          <button role="menuitem" className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-3" onClick={() => { setOpen(false); onPick('not_relevant'); }}>Not relevant to me</button>
          <button role="menuitem" className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-3" onClick={() => { setOpen(false); onPick('dismiss'); }}>Hide this offer</button>
        </div>
      )}
    </div>
  );
}

export function OfferCard({ offer }) {
  const ref = useRef(null);
  const [gone, setGone] = useState(false);
  const o = useOffer(offer, () => setGone(true));
  o.offer = offer;
  useImpression(ref, offer.adId);
  return (
    <AnimatePresence>
      {!gone && (
        <motion.article ref={ref} layout exit={{ opacity: 0, scale: 0.97 }} className="panel p-5 flex flex-col">
          <div className="flex items-center gap-3">
            <Monogram offer={offer} />
            <div className="min-w-0 flex-1"><div className="font-medium truncate">{offer.advertiser}</div><div className="text-xs text-ink-3">{offer.personalized ? 'Picked for you' : 'Offer'}</div></div>
            <OfferMenu onPick={o.feedback} />
          </div>
          <h3 className="text-[17px] mt-4 leading-snug">{offer.title}</h3>
          <p className="text-sm text-ink-2 mt-1.5 flex-1">{offer.description}</p>
          <p className="text-xs text-ink-3 mt-3 leading-relaxed">{offer.relevanceReason}</p>
          <div className="mt-4 flex items-center gap-3"><CodeButton o={o} /><span className="ml-auto text-[11px] text-ink-3">{offer.personalized ? `${Math.round(offer.relevanceScore * 100)}% match` : 'General'}</span></div>
        </motion.article>
      )}
    </AnimatePresence>
  );
}

/** Decorative orbital line-art echoing the spending dial; a single brand-colored arc. */
function SlideArt({ color }) {
  const ticks = Array.from({ length: 72 }, (_, i) => i * 5);
  const pt = (r, d) => { const a = ((d - 90) * Math.PI) / 180; return [120 + r * Math.cos(a), 120 + r * Math.sin(a)]; };
  return (
    <svg viewBox="0 0 240 240" className="absolute -right-16 top-1/2 -translate-y-1/2 h-[165%] pointer-events-none hidden sm:block" aria-hidden="true">
      <g stroke="#fff">{ticks.map((d) => { const [x0, y0] = pt(d % 45 === 0 ? 106 : 109, d), [x1, y1] = pt(113, d); return <line key={d} x1={x0} y1={y0} x2={x1} y2={y1} strokeOpacity={d % 45 === 0 ? 0.3 : 0.1} strokeWidth=".6" />; })}</g>
      <circle cx="120" cy="120" r="92" fill="none" stroke="#fff" strokeOpacity=".08" strokeWidth=".8" />
      <circle cx="120" cy="120" r="66" fill="none" stroke="#fff" strokeOpacity=".06" strokeWidth=".8" strokeDasharray="1 4" />
      <circle cx="120" cy="120" r="40" fill="none" stroke="#fff" strokeOpacity=".05" strokeWidth=".8" />
      <circle cx="120" cy="120" r="92" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeDasharray="190 600" transform="rotate(-150 120 120)" />
      <circle cx={pt(92, -60)[0]} cy={pt(92, -60)[1]} r="3" fill={color} stroke="#000" strokeWidth="1.5" />
      <g className="dial-orbit" style={{ transformOrigin: '120px 120px', animationDuration: '60s' }}><circle cx="120" cy="54" r="1.4" fill="#fff" fillOpacity=".6" /></g>
    </svg>
  );
}

function Slide({ offer, active, onRemoved }) {
  const ref = useRef(null);
  const o = useOffer(offer, onRemoved);
  o.offer = offer;
  useImpression(ref, offer.adId, active);
  return (
    <div ref={ref} className="relative h-full overflow-hidden rounded-[22px] p-6 sm:p-8 flex flex-col justify-between" style={{ background: `radial-gradient(120% 140% at 100% 50%, color-mix(in srgb, ${offer.color} 7%, var(--surface)) 0%, var(--surface) 50%)` }}>
      <SlideArt color={offer.color} />
      <div className="relative flex items-start gap-3 max-w-[560px] pr-24">
        <Monogram offer={offer} size={36} />
        <div className="min-w-0">
          <div className="text-[13px] text-ink-2"><span className="text-ink font-medium">{offer.advertiser}</span> · {offer.personalized ? 'Picked for how you spend' : 'Sponsored'}</div>
          <h2 className="text-[1.6rem] sm:text-[2rem] mt-2 leading-[1.08]">{offer.title}</h2>
          <p className="text-ink-2 mt-2 text-[15px] max-w-[52ch]">{offer.description}</p>
        </div>
      </div>
      <div className="relative mt-5 flex flex-wrap items-center gap-3">
        <CodeButton o={o} primary />
        <span className="text-xs text-ink-3 max-w-[46ch]">{offer.relevanceReason}</span>
        <div className="ml-auto"><OfferMenu onPick={o.feedback} /></div>
      </div>
    </div>
  );
}

/** Dashboard carousel: autoplay with progress, swipe, keyboard, pause on hover/focus. */
export function OfferCarousel({ offers: initial, interval = 6500 }) {
  const [offers, setOffers] = useState(initial);
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [dir, setDir] = useState(1);
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => { setOffers(initial); }, [initial]);
  const n = offers.length;
  const go = useCallback((d) => { setDir(d); setI((x) => (x + d + n) % n); }, [n]);
  useEffect(() => { if (i >= n && n) setI(0); }, [i, n]);
  useEffect(() => {
    if (paused || reduced || n < 2) return;
    const t = setTimeout(() => go(1), interval);
    return () => clearTimeout(t);
  }, [i, paused, reduced, n, interval, go]);
  if (!n) return null;
  const cur = offers[Math.min(i, n - 1)];

  return (
    <section aria-roledescription="carousel" aria-label="Offers picked for you" className="relative panel !p-0 overflow-hidden group"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
      onKeyDown={(e) => { if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); }}>
      <div className="relative h-[300px] sm:h-[230px]">
        <AnimatePresence initial={false} custom={dir} mode="popLayout">
          <motion.div key={cur.adId} className="absolute inset-0" custom={dir}
            initial={{ opacity: 0, x: dir * 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: dir * -40 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            drag={n > 1 ? 'x' : false} dragConstraints={{ left: 0, right: 0 }} dragElastic={0.18}
            onDragEnd={(_, info) => { if (info.offset.x < -60) go(1); else if (info.offset.x > 60) go(-1); }}
            role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${n}: ${cur.advertiser}`}>
            <Slide offer={cur} active onRemoved={(id) => setOffers((list) => list.filter((x) => x.adId !== id))} />
          </motion.div>
        </AnimatePresence>
      </div>
      {n > 1 && (
        <>
          <div className="absolute top-6 right-7 flex items-center gap-1.5" role="tablist" aria-label="Choose offer">
            {offers.map((o, k) => (
              <button key={o.adId} role="tab" aria-selected={k === i} aria-label={`Offer ${k + 1}: ${o.advertiser}`} onClick={() => { setDir(k > i ? 1 : -1); setI(k); }}
                className="relative h-1.5 rounded-full overflow-hidden transition-all duration-300 bg-surface-3" style={{ width: k === i ? 26 : 6 }}>
                {k === i && <motion.span key={`${i}-${paused}`} className="absolute inset-y-0 left-0 bg-ink rounded-full" initial={{ width: paused || reduced ? '100%' : '0%' }} animate={{ width: '100%' }} transition={{ duration: paused || reduced ? 0 : interval / 1000, ease: 'linear' }} />}
              </button>
            ))}
          </div>
          <button onClick={() => go(-1)} aria-label="Previous offer" className="hidden sm:grid absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 place-items-center rounded-full glass opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"><FiChevronLeft /></button>
          <button onClick={() => go(1)} aria-label="Next offer" className="hidden sm:grid absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 place-items-center rounded-full glass opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"><FiChevronRight /></button>
        </>
      )}
    </section>
  );
}

export function InsightCard({ insight, compact }) {
  const s = SEVERITY[insight.severity] || SEVERITY.info;
  const body = (
    <div className="flex gap-3.5">
      <span className="mt-[7px] w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium" style={{ color: s.color }}>{s.label}</div>
        <div className="font-medium mt-0.5">{insight.title}</div>
        {!compact && <p className="text-sm text-ink-2 mt-1">{insight.description}</p>}
        {insight.action && !compact && <p className="text-sm text-ink-3 mt-1">{insight.action}</p>}
      </div>
      {insight.potentialSavings > 0 && <div className="text-right shrink-0"><div className="num text-base text-positive">{inr(insight.potentialSavings)}</div><div className="text-[11px] text-ink-3">a month</div></div>}
    </div>
  );
  return insight.link ? <Link to={insight.link} className="block py-4 rounded-xl -mx-2 px-2 hover:bg-surface-2/60 transition-colors">{body}</Link> : <div className="py-4">{body}</div>;
}

export function RecommendationCard({ rec, onAccept, onDismiss, busy }) {
  const accepted = rec.status === 'accepted';
  return (
    <article className="panel p-6 flex flex-col">
      <div className="flex items-start gap-3.5">
        <CategoryIcon id={rec.category} size={16} />
        <div className="min-w-0 flex-1"><div className="text-xs text-ink-3">{rec.merchant} · {rec.difficulty} · {rec.timeToImplement}</div><h3 className="text-[17px] mt-1 leading-snug">{rec.title}</h3></div>
        {rec.savingsMonthly > 0 && <div className="text-right shrink-0"><div className="num text-[22px] text-positive">{inr(rec.savingsMonthly)}</div><div className="text-[11px] text-ink-3">{rec.oneTime ? 'one-time' : `a month · ${inr(rec.savingsAnnual)}/yr`}</div></div>}
      </div>
      <p className="text-sm text-ink-2 mt-3">{rec.description}</p>
      {rec.actionItems?.length > 0 && <ol className="mt-3 grid gap-1.5 text-sm">{rec.actionItems.map((a, i) => <li key={a} className="flex gap-2.5"><span className="text-ink-3 w-3">{i + 1}</span>{a}</li>)}</ol>}
      <div className="mt-5 pt-4 border-t border-line flex items-center gap-2 mt-auto">
        {accepted ? <span className="inline-flex items-center gap-2 text-sm font-medium text-positive"><FiCheck /> In your plan — tracking impact</span> : <>
          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => onAccept(rec)}>Add to my plan</button>
          <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onDismiss(rec)}><FiX /> Not for me</button>
        </>}
        <span className="ml-auto text-[11px] text-ink-3">{Math.round(rec.confidence * 100)}% confidence</span>
      </div>
    </article>
  );
}

export function MiniLink({ to, children }) {
  return <Link to={to} className="inline-flex items-center gap-0.5 text-sm font-medium text-link hover:underline">{children}<FiChevronRight /></Link>;
}
