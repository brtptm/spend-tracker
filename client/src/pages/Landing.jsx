import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { FiArrowRight, FiCheck, FiX, FiLock } from 'react-icons/fi';
import { PiTagDuotone, PiMagnifyingGlassDuotone, PiUserFocusDuotone, PiTicketDuotone, PiTargetDuotone, PiPlugsConnectedDuotone } from 'react-icons/pi';
import { api, auth } from '../lib/api.js';
import { Logo, ErrorNote } from '../components/ui.jsx';
import Universe from '../components/three/Universe.jsx';
import { CAT_COLORS, CAT_NAMES } from '../lib/cats.js';

const SAMPLE = [['food', 28000], ['shopping', 18000], ['transport', 12000], ['entertainment', 10000], ['bills', 8000], ['p2p', 6000], ['personal', 3000]]
  .map(([id, amount]) => ({ id, amount, name: CAT_NAMES[id], color: CAT_COLORS[id] }));

const PERSONAS = [
  { id: 'convenience', name: 'Rohan', who: '32 · Bengaluru · convenience spender', story: '79 food deliveries a month, two overlapping streaming plans and a 1 a.m. laptop purchase the anomaly detector flags.', save: '₹17k+/month found' },
  { id: 'fashion', name: 'Neha', who: '27 · Mumbai · deal-hunting fashionista', story: 'Late-night Myntra and Nykaa carts, coupon-savvy — sees the sale she was waiting for, at the right time.', save: 'Offers she actually uses' },
  { id: 'subscriptions', name: 'Kabir', who: '35 · Pune · subscription collector', story: 'Netflix, Hotstar, SonyLIV, Prime, Spotify, YouTube, Adobe, a gym — and Adobe charged twice this month.', save: '₹4,900/month in subscriptions' },
];

