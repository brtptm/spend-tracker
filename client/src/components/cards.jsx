import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { FiChevronRight, FiCopy, FiCheck, FiMoreHorizontal, FiInfo, FiX } from 'react-icons/fi';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { inr } from '../lib/format.js';
import { SEVERITY, CategoryIcon } from './ui.jsx';

export function InsightCard({ insight, compact }) {
  const s = SEVERITY[insight.severity] || SEVERITY.info;
  const body = (
    <div className="flex gap-3.5">
      <span className="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color, boxShadow: `0 0 12px ${s.color}` }} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold" style={{ color: s.color }}>{s.label}</div>
        <div className="font-semibold mt-0.5">{insight.title}</div>
        {!compact && <p className="text-sm text-ink-2 mt-1">{insight.description}</p>}
        {insight.action && !compact && <p className="text-sm text-ink-3 mt-1">{insight.action}</p>}
      </div>
      {insight.potentialSavings > 0 && (
        <div className="text-right shrink-0">
          <div className="num text-lg text-lime-text">{inr(insight.potentialSavings)}</div>
          <div className="text-[11px] text-ink-3">/month</div>
        </div>
      )}
    </div>
  );
  return insight.link
    ? <Link to={insight.link} className="block py-4 group">{body}</Link>
    : <div className="py-4">{body}</div>;
}

/** Native, explainable offer card with impression + click tracking. */
export function OfferCard({ offer, onChange }) {
  const ref = useRef(null);
  const qc = useQueryClient();
  const [code, setCode] = useState(null);
  const [copied, setCopied] = useState(false);
  const [menu, setMenu] = useState(false);
  const [why, setWhy] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    let timer;
    const io = new IntersectionObserver(([e]) => {
      clearTimeout(timer);
      // Count an impression only when at least half the card is visible for a second.
      if (e.intersectionRatio >= 0.5) timer = setTimeout(() => { api.adView(offer.adId).catch(() => {}); io.disconnect(); }, 1000);
    }, { threshold: [0, 0.5] });
    io.observe(ref.current);
    return () => { io.disconnect(); clearTimeout(timer); };
  }, [offer.adId]);

  async function claim() {
    const r = await api.adClick(offer.adId).catch(() => null);
    setCode(r?.couponCode || '');
  }
  async function feedback(kind) {
    setMenu(false);
    setGone(true);
    await api.adFeedback(offer.adId, kind).catch(() => {});
    qc.invalidateQueries({ queryKey: ['dashboard'] });
    qc.invalidateQueries({ queryKey: ['offers'] });
    onChange?.();
  }
  const copy = async () => { try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} };

  return (
    <AnimatePresence>
      {!gone && (
        <motion.article ref={ref} layout exit={{ opacity: 0, scale: 0.96 }} className="relative panel p-5 overflow-hidden"
          style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${offer.color} 13%, var(--surface)) 0%, var(--surface) 60%)` }}>
          <div className="flex items-start gap-3">
            <span className="text-2xl leading-none mt-0.5" aria-hidden="true">{offer.emoji}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs text-ink-3">
                <span className="font-semibold text-ink-2">{offer.advertiser}</span>
                <span className="rounded-full px-2 py-0.5 border border-line">Offer</span>
              </div>
              <h3 className="text-[1.05rem] mt-1 leading-snug">{offer.title}</h3>
              <p className="text-sm text-ink-2 mt-1">{offer.description}</p>
            </div>
            <div className="relative">
              <button className="w-8 h-8 grid place-items-center rounded-full text-ink-3 hover:text-ink hover:bg-surface-2" aria-label="Offer options" aria-expanded={menu} onClick={() => setMenu((m) => !m)}><FiMoreHorizontal /></button>
              {menu && (
                <div className="absolute right-0 top-9 z-10 glass rounded-xl p-1 w-48 text-sm shadow-xl" role="menu">
                  <button role="menuitem" className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-2" onClick={() => feedback('not_relevant')}>Not relevant to me</button>
                  <button role="menuitem" className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-2" onClick={() => feedback('dismiss')}>Hide this offer</button>
                </div>
              )}
            </div>
          </div>

          <button className="mt-3 inline-flex items-center gap-1.5 text-xs text-cyan-text" onClick={() => setWhy((w) => !w)} aria-expanded={why}><FiInfo /> Why am I seeing this?</button>
          <AnimatePresence>{why && <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="text-xs text-ink-2 mt-1.5 overflow-hidden">{offer.relevanceReason} Offers are ranked only by how you spend — never by age, gender or income.</motion.p>}</AnimatePresence>

          <div className="mt-4 flex items-center gap-3">
            {code === null ? (
              <button className="btn btn-primary btn-sm" onClick={claim}>{offer.couponCode ? 'Reveal code' : 'View offer'}</button>
            ) : code ? (
              <button className="inline-flex items-center gap-2 rounded-full border border-dashed px-3.5 py-1.5 font-semibold text-sm" style={{ borderColor: 'var(--lime)', color: 'var(--lime-text)' }} onClick={copy} aria-label={`Copy code ${code}`}>
                {code} {copied ? <FiCheck /> : <FiCopy />}
              </button>
            ) : <span className="text-sm text-lime-text font-semibold">Opened — offer applies at checkout</span>}
            <span className="ml-auto text-[11px] text-ink-3">{Math.round(offer.relevanceScore * 100)}% match</span>
          </div>
        </motion.article>
      )}
    </AnimatePresence>
  );
}

export function RecommendationCard({ rec, onAccept, onDismiss, busy }) {
  const accepted = rec.status === 'accepted';
  return (
    <article className="panel p-5 sm:p-6 flex flex-col">
      <div className="flex items-start gap-3.5">
        <CategoryIcon id={rec.category} color={`var(--cat-${rec.category}, var(--cyan))`} />
        <div className="min-w-0 flex-1">
          <div className="text-xs text-ink-3">{rec.merchant} · {rec.difficulty} · {rec.timeToImplement}</div>
          <h3 className="text-lg mt-0.5 leading-snug">{rec.title}</h3>
        </div>
        {rec.savingsMonthly > 0 && <div className="text-right shrink-0"><div className="num text-2xl text-lime-text">{inr(rec.savingsMonthly)}</div><div className="text-[11px] text-ink-3">{rec.oneTime ? 'one-time' : `/month · ${inr(rec.savingsAnnual)}/yr`}</div></div>}
      </div>
      <p className="text-sm text-ink-2 mt-3">{rec.description}</p>
      {rec.actionItems?.length > 0 && (
        <ol className="mt-3 grid gap-1.5 text-sm">{rec.actionItems.map((a, i) => <li key={a} className="flex gap-2.5"><span className="num text-cyan-text">{i + 1}</span>{a}</li>)}</ol>
      )}
      <div className="mt-5 pt-4 border-t border-line flex items-center gap-2 mt-auto">
        {accepted
          ? <span className="inline-flex items-center gap-2 text-sm font-semibold text-lime-text"><FiCheck /> You’re on it — we’ll track the impact</span>
          : <>
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => onAccept(rec)}>I’ll try this</button>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onDismiss(rec)}><FiX /> Not for me</button>
            </>}
        <span className="ml-auto text-[11px] text-ink-3">{Math.round(rec.confidence * 100)}% confidence</span>
      </div>
    </article>
  );
}

export function MiniLink({ to, children }) {
  return <Link to={to} className="inline-flex items-center gap-1 text-sm font-semibold text-cyan-text hover:underline">{children}<FiChevronRight /></Link>;
}
