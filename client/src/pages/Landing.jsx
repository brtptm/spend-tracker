import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { FiChevronRight } from 'react-icons/fi';
import { api, auth } from '../lib/api.js';
import { Logo, ErrorNote, ThemeToggle } from '../components/ui.jsx';
import BrandLogo from '../components/BrandLogo.jsx';
import Ring from '../components/three/Ring.jsx';
import { CAT_COLORS, CAT_NAMES } from '../lib/cats.js';

const SAMPLE = [['food', 28000], ['shopping', 18000], ['transport', 12000], ['entertainment', 10000], ['bills', 8000], ['p2p', 6000], ['personal', 3000]]
  .map(([id, amount]) => ({ id, amount, name: CAT_NAMES[id], color: CAT_COLORS[id] }));

const PERSONAS = [
  { id: 'convenience', name: 'Rohan', who: 'Bengaluru · convenience spender', story: '79 deliveries a month, two overlapping streaming plans, and a 1 a.m. laptop purchase worth a second look.' },
  { id: 'fashion', name: 'Neha', who: 'Mumbai · deal hunter', story: 'Late-night Myntra and Nykaa carts and a coupon for everything — offers that land at the right moment.' },
  { id: 'subscriptions', name: 'Kabir', who: 'Pune · subscription collector', story: 'Four streaming apps, two music apps, Adobe and a gym — with one charge billed twice.' },
];

