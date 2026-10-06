import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import { FiCheck, FiX, FiUploadCloud, FiArrowLeft } from 'react-icons/fi';
import { api } from '../lib/api.js';
import { Logo, ErrorNote, Segmented } from '../components/ui.jsx';
import Universe from '../components/three/Universe.jsx';
import { CAT_COLORS, CAT_NAMES } from '../lib/cats.js';
import { useSignOut } from '../components/Shell.jsx';

const SAMPLES = [
  { id: 'convenience', title: 'Busy professional', body: 'Lots of food delivery and cabs, a few subscriptions.' },
  { id: 'fashion', title: 'Fashion & lifestyle', body: 'Myntra, Nykaa, cafés — and a coupon for everything.' },
  { id: 'subscriptions', title: 'Subscription-heavy', body: 'Streaming, music, software, gym — all on autopay.' },
];
const STEPS = ['Reading transactions', 'Categorising merchants', 'Finding patterns and subscriptions', 'Comparing with similar users', 'Ranking offers that fit'];
const PLANETS = Object.keys(CAT_COLORS).map((id, i) => ({ id, name: CAT_NAMES[id], color: CAT_COLORS[id], amount: [24, 16, 11, 9, 8, 6, 3][i] * 1000 }));

export default function Connect() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const signOut = useSignOut();
  const [step, setStep] = useState(0);
  const [share, setShare] = useState(false);
  const [source, setSource] = useState('paytm');
  const [persona, setPersona] = useState('convenience');
  const [months, setMonths] = useState('6');
  const [csv, setCsv] = useState(null);
  const [error, setError] = useState(null);
  const [phase, setPhase] = useState(0);

  useEffect(() => { if (step !== 2) return; const t = setInterval(() => setPhase((p) => Math.min(p + 1, STEPS.length - 1)), 700); return () => clearInterval(t); }, [step]);

  async function run() {
    setError(null); setStep(2); setPhase(0);
    try {
      await api.settings({ consentPartner: share, periodMonths: Number(months) });
      const started = Date.now();
      await api.importData(source === 'csv' ? { source: 'csv', csv: csv.text, months: Number(months) } : { source: 'paytm', persona, months: Number(months) });
      await new Promise((r) => setTimeout(r, Math.max(0, 3200 - (Date.now() - started)))); // let the reveal breathe
      await qc.invalidateQueries();
      nav('/dashboard');
    } catch (e) { setError(e); setStep(1); }
  }

  function onFile(e) {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.size > 5_000_000) { setError(new Error('Choose a CSV under 5 MB.')); return; }
    const r = new FileReader(); r.onload = () => setCsv({ name: f.name, text: String(r.result) }); r.readAsText(f);
  }

  return (
    <div className="ledger min-h-dvh flex flex-col">
      <header className="max-w-[1100px] w-full mx-auto px-4 sm:px-8 h-16 flex items-center justify-between">
        <Logo /><button onClick={signOut} className="text-sm text-ink-3 hover:text-ink">Sign out</button>
      </header>
      <main className="flex-1 max-w-[1100px] w-full mx-auto px-4 sm:px-8 pb-16 grid place-items-center">
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.section key="consent" className="w-full max-w-xl" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
              <div className="flex items-center gap-3 text-sm"><span className="font-semibold" style={{ color: '#00baf2' }}>Paytm</span><span className="text-ink-3">wants to share data with</span><span className="font-semibold">Spend Tracker</span></div>
              <h1 className="text-4xl mt-4">Connect your payment history</h1>
              <div className="panel p-6 mt-6 grid sm:grid-cols-2 gap-6">
                <div><div className="text-sm font-semibold text-lime-text mb-3">We’ll read</div><ul className="grid gap-2 text-sm">{['Amounts, dates and times', 'Merchant names and categories', 'Payment method and status'].map((x) => <li key={x} className="flex gap-2"><FiCheck className="mt-1 shrink-0 text-lime-text" />{x}</li>)}</ul></div>
                <div><div className="text-sm font-semibold text-ink-3 mb-3">We never see</div><ul className="grid gap-2 text-sm text-ink-2">{['Your balance or bank passwords', 'Your UPI PIN or card numbers', 'Messages or contacts'].map((x) => <li key={x} className="flex gap-2"><FiX className="mt-1 shrink-0" />{x}</li>)}</ul></div>
              </div>
              <label className="panel-quiet p-4 mt-4 flex gap-3 cursor-pointer">
                <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} className="mt-1 accent-[var(--lime)] w-4 h-4" />
                <span className="text-sm"><b>Share my spending insights with Paytm</b><span className="block text-ink-2 mt-0.5">Lets Paytm tailor offers in the Paytm app using your spending profile. Optional — change it any time in Settings.</span></span>
              </label>
              <button className="btn btn-primary w-full mt-6" onClick={() => setStep(1)}>Allow and continue</button>
            </motion.section>
          )}

          {step === 1 && (
            <motion.section key="source" className="w-full max-w-2xl" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
              <button className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink" onClick={() => setStep(0)}><FiArrowLeft /> Back</button>
              <h1 className="text-4xl mt-3">Choose your history</h1>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Segmented label="Source" value={source} onChange={setSource} options={[['paytm', 'Paytm history'], ['csv', 'Upload CSV']]} />
                <Segmented label="Months" value={months} onChange={setMonths} options={[['3', '3 months'], ['6', '6 months'], ['12', '12 months']]} />
              </div>
              {source === 'paytm' ? (
                <>
                  <p className="text-sm text-ink-3 mt-5">This prototype simulates the Paytm feed. Pick the history that’s closest to yours.</p>
                  <div role="radiogroup" aria-label="Sample history" className="mt-3 grid sm:grid-cols-3 gap-3">
                    {SAMPLES.map((s) => (
                      <button key={s.id} role="radio" aria-checked={persona === s.id} onClick={() => setPersona(s.id)} className="panel p-4 text-left transition-colors" style={persona === s.id ? { borderColor: 'var(--lime)', boxShadow: '0 0 0 1px var(--lime)' } : undefined}>
                        <div className="font-semibold">{s.title}</div><div className="text-sm text-ink-2 mt-1">{s.body}</div>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <label className="panel mt-5 p-8 grid place-items-center text-center cursor-pointer border-dashed hover:border-cyan">
                  <FiUploadCloud size={28} className="text-cyan-text" />
                  <span className="font-semibold mt-3">{csv ? csv.name : 'Choose a Paytm statement CSV'}</span>
                  <span className="text-sm text-ink-3 mt-1">Needs date, amount and merchant (or “Paid to”) columns.</span>
                  <input type="file" accept=".csv,text/csv" className="sr-only" onChange={onFile} />
                </label>
              )}
              <div className="mt-4"><ErrorNote error={error} /></div>
              <button className="btn btn-primary w-full mt-6" disabled={source === 'csv' && !csv} onClick={run}>Analyse my spending</button>
            </motion.section>
          )}

          {step === 2 && (
            <motion.section key="run" className="w-full relative isolate min-h-[70dvh] rounded-[28px] overflow-hidden border border-line grid place-items-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Universe planets={PLANETS.slice(0, phase + 3)} variant="dashboard" interactive={false} className="-z-10" />
              <div className="w-full p-8 sm:p-12 text-center" style={{ background: 'linear-gradient(transparent, var(--bg) 60%)' }} role="status">
                <h1 className="text-3xl sm:text-4xl">Mapping your money</h1>
                <ol className="mt-5 grid gap-1.5 text-ink-3">
                  {STEPS.map((s, i) => <li key={s} className={i <= phase ? 'text-ink' : ''}>{i < phase ? '✓ ' : i === phase ? '… ' : ''}{s}</li>)}
                </ol>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
