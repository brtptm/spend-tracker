import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { FiArrowLeft } from 'react-icons/fi';
import { api } from '../lib/api.js';
import { ErrorNote } from './ui.jsx';
import BrandLogo from './BrandLogo.jsx';

const DEMO = [['Rohan', '9876500001'], ['Neha', '9876500002'], ['Kabir', '9876500003']];
const fmt = (d) => (d.length > 5 ? `${d.slice(0, 5)} ${d.slice(5)}` : d);

/**
 * "Continue with Paytm": phone → one-time code. The phone is the identity Paytm uses when it
 * sends payments to our API, so signing in here links the user to data that already exists.
 */
export default function PaytmSignIn({ onToken }) {
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [req, setReq] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [left, setLeft] = useState(0);
  const codeRef = useRef(null);

  useEffect(() => { if (step === 'code') codeRef.current?.focus(); }, [step]);
  useEffect(() => { if (left <= 0) return; const t = setTimeout(() => setLeft((s) => s - 1), 1000); return () => clearTimeout(t); }, [left]);

  async function send(p = phone) {
    setBusy(true); setError(null);
    try { const r = await api.paytmStart(p); setReq(r); setCode(''); setStep('code'); setLeft(30); }
    catch (e) { setError(e); } finally { setBusy(false); }
  }
  async function verify(c = code) {
    if (c.length !== 6) return;
    setBusy(true); setError(null);
    try { const r = await api.paytmVerify(req.request_id, c); await onToken(r.token); }
    catch (e) { setError(e); setBusy(false); setCode(''); }
  }

  return (
    <div className="rounded-2xl border border-line bg-surface-2/60 p-5">
      <div className="flex items-center gap-2.5">
        <BrandLogo id="paytm" size={26} />
        <div className="text-[15px] font-semibold">Continue with Paytm</div>
        {step === 'code' && <button type="button" onClick={() => { setStep('phone'); setError(null); }} className="ml-auto inline-flex items-center gap-1 text-xs text-ink-3 hover:text-ink"><FiArrowLeft /> Change number</button>}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {step === 'phone' ? (
          <motion.form key="phone" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.18 }}
            onSubmit={(e) => { e.preventDefault(); send(); }} className="mt-4">
            <label className="label" htmlFor="paytm-phone">Mobile number linked to Paytm</label>
            <div className="mt-1.5 flex items-center rounded-xl bg-surface-solid border border-line focus-within:border-[var(--line-strong)] transition-colors">
              <span className="pl-3.5 pr-2 text-ink-3 num text-[15px]">+91</span>
              <input id="paytm-phone" className="flex-1 bg-transparent outline-none py-2.5 pr-3 num text-[16px] tracking-wide" inputMode="numeric" autoComplete="tel-national" placeholder="98765 43210"
                value={fmt(phone)} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} />
            </div>
            <button className="btn btn-primary w-full mt-3" disabled={busy || phone.length !== 10}>{busy ? 'Sending code…' : 'Send code'}</button>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-ink-3">
              Demo numbers:
              {DEMO.map(([n, p]) => <button type="button" key={p} className="chip !py-1 !px-2.5 !text-[11.5px]" onClick={() => { setPhone(p); send(p); }}>{n}</button>)}
            </div>
          </motion.form>
        ) : (
          <motion.form key="code" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.18 }}
            onSubmit={(e) => { e.preventDefault(); verify(); }} className="mt-4">
            <label className="label" htmlFor="paytm-code">Code sent to +91 {fmt(phone)}</label>
            <input id="paytm-code" ref={codeRef} className="field mt-1.5 !text-center num !text-[22px] !tracking-[0.5em] !py-2" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••"
              value={code} onChange={(e) => { const c = e.target.value.replace(/\D/g, '').slice(0, 6); setCode(c); if (c.length === 6) verify(c); }} aria-describedby="paytm-hint" />
            <button className="btn btn-primary w-full mt-3" disabled={busy || code.length !== 6}>{busy ? 'Verifying…' : 'Verify and continue'}</button>
            <div id="paytm-hint" className="mt-3 flex items-center justify-between gap-3 text-xs text-ink-3">
              {req?.demo_code ? <span>Demo code: <button type="button" className="num text-ink font-semibold" onClick={() => { setCode(req.demo_code); verify(req.demo_code); }}>{req.demo_code}</button> <span className="opacity-70">(tap to fill)</span></span> : <span>Check your SMS.</span>}
              <button type="button" disabled={left > 0 || busy} onClick={() => send()} className="text-ink-2 disabled:opacity-50">{left > 0 ? `Resend in ${left}s` : 'Resend code'}</button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
      {error && <div className="mt-3"><ErrorNote error={error} /></div>}
    </div>
  );
}