const ease = [0.22, 1, 0.36, 1];
const up = (d = 0) => ({ initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-60px' }, transition: { duration: 0.8, ease, delay: d } });

/**
 * A card suspended on a hairline thread from the top of the hero, swaying a
 * fraction of a degree. `drop` is the thread length in px.
 */
function Hanging({ x, drop, delay = 0, sway = 1.4, period = 7, className = '', children, below }) {
  return (
    <motion.div className={`absolute top-0 ${className}`} style={{ left: x, transformOrigin: 'top center' }}
      initial={{ opacity: 0, y: -40 }} animate={{ opacity: 1, y: 0, rotate: [sway, -sway, sway] }}
      transition={{ opacity: { delay, duration: 1 }, y: { delay, duration: 1.4, ease }, rotate: { delay, duration: period, repeat: Infinity, ease: 'easeInOut' } }}>
      <div className="relative -translate-x-1/2 flex flex-col items-center">
        <span className="w-px" style={{ height: drop, background: 'linear-gradient(to bottom, transparent, var(--thread))' }} />
        <span className="w-1.5 h-1.5 -mt-[3px] rounded-full bg-fg/40" />
        <div className="-mt-[2px]">{children}</div>
        {below && <><span className="w-px h-12 bg-fg/20" /><span className="w-1.5 h-1.5 -mt-[3px] rounded-full bg-fg/40" /><div className="-mt-[2px]">{below}</div></>}
      </div>
    </motion.div>
  );
}

const Card = ({ children, className = '' }) => <div className={`glass rounded-2xl px-4 py-3 shadow-[var(--shadow-float)] whitespace-nowrap ${className}`}>{children}</div>;
const Pendant = ({ id, size = 44 }) => <div className="rounded-[14px] p-[3px] glass shadow-[var(--shadow-float)]"><BrandLogo id={id} size={size} /></div>;

export default function Landing() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const signedIn = auth.signedIn();

  async function demo(persona) {
    setBusy(persona); setError(null);
    try { const { token } = await api.demo(persona); auth.setToken(token); qc.clear(); nav('/dashboard'); }
    catch (e) { setError(e); setBusy(null); }
  }

  return (
    <div className="ledger min-h-dvh overflow-x-hidden">
      <header className="sticky top-0 z-30 glass !border-x-0 !border-t-0">
        <div className="max-w-[1100px] mx-auto px-5 h-14 flex items-center justify-between">
          <Logo size={22} />
          <nav className="flex items-center gap-1 text-[13px]">
            <ThemeToggle className="mr-1 !w-8 !h-8" />
            {signedIn ? <Link to="/dashboard" className="btn btn-primary btn-sm">Open Spend Tracker</Link>
              : <><Link to="/signin" className="px-3 py-1.5 text-ink-2 hover:text-ink">Sign in</Link><Link to="/signup" className="btn btn-primary btn-sm">Get started</Link></>}
          </nav>
        </div>
      </header>

      <main>
        <section className="max-w-[1100px] mx-auto px-5 pt-20 sm:pt-28 text-center">
          <motion.p className="text-ink-2 font-medium" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }}>Spend Tracker for Paytm</motion.p>
          <motion.h1 className="mt-3 text-[3rem] sm:text-[4.6rem] lg:text-[5.6rem] leading-[0.98] tracking-[-0.05em] font-semibold" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease }}>
            Every rupee.<br /><span className="text-ink-3">Finally in focus.</span>
          </motion.h1>
          <motion.p className="mt-6 text-lg sm:text-xl text-ink-2 max-w-[40ch] mx-auto leading-relaxed" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.9, ease, delay: 0.1 }}>
            See exactly where your money goes, keep more of it, and get offers that actually fit how you spend.
          </motion.p>
          <motion.div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.25 }}>
            <button className="btn btn-primary !px-6 !py-3 !text-[15px]" onClick={() => nav(signedIn ? '/dashboard' : '/signup')}>Get started</button>
            <button className="inline-flex items-center gap-1 text-link text-[15px] font-medium hover:underline" disabled={!!busy} onClick={() => demo('convenience')}>{busy === 'convenience' ? 'Opening…' : 'Explore the live demo'} <FiChevronRight /></button>
          </motion.div>
          <div className="mt-4 max-w-md mx-auto"><ErrorNote error={error} /></div>
        </section>

        <section className="relative max-w-[1100px] mx-auto px-5">
          <div className="relative isolate h-[420px] sm:h-[640px]">
            <Ring segments={SAMPLE} variant="hero" interactive={false} className="-z-10">
              <motion.div className="text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1, duration: 1 }}>
                <div className="eyebrow">October</div>
                <div className="num text-[2.4rem] sm:text-[3rem] mt-1">₹85,000</div>
              </motion.div>
            </Ring>
            {/* Hanging elements — desktop: full cards; mobile: two quiet logo pendants. */}
            <div className="hidden lg:block" aria-hidden="true">
              <Hanging x="15%" drop={110} delay={0.9} period={8} sway={1}
                below={<Card><div className="text-[11px] text-ink-3">Swiggy One · 95% match</div><div className="font-medium text-sm mt-0.5">Free delivery for 3 months</div><div className="text-[11px] text-positive mt-1">Saves ≈ ₹1,900</div></Card>}>
                <Card><div className="flex items-center gap-3"><BrandLogo id="swiggy" size={32} /><div><div className="text-[11px] text-ink-3">Swiggy · last month</div><div className="num text-[17px]">₹12,000 <span className="text-ink-3 text-xs font-normal">45 orders</span></div></div></div></Card>
              </Hanging>
              <Hanging x="2%" drop={400} delay={1.6} period={9} sway={1.8}><Pendant id="uber" size={38} /></Hanging>
              <Hanging x="33%" drop={36} delay={2} period={7} sway={2.2}><Pendant id="amazon" size={34} /></Hanging>
              <Hanging x="84%" drop={90} delay={1.1} period={8.5} sway={1}
                below={<Card><div className="flex items-center gap-2"><BrandLogo id="netflix" size={22} /><BrandLogo id="hotstar" size={22} /><span className="text-[11px] text-warning ml-1">Overlap</span></div><div className="text-sm mt-1.5">Two streaming plans · <span className="num">₹948</span>/mo</div></Card>}>
                <Card><div className="text-[11px] text-ink-3">You could keep</div><div className="num text-[19px] text-positive">₹16,750<span className="text-ink-3 text-xs font-normal"> / month</span></div></Card>
              </Hanging>
              <Hanging x="98%" drop={300} delay={1.5} period={6.5} sway={2}><Pendant id="zomato" size={40} /></Hanging>
              <Hanging x="67%" drop={56} delay={2.2} period={8} sway={2}><Pendant id="spotify" size={34} /></Hanging>
            </div>
            <div className="lg:hidden" aria-hidden="true">
              <Hanging x="12%" drop={36} delay={1} sway={2}><Pendant id="swiggy" size={30} /></Hanging>
              <Hanging x="88%" drop={70} delay={1.3} sway={2}><Pendant id="netflix" size={30} /></Hanging>
            </div>
          </div>
        </section>

        <section className="max-w-[1100px] mx-auto px-5 py-24 sm:py-32">
          <motion.h2 {...up()} className="text-[2.4rem] sm:text-[3.6rem] tracking-[-0.045em] max-w-[16ch]">Old ads guess.<br /><span className="text-ink-3">We look.</span></motion.h2>
          <div className="mt-12 grid md:grid-cols-2 gap-5">
            <motion.div {...up(0.05)} className="panel p-8 sm:p-10">
              <div className="eyebrow">Demographic targeting</div>
              <p className="mt-5 text-[1.6rem] leading-tight tracking-[-0.03em] font-semibold text-ink-3">“Male, 25–35, high income.”</p>
              <p className="mt-4 text-ink-2">So he sees a random watch ad, and ignores it. Typical click-through: 1–2%.</p>
            </motion.div>
            <motion.div {...up(0.12)} className="panel p-8 sm:p-10">
              <div className="eyebrow">Spend Tracker</div>
              <p className="mt-5 text-[1.6rem] leading-tight tracking-[-0.03em] font-semibold">“₹12,000 on Swiggy last month. 45 orders.”</p>
              <p className="mt-4 text-ink-2">So he sees free delivery that pays for itself in three orders. He saves, Swiggy keeps a customer, Paytm earns.</p>
            </motion.div>
          </div>
        </section>

        <section className="max-w-[1100px] mx-auto px-5 pb-24 sm:pb-32">
          <motion.h2 {...up()} className="text-[2.2rem] sm:text-[3rem] tracking-[-0.04em] max-w-[20ch]">Everything your statement never told you.</motion.h2>
          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-5 auto-rows-[minmax(220px,auto)]">
            <motion.div {...up(0)} className="panel p-8 lg:col-span-2 flex flex-col justify-between">
              <div className="eyebrow">Deep dives</div>
              <div><div className="num text-[3.4rem] leading-none">2.5<span className="text-ink-3 text-[2rem]"> orders/day</span></div><p className="text-ink-2 mt-3 max-w-[48ch]">Seventy-seven deliveries a month at ₹45 in fees each — the patterns behind the totals, down to the hour and the dish.</p></div>
            </motion.div>
            <motion.div {...up(0.06)} className="panel p-8 flex flex-col justify-between"><div className="eyebrow">Categorisation</div><p className="text-[1.35rem] font-semibold tracking-[-0.025em] leading-snug">Swiggy, “Sharma Sweets Corner” or a friend’s UPI — sorted automatically, and it learns from you.</p></motion.div>
            <motion.div {...up(0.1)} className="panel p-8 flex flex-col justify-between"><div className="eyebrow">Spending personality</div><p className="text-[1.35rem] font-semibold tracking-[-0.025em] leading-snug">Convenience spender, deal hunter or collector — know your peaks and your habits.</p></motion.div>
            <motion.div {...up(0.14)} className="panel p-8 flex flex-col justify-between"><div className="eyebrow">Budgets with a pace</div><div><div className="num text-[2.6rem] leading-none">₹2,800<span className="text-ink-3 text-[1.4rem]"> / day</span></div><p className="text-ink-2 mt-3">keeps you on track — told before the month ends, not after.</p></div></motion.div>
            <motion.div {...up(0.18)} className="panel p-8 flex flex-col justify-between"><div className="eyebrow">For Paytm</div><p className="text-[1.35rem] font-semibold tracking-[-0.025em] leading-snug">Consent-gated partner APIs: behaviour profiles, segments and ad performance.</p></motion.div>
          </div>
        </section>

        <section className="max-w-[1100px] mx-auto px-5 pb-24 sm:pb-32">
          <motion.h2 {...up()} className="text-[2.2rem] sm:text-[3rem] tracking-[-0.04em]">Step into a wallet.</motion.h2>
          <p className="text-ink-2 mt-3 text-lg">Three demo profiles with a year of realistic Paytm-style history.</p>
          <div className="mt-10 grid md:grid-cols-3 gap-5">
            {PERSONAS.map((p, i) => (
              <motion.article key={p.id} {...up(i * 0.06)} className="panel p-7 flex flex-col">
                <div className="text-[1.6rem] font-semibold tracking-[-0.03em]">{p.name}</div>
                <div className="text-sm text-ink-3 mt-1">{p.who}</div>
                <p className="text-ink-2 mt-5 flex-1 leading-relaxed">{p.story}</p>
                <button className="mt-6 inline-flex items-center gap-1 text-link font-medium hover:underline self-start" disabled={!!busy} onClick={() => demo(p.id)}>{busy === p.id ? 'Opening…' : `Explore as ${p.name}`} <FiChevronRight /></button>
              </motion.article>
            ))}
          </div>
        </section>

        <section className="border-t border-line">
          <div className="max-w-[1100px] mx-auto px-5 py-20 grid md:grid-cols-3 gap-8 text-[15px]">
            <div><h3 className="text-lg">Consent first</h3><p className="text-ink-2 mt-2">Partner APIs only return data for people who opted in — and it can be switched off any time.</p></div>
            <div><h3 className="text-lg">Spending, not demographics</h3><p className="text-ink-2 mt-2">Offers are ranked by what you buy. Never by age, gender or income.</p></div>
            <div><h3 className="text-lg">Yours to take</h3><p className="text-ink-2 mt-2">Export everything as CSV or PDF, turn off personalisation, or delete your account.</p></div>
          </div>
        </section>

        <section className="max-w-[1100px] mx-auto px-5 py-24 text-center">
          <h2 className="text-[2.4rem] sm:text-[3.6rem] tracking-[-0.045em]">Your money has a shape.</h2>
          <div className="mt-8 flex flex-wrap justify-center items-center gap-x-6 gap-y-3">
            <Link to={signedIn ? '/dashboard' : '/signup'} className="btn btn-primary !px-6 !py-3 !text-[15px]">Get started</Link>
            <button className="inline-flex items-center gap-1 text-link text-[15px] font-medium hover:underline" disabled={!!busy} onClick={() => demo('convenience')}>Explore the live demo <FiChevronRight /></button>
          </div>
        </section>
      </main>
      <footer className="border-t border-line">
        <div className="max-w-[1100px] mx-auto px-5 py-6 flex flex-wrap gap-3 items-center justify-between text-xs text-ink-3">
          <span>Spend Tracker · hackathon prototype · demo data is simulated</span><span>React · Node.js · SQLite · three.js · Claude</span>
        </div>
      </footer>
    </div>
  );
}