const FEATURES = [
  [PiTagDuotone, 'Every payment, sorted', 'Swiggy, “Sharma Sweets Corner” or a friend’s UPI — categorised automatically, and it learns from your corrections.'],
  [PiMagnifyingGlassDuotone, 'Deep dives that explain', '77 orders a month, ₹45 in fees each, biryani at 1 pm — the patterns behind the totals.'],
  [PiUserFocusDuotone, 'Your spending personality', 'Convenience spender? Deal hunter? Know your peaks, your loyalties and your savings potential.'],
  [PiTicketDuotone, 'Offers that fit', 'A Swiggy coupon because you order Swiggy — never because of your age. Dismiss once, it learns.'],
  [PiTargetDuotone, 'Budgets with a pace', '“₹2,800 a day keeps you on track” — budgets that warn you before the month ends, not after.'],
  [PiPlugsConnectedDuotone, 'APIs for Paytm', 'Consented behaviour profiles, segments and ad recommendations for partners — with performance feedback.'],
];

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
      <div className="relative isolate">
        <Universe planets={SAMPLE} variant="hero" interactive={false} offset={[5, 0.4, 0]} className="-z-10" />
        <div className="absolute inset-0 -z-10 pointer-events-none hidden lg:block" style={{ background: 'linear-gradient(90deg, var(--bg) 0%, color-mix(in srgb, var(--bg) 82%, transparent) 36%, transparent 62%)' }} />
        <div className="absolute inset-0 -z-10 pointer-events-none lg:hidden" style={{ background: 'color-mix(in srgb, var(--bg) 70%, transparent)' }} />
        <div className="absolute inset-x-0 bottom-0 h-40 -z-10 pointer-events-none" style={{ background: 'linear-gradient(transparent, var(--bg))' }} />

        <header className="max-w-[1240px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
          <Logo />
          <nav className="flex items-center gap-2">
            {signedIn ? <Link to="/dashboard" className="btn btn-primary btn-sm">Open dashboard</Link>
              : <><Link to="/signin" className="btn btn-sm text-ink-2 hover:text-ink">Sign in</Link><Link to="/signup" className="btn btn-primary btn-sm">Get started</Link></>}
          </nav>
        </header>

        <section className="max-w-[1240px] mx-auto px-4 sm:px-8 min-h-[80dvh] lg:min-h-[700px] flex items-center pb-28 pt-6">
          <motion.div className="max-w-xl" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}>
            <p className="inline-flex items-center gap-2 rounded-full glass px-3.5 py-1.5 text-sm text-ink-2"><span className="w-2 h-2 rounded-full bg-lime" style={{ boxShadow: '0 0 10px var(--lime)' }} />Built on your Paytm history</p>
            <h1 className="mt-6 text-[2.7rem] leading-[1.02] sm:text-6xl lg:text-[4.4rem] font-bold" style={{ fontVariationSettings: "'wdth' 85" }}>
              See where your money really orbits.
            </h1>
            <p className="mt-6 text-lg text-ink-2 max-w-[46ch]">
              Spend Tracker reads every payment, shows exactly where it goes, finds the money you could keep — and only shows offers that match how you actually spend.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button className="btn btn-primary" onClick={() => (signedIn ? nav('/dashboard') : nav('/signup'))}>Connect with Paytm <FiArrowRight /></button>
              <button className="btn btn-ghost glass" disabled={!!busy} onClick={() => demo('convenience')}>{busy === 'convenience' ? 'Opening…' : 'Explore a live demo'}</button>
            </div>
            <div className="mt-4 max-w-md"><ErrorNote error={error} /></div>
            <p className="mt-6 text-sm text-ink-3">Each planet is a spending category, sized by what you spend. The light flowing out is your money.</p>
          </motion.div>
        </section>
      </div>

      <main>
        {/* Core insight */}
        <section className="max-w-[1240px] mx-auto px-4 sm:px-8 py-16 sm:py-24">
          <h2 className="text-3xl sm:text-5xl max-w-[18ch]" style={{ fontVariationSettings: "'wdth' 85" }}>Old ads guess. We look.</h2>
          <div className="mt-10 grid md:grid-cols-2 gap-5">
            <div className="panel p-7">
              <div className="flex items-center gap-2 text-ink-3 text-sm font-semibold"><FiX /> Demographic targeting</div>
              <p className="mt-4 text-xl font-display">“Male, 25–35, high income.”</p>
              <p className="mt-2 text-ink-2">So he gets a random watch ad. It’s ignored — industry click-through is around 1–2%.</p>
            </div>
            <div className="panel p-7" style={{ borderColor: 'color-mix(in srgb, var(--lime) 45%, var(--line))', background: 'linear-gradient(135deg, color-mix(in srgb, var(--lime) 8%, var(--surface)), var(--surface) 70%)' }}>
              <div className="flex items-center gap-2 text-lime-text text-sm font-semibold"><FiCheck /> Spending-based relevance</div>
              <p className="mt-4 text-xl font-display">“Spent ₹12,000 on Swiggy last month, 45 orders.”</p>
              <p className="mt-2 text-ink-2">So he sees free delivery that pays for itself in three orders. He saves; Swiggy keeps a customer; Paytm earns. Everyone wins.</p>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="border-t border-line">
          <div className="max-w-[1240px] mx-auto px-4 sm:px-8 py-16 sm:py-24">
            <h2 className="text-3xl sm:text-4xl max-w-[22ch]">Everything your bank statement never told you</h2>
            <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-10 gap-y-10">
              {FEATURES.map(([Icon, t, b]) => (
                <div key={t}>
                  <Icon size={30} className="text-cyan-text" aria-hidden="true" />
                  <h3 className="text-xl mt-3">{t}</h3>
                  <p className="text-ink-2 mt-2">{b}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Personas */}
        <section className="border-t border-line">
          <div className="max-w-[1240px] mx-auto px-4 sm:px-8 py-16 sm:py-24">
            <h2 className="text-3xl sm:text-4xl">Step into someone’s wallet</h2>
            <p className="text-ink-2 mt-3 max-w-[60ch]">Three demo profiles with 12 months of realistic Paytm-style history. Pick one and explore the full app.</p>
            <div className="mt-10 grid md:grid-cols-3 gap-5">
              {PERSONAS.map((p) => (
                <article key={p.id} className="panel p-6 flex flex-col">
                  <div className="num text-3xl">{p.name}</div>
                  <div className="text-sm text-ink-3 mt-1">{p.who}</div>
                  <p className="text-ink-2 mt-4 flex-1">{p.story}</p>
                  <div className="mt-4 text-sm font-semibold text-lime-text">{p.save}</div>
                  <button className="btn btn-ghost mt-5" disabled={!!busy} onClick={() => demo(p.id)}>{busy === p.id ? 'Opening…' : `Explore as ${p.name}`} <FiArrowRight /></button>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Win-win-win */}
        <section className="border-t border-line">
          <div className="max-w-[1240px] mx-auto px-4 sm:px-8 py-16 sm:py-24 grid lg:grid-cols-[1fr_1.2fr] gap-12 items-start">
            <div>
              <h2 className="text-3xl sm:text-4xl max-w-[16ch]">Relevance is the business model</h2>
              <p className="text-ink-2 mt-4 max-w-[48ch]">When offers match real spending, people click them because they save money. That’s why behaviour-based placements can command higher CPMs — without a single pop-up.</p>
              <p className="text-xs text-ink-3 mt-4">Figures are projections from the brief, not measured results.</p>
            </div>
            <dl className="grid sm:grid-cols-3 gap-5">
              {[['Users', 'Keep ₹15–20k/month', 'by seeing where it goes'], ['Advertisers', '10–20% CTR', 'vs ~1–2% generic'], ['Paytm', '₹30–150 eCPM', 'from relevant placements']].map(([who, v, s]) => (
                <div key={who} className="panel p-6"><dt className="text-sm text-ink-3">{who}</dt><dd className="num text-2xl mt-2">{v}</dd><dd className="text-sm text-ink-2 mt-1">{s}</dd></div>
              ))}
            </dl>
          </div>
        </section>

        {/* Privacy */}
        <section className="border-t border-line">
          <div className="max-w-[1240px] mx-auto px-4 sm:px-8 py-16 grid md:grid-cols-[auto_1fr] gap-6 items-start">
            <FiLock size={30} className="text-cyan-text" aria-hidden="true" />
            <div>
              <h2 className="text-2xl sm:text-3xl">Consent first. Always.</h2>
              <ul className="mt-4 grid sm:grid-cols-3 gap-4 text-ink-2">
                <li>Partner APIs only return data for users who opted in — and you can switch it off any time.</li>
                <li>Offers are ranked by what you spend, never by age, gender or income.</li>
                <li>Turn off personalised offers, export everything as CSV or PDF, or delete your account.</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="border-t border-line">
          <div className="max-w-[1240px] mx-auto px-4 sm:px-8 py-20 text-center">
            <h2 className="text-4xl sm:text-5xl max-w-[18ch] mx-auto" style={{ fontVariationSettings: "'wdth' 85" }}>Your money has a shape. Go see it.</h2>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link to={signedIn ? '/dashboard' : '/signup'} className="btn btn-primary">Get started</Link>
              <button className="btn btn-ghost" disabled={!!busy} onClick={() => demo('convenience')}>Explore a live demo</button>
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-line">
        <div className="max-w-[1240px] mx-auto px-4 sm:px-8 py-8 flex flex-wrap gap-4 items-center justify-between text-sm text-ink-3">
          <Logo size={20} />
          <span>Hackathon prototype · demo data is simulated · React, Node.js, SQLite, three.js & Claude</span>
        </div>
      </footer>
    </div>
  );
}
