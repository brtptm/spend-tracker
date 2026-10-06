import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Logo } from '../../components/ui.jsx';
import { Md, CodeBlock, CopyButton, snippets } from './code.jsx';

const ORIGIN = typeof window !== 'undefined' ? window.location.origin : '';
const METHOD = { GET: 'var(--positive)', POST: 'var(--gold)', PUT: 'var(--warning)', PATCH: 'var(--warning)', DELETE: 'var(--negative)' };
const ENUM_SECTIONS = [['enum-categories', 'Categories'], ['enum-filter-codes', 'Filter codes'], ['enum-reject-codes', 'Reject codes'], ['enum-scopes', 'Scopes'], ['enum-mcc', 'MCC map']];

async function fetchSpec() {
  const r = await fetch('/v1/spec');
  if (!r.ok) throw new Error(`Could not load the API spec (HTTP ${r.status}).`);
  return r.json();
}

export function MethodBadge({ method, size = 'sm' }) {
  const c = METHOD[method] || 'var(--ink-2)';
  return (
    <span className={`dc-mono inline-flex items-center justify-center rounded-md font-semibold tracking-wide shrink-0 ${size === 'sm' ? 'text-[9.5px] h-[18px] min-w-[38px] px-1' : 'text-[11px] h-6 px-2'}`}
      style={{ color: c, background: `color-mix(in srgb, ${c} 13%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${c} 22%, transparent)` }}>
      {method === 'DELETE' ? 'DEL' : method}
    </span>
  );
}

const baseType = (t = '') => t.replace(/\[\]$/, '').trim();

/** Docs for partner integrators. Always dark; generated from GET /v1/spec. */
export default function Docs() {
  // Developer docs are always dark, whatever the app theme is.
  useEffect(() => {
    const root = document.documentElement, prev = root.dataset.theme;
    root.dataset.theme = 'dark';
    const prevTitle = document.title; document.title = 'Spend Tracker · Partner API docs';
    return () => { root.dataset.theme = prev || 'dark'; document.title = prevTitle; };
  }, []);

  const q = useQuery({ queryKey: ['docs-spec'], queryFn: fetchSpec, staleTime: Infinity, retry: 1 });
  const spec = q.data;
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState(false);

  const nav = useMemo(() => {
    if (!spec) return null;
    const groups = [];
    for (const e of spec.endpoints) { let g = groups.find((x) => x.name === e.group); if (!g) groups.push(g = { name: e.group, items: [] }); g.items.push(e); }
    return { guides: spec.guides, groups, schemas: Object.keys(spec.schemas) };
  }, [spec]);

  const ids = useMemo(() => !spec ? [] : [...spec.guides.map((g) => g.id), 'api-reference', ...spec.endpoints.map((e) => e.id), 'schemas', ...Object.keys(spec.schemas), 'enums', ...ENUM_SECTIONS.map(([id]) => id)], [spec]);
  const active = useScrollSpy(ids);

  // Deep links: scroll to the hash once the spec has rendered.
  useEffect(() => {
    if (!spec) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
  }, [spec]);

  // ⌘K / Ctrl+K / "/" opens search.
  useEffect(() => {
    const onKey = (e) => {
      const typing = /input|textarea|select/i.test(document.activeElement?.tagName || '');
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) { e.preventDefault(); setSearch(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = useCallback((id) => {
    setDrawer(false); setSearch(false);
    // Let overlays unmount first so nothing interrupts the scroll.
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); history.replaceState(null, '', `#${id}`); }
    });
  }, []);

  return (
    <div className="docs min-h-dvh bg-[var(--bg)] text-ink">
      <DocsStyles />
      <TopBar spec={spec} onMenu={() => setDrawer(true)} onSearch={() => setSearch(true)} />
      <div className="max-w-[1640px] mx-auto flex">
        <aside data-nav-scroll className="hidden lg:block w-[264px] shrink-0 sticky top-[60px] h-[calc(100dvh-60px)] overflow-y-auto dc-scroll border-r border-white/[.06] px-4 py-6" aria-label="Documentation">
          {nav ? <Sidebar nav={nav} active={active} onGo={go} /> : <SidebarSkeleton />}
        </aside>
        <main className="flex-1 min-w-0 px-4 sm:px-8 xl:px-12 pb-32">
          {q.isLoading && <ContentSkeleton />}
          {q.error && (
            <div className="max-w-md mx-auto py-24 text-center">
              <p className="text-ink-2">{q.error.message}</p>
              <button className="btn btn-primary mt-5" onClick={() => q.refetch()}>Try again</button>
            </div>
          )}
          {spec && <Content spec={spec} onGo={go} />}
        </main>
      </div>

      <AnimatePresence>
        {drawer && nav && (
          <motion.div className="fixed inset-0 z-50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/70" onClick={() => setDrawer(false)} />
            <motion.nav data-nav-scroll className="absolute left-0 top-0 bottom-0 w-[84%] max-w-[320px] bg-[#0a0a0b] border-r border-white/[.08] overflow-y-auto dc-scroll px-4 py-5" aria-label="Documentation"
              initial={{ x: -40 }} animate={{ x: 0 }} exit={{ x: -40 }} transition={{ type: 'spring', damping: 30, stiffness: 340 }}>
              <div className="flex items-center justify-between mb-5"><Logo size={22} /><button className="w-9 h-9 grid place-items-center rounded-full bg-white/[.06]" onClick={() => setDrawer(false)} aria-label="Close menu">✕</button></div>
              <Sidebar nav={nav} active={active} onGo={go} />
            </motion.nav>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>{search && spec && <Search spec={spec} onClose={() => setSearch(false)} onGo={go} />}</AnimatePresence>
    </div>
  );
}

function useScrollSpy(ids) {
  const [active, setActive] = useState(null);
  useEffect(() => {
    if (!ids.length) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        let cur = ids[0];
        for (const id of ids) { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top <= 120) cur = id; }
        setActive((a) => (a === cur ? a : cur));
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, [ids]);
  // Keep the sidebar item in view and the URL deep-linkable as you read.
  useEffect(() => {
    if (!active) return;
    // Scroll only the sidebar container (scrollIntoView would also move the window and cancel smooth scrolling).
    document.querySelectorAll(`[data-nav="${active}"]`).forEach((el) => {
      const box = el.closest('[data-nav-scroll]');
      if (!box || !el.offsetParent) return;
      const er = el.getBoundingClientRect(), br = box.getBoundingClientRect();
      if (er.top < br.top + 40) box.scrollTop -= br.top + 40 - er.top;
      else if (er.bottom > br.bottom - 40) box.scrollTop += er.bottom - (br.bottom - 40);
    });
    const want = active === ids[0] && window.scrollY < 40 ? '' : `#${active}`;
    if (window.location.hash !== want) history.replaceState(null, '', want || window.location.pathname);
  }, [active, ids]);
  return active;
}

function TopBar({ spec, onMenu, onSearch }) {
  return (
    <header className="sticky top-0 z-40 h-[60px] border-b border-white/[.07] bg-[rgba(0,0,0,.72)] backdrop-blur-xl">
      <div className="max-w-[1640px] mx-auto h-full px-4 sm:px-6 flex items-center gap-3">
        <button className="lg:hidden w-9 h-9 -ml-1 grid place-items-center rounded-lg hover:bg-white/[.06]" onClick={onMenu} aria-label="Open menu">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h10" /></svg>
        </button>
        <Link to="/docs" className="flex items-center gap-2.5 shrink-0" aria-label="Spend Tracker developers">
          <Logo size={22} text={false} />
          <span className="font-semibold tracking-[-0.02em] hidden sm:inline">Spend Tracker</span>
          <span className="text-ink-3 hidden sm:inline">/</span>
          <span className="text-ink-2">Developers</span>
        </Link>
        {spec && <span className="dc-mono hidden md:inline text-[11px] text-ink-3 rounded-full px-2 py-0.5 border border-white/[.08]">v{spec.info.version}</span>}
        <button onClick={onSearch} className="ml-auto md:ml-6 flex items-center gap-2.5 h-9 w-9 md:w-[300px] justify-center md:justify-start md:px-3 rounded-lg bg-white/[.05] border border-white/[.07] text-ink-3 hover:text-ink-2 hover:bg-white/[.07] transition-colors" aria-label="Search the docs">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <span className="hidden md:inline text-[13px]">Search endpoints, schemas…</span>
          <kbd className="hidden md:inline ml-auto dc-mono text-[10.5px] px-1.5 py-0.5 rounded border border-white/[.1] text-ink-3">⌘K</kbd>
        </button>
        <nav className="hidden md:flex items-center gap-1 text-[13px] md:ml-auto">
          <a href="/v1/openapi.json" target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-lg text-ink-2 hover:text-ink hover:bg-white/[.05]">OpenAPI</a>
          <Link to="/portal" className="ml-1 px-3.5 py-1.5 rounded-full bg-[var(--ink)] text-black font-medium hover:opacity-90">Integration Portal</Link>
        </nav>
      </div>
    </header>
  );
}

function NavItem({ id, active, onGo, children, className = '' }) {
  const on = active === id;
  return (
    <a href={`#${id}`} data-nav={id} aria-current={on ? 'location' : undefined} onClick={(e) => { e.preventDefault(); onGo(id); }}
      className={`flex items-center gap-2 rounded-md px-2.5 py-[5px] text-[13px] transition-colors ${on ? 'bg-white/[.07] text-ink' : 'text-ink-2 hover:text-ink hover:bg-white/[.04]'} ${className}`}>
      {children}
    </a>
  );
}

function Sidebar({ nav, active, onGo }) {
  const Head = ({ children }) => <div className="dc-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-3 px-2.5 mt-7 mb-2 first:mt-0">{children}</div>;
  return (
    <div>
      <Head>Guides</Head>
      {nav.guides.map((g) => <NavItem key={g.id} id={g.id} active={active} onGo={onGo}>{g.title}</NavItem>)}
      <Head>API reference</Head>
      {nav.groups.map((g) => (
        <div key={g.name} className="mb-2">
          <div className="text-[12px] font-medium text-ink px-2.5 pt-2 pb-1">{g.name}</div>
          {g.items.map((e) => (
            <NavItem key={e.id} id={e.id} active={active} onGo={onGo}>
              <MethodBadge method={e.method} /><span className="truncate">{e.title}</span>
            </NavItem>
          ))}
        </div>
      ))}
      <Head>Schemas</Head>
      {nav.schemas.map((s) => <NavItem key={s} id={s} active={active} onGo={onGo}><span className="dc-mono text-[12.5px]">{s}</span></NavItem>)}
      <Head>Enums</Head>
      {ENUM_SECTIONS.map(([id, label]) => <NavItem key={id} id={id} active={active} onGo={onGo}>{label}</NavItem>)}
      <div className="h-10" />
    </div>
  );
}

const SidebarSkeleton = () => <div className="grid gap-2">{Array.from({ length: 18 }, (_, i) => <div key={i} className="skeleton h-5" style={{ width: `${55 + ((i * 37) % 40)}%` }} />)}</div>;
const ContentSkeleton = () => (
  <div className="max-w-[860px] pt-16 grid gap-5" aria-busy="true" aria-label="Loading documentation">
    <div className="skeleton h-4 w-32" /><div className="skeleton h-12 w-3/4" /><div className="skeleton h-5 w-2/3" />
    <div className="grid sm:grid-cols-3 gap-4 mt-6">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-36 !rounded-2xl" />)}</div>
  </div>
);

// ── Content ──────────────────────────────────────────────────────────────────
function Content({ spec, onGo }) {
  const schemaNames = useMemo(() => new Set(Object.keys(spec.schemas)), [spec]);
  return (
    <div>
      {spec.guides.map((g) => <Guide key={g.id} g={g} spec={spec} onGo={onGo} />)}

      <section id="api-reference" className="dc-anchor pt-20 border-t border-white/[.06] mt-16">
        <div className="max-w-[760px]">
          <div className="dc-eyebrow">API reference</div>
          <h2 className="text-[2rem] sm:text-[2.4rem] mt-2">Endpoints</h2>
          <p className="text-ink-2 mt-3 leading-relaxed">Every endpoint, its parameters and a real response captured from the live API. Base URL <code className="dc-inline">{ORIGIN}/v1</code>.</p>
          <div className="mt-6 grid sm:grid-cols-2 gap-2">
            {spec.endpoints.map((e) => (
              <a key={e.id} href={`#${e.id}`} onClick={(ev) => { ev.preventDefault(); onGo(e.id); }} className="flex items-center gap-2.5 rounded-lg px-3 py-2 bg-white/[.025] border border-white/[.06] hover:bg-white/[.05] transition-colors min-w-0">
                <MethodBadge method={e.method} /><span className="dc-mono text-[12px] text-ink-2 truncate">{e.path}</span>
              </a>
            ))}
          </div>
        </div>
      </section>
      {spec.endpoints.map((e) => <Endpoint key={e.id} e={e} spec={spec} schemaNames={schemaNames} onGo={onGo} />)}

      <section id="schemas" className="dc-anchor pt-20 border-t border-white/[.06] mt-16">
        <div className="dc-eyebrow">Reference</div>
        <h2 className="text-[2rem] sm:text-[2.4rem] mt-2">Schemas</h2>
        <p className="text-ink-2 mt-3 max-w-[680px]">Objects used in requests and responses. Types that name another schema link to it.</p>
      </section>
      {Object.entries(spec.schemas).map(([name, s]) => (
        <section key={name} id={name} className="dc-anchor pt-12 max-w-[920px]">
          <div className="flex items-baseline gap-3 flex-wrap"><h3 className="dc-mono text-[1.25rem] font-semibold tracking-[-0.01em]">{name}</h3><span className="text-[12px] text-ink-3">{s.fields.length} fields</span></div>
          <p className="text-ink-2 mt-1.5"><Md text={s.description} /></p>
          <FieldTable fields={s.fields} spec={spec} schemaNames={schemaNames} onGo={onGo} />
        </section>
      ))}

      <Enums spec={spec} />
      <footer className="mt-24 pt-8 border-t border-white/[.06] flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-ink-3">
        <span>{spec.info.title} · v{spec.info.version}</span>
        <a className="hover:text-ink" href="/v1/openapi.json" target="_blank" rel="noreferrer">OpenAPI 3.1</a>
        <Link className="hover:text-ink" to="/portal">Integration Portal</Link>
        <Link className="hover:text-ink" to="/">Spend Tracker app</Link>
      </footer>
    </div>
  );
}

function Hero({ spec, onGo }) {
  const cards = [
    { k: 'Ingest', t: 'Webhook or batch', d: 'Push each UPI payment as it settles, or up to 1,000 at a time. Idempotent, with per-item results.', to: 'ingestion', icon: <path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /> },
    { k: 'Clean', t: 'Deterministic pipeline', d: 'Validate, normalise, filter junk, de-duplicate and categorise. Same input, same answer — no AI in the path.', to: 'pipeline', icon: <path d="M4 6h16M7 12h10M10 18h4" /> },
    { k: 'Read', t: 'Behaviour by phone', d: 'Summaries for any window, apps used, preferences, UPI IDs and monthly reports — keyed by mobile number.', to: 'get-behavior', icon: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></> },
  ];
  const ev = spec.endpoints.find((e) => e.id === 'send-event');
  return (
    <div className="relative pt-14 sm:pt-20 pb-6">
      <div className="pointer-events-none absolute -top-10 left-0 w-[520px] max-w-full h-[320px] opacity-[.22] blur-3xl" style={{ background: 'radial-gradient(closest-side, rgba(201,184,138,.35), transparent)' }} aria-hidden="true" />
      <div className="relative grid xl:grid-cols-[minmax(0,1fr)_440px] gap-10 items-center">
      <div>
        <div className="dc-eyebrow">Partner API · v{spec.info.version}</div>
        <h1 className="text-[2.4rem] sm:text-[3.4rem] leading-[1.02] tracking-[-0.045em] mt-3 max-w-[18ch]">Turn raw UPI payments into <span className="text-[var(--gold)]">spending intelligence.</span></h1>
        <p className="text-ink-2 text-[1.06rem] sm:text-[1.15rem] mt-5 max-w-[60ch] leading-relaxed">Send the UPI payments your rails already see — as webhooks or batches. Get back clean categories, the apps people use, behaviour and preferences for every phone number.</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <button className="btn btn-primary !px-5" onClick={() => onGo('quickstart')}>Quickstart →</button>
          <button className="btn btn-ghost !px-5" onClick={() => onGo('api-reference')}>API reference</button>
          <Link to="/portal" className="btn btn-ghost !px-5">Get an API key</Link>
        </div>
      </div>
      {ev?.response && <HeroPreview ev={ev} />}
      </div>
      <div className="relative mt-12 grid md:grid-cols-3 gap-3">
        {cards.map((c) => (
          <a key={c.k} href={`#${c.to}`} onClick={(e) => { e.preventDefault(); onGo(c.to); }} className="group rounded-2xl p-5 bg-white/[.025] border border-white/[.07] hover:bg-white/[.045] hover:border-white/[.12] transition-colors">
            <div className="flex items-center justify-between">
              <span className="w-9 h-9 grid place-items-center rounded-xl bg-white/[.06] text-[var(--gold)]"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{c.icon}</svg></span>
              <span className="dc-mono text-[10.5px] uppercase tracking-[0.14em] text-ink-3">{c.k}</span>
            </div>
            <div className="font-semibold mt-4 text-[1.02rem]">{c.t}</div>
            <p className="text-[13.5px] text-ink-2 mt-1.5 leading-relaxed">{c.d}</p>
            <div className="text-[12.5px] text-ink-3 group-hover:text-ink mt-4 transition-colors">Learn more →</div>
          </a>
        ))}
      </div>
      <div className="relative mt-4 rounded-2xl border border-white/[.07] bg-white/[.02] px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px]">
        <span className="text-ink-3">Base URL</span><code className="dc-mono text-ink">{ORIGIN}/v1</code>
        <span className="text-ink-3 sm:ml-4">Auth</span><code className="dc-mono text-ink">Authorization: Bearer stk_live_…</code>
        <CopyButton text={`${ORIGIN}/v1`} label="Copy URL" className="ml-auto" />
      </div>
    </div>
  );
}

/** One real round trip: a raw Paytm payment in, a clean categorised transaction out. */
function HeroPreview({ ev }) {
  const b = ev.bodyExample, t = ev.response.transaction || {};
  const row = (k, v, c) => <div className="flex justify-between gap-4 py-1.5 border-b border-white/[.05] last:border-0"><span className="text-ink-3">{k}</span><span className="dc-mono text-right truncate" style={{ color: c }}>{v}</span></div>;
  return (
    <div className="hidden xl:block relative">
      <div className="dc-code">
        <div className="flex items-center gap-2 px-4 h-10 border-b border-white/[.07]"><MethodBadge method="POST" /><span className="dc-mono text-[12px] text-ink-2">/v1/events</span><span className="ml-auto text-[11px] text-ink-3">raw from Paytm</span></div>
        <div className="px-4 py-3 text-[12.5px]">
          {row('payee_name', `"${b.payee_name}"`, 'var(--dc-str)')}{row('payee_vpa', `"${b.payee_vpa}"`, 'var(--dc-str)')}{row('amount', b.amount, 'var(--dc-num)')}{row('phone', `"${b.phone}"`, 'var(--dc-str)')}
        </div>
      </div>
      <div className="flex justify-center py-2.5 text-ink-3" aria-hidden="true"><svg width="18" height="26" viewBox="0 0 18 26" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M9 1v22M3 17l6 6 6-6" /></svg></div>
      <div className="dc-code" style={{ boxShadow: '0 0 0 1px rgba(201,184,138,.18), 0 30px 80px -30px rgba(201,184,138,.18)' }}>
        <div className="flex items-center gap-2 px-4 h-10 border-b border-white/[.07]"><span className="dc-mono text-[11.5px] font-semibold" style={{ color: 'var(--positive)' }}>202</span><span className="dc-mono text-[12px] text-ink-2">{ev.response.status}</span><span className="ml-auto text-[11px] text-ink-3">clean & categorised</span></div>
        <div className="px-4 py-3 text-[12.5px]">
          {row('merchant', `"${t.merchant}"`, 'var(--ink)')}{row('category', `"${t.category}" · "${t.subcategory}"`, 'var(--dc-str)')}{row('confidence', t.confidence, 'var(--dc-num)')}{row('categorised_by', `"${t.categorised_by}"`, 'var(--dc-str)')}{row('user.phone', `"${t.user?.phone}"`, 'var(--dc-str)')}
        </div>
      </div>
    </div>
  );
}

function Guide({ g, spec, onGo }) {
  const isOverview = g.id === 'overview', isPipeline = g.id === 'pipeline';
  return (
    <section id={g.id} className={`dc-anchor ${isOverview ? 'max-w-[1240px]' : 'pt-16 max-w-[860px]'}`}>
      {isOverview ? <Hero spec={spec} onGo={onGo} /> : <><div className="dc-eyebrow">Guide</div><h2 className="text-[1.7rem] sm:text-[1.95rem] mt-1.5">{g.title}</h2></>}
      <div className={`grid gap-3 ${isOverview ? 'mt-4' : 'mt-4'}`}>
        {(g.body || []).map((p, i) => <p key={i} className="text-ink-2 leading-[1.75] max-w-[860px]"><Md text={p} /></p>)}
      </div>
      {g.steps && (isPipeline ? <Pipeline steps={g.steps} /> : <Steps steps={g.steps} />)}
      {g.table && <SimpleTable head={g.table.head} rows={g.table.rows} />}
    </section>
  );
}

function Steps({ steps }) {
  return (
    <ol className="mt-6 relative">
      {steps.map((s, i) => (
        <li key={i} className="relative pl-12 pb-8 last:pb-0">
          {i < steps.length - 1 && <span className="absolute left-[15px] top-8 bottom-0 w-px bg-gradient-to-b from-white/20 to-white/[.04]" aria-hidden="true" />}
          <span className="absolute left-0 top-0 w-8 h-8 grid place-items-center rounded-full dc-mono text-[12px] font-semibold bg-white/[.06] border border-white/[.1] text-[var(--gold)]">{i + 1}</span>
          <div className="font-semibold pt-1">{s.title}</div>
          <p className="text-ink-2 mt-1"><Md text={s.body} /></p>
          {s.code && <CodeBlock className="mt-3" code={s.code.replaceAll('{BASE}', ORIGIN)} lang="shell" title={<span className="text-[12px] text-ink-3">Terminal</span>} />}
        </li>
      ))}
    </ol>
  );
}

function Pipeline({ steps }) {
  return (
    <div className="mt-7 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {steps.map((s, i) => {
        const [num, ...rest] = s.title.split('·');
        return (
          <div key={i} className="relative rounded-2xl p-5 bg-white/[.025] border border-white/[.07] overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, rgba(201,184,138,${0.25 + i * 0.1}), transparent)` }} aria-hidden="true" />
            <div className="flex items-center gap-2.5">
              <span className="dc-mono text-[11px] w-6 h-6 grid place-items-center rounded-md bg-white/[.06] text-[var(--gold)]">{num.trim()}</span>
              <span className="font-semibold">{rest.join('·').trim() || s.title}</span>
              {i < steps.length - 1 && <span className="ml-auto text-ink-3 hidden lg:inline" aria-hidden="true">→</span>}
            </div>
            <p className="text-[13.5px] text-ink-2 mt-3 leading-relaxed"><Md text={s.body} /></p>
          </div>
        );
      })}
    </div>
  );
}

function SimpleTable({ head, rows, mono = [] }) {
  return (
    <div className="mt-5 dc-table-wrap">
      <table className="dc-table">
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={mono.includes(j) ? 'dc-mono' : ''}><Md text={c} /></td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

// ── Endpoint ─────────────────────────────────────────────────────────────────
function Endpoint({ e, spec, schemaNames, onGo }) {
  const okStatus = e.responses.find((r) => r.status < 300)?.status || 200;
  const bodyFields = !e.body ? null : typeof e.body === 'string' ? spec.schemas[e.body]?.fields : e.body.fields;
  return (
    <section id={e.id} className="dc-anchor pt-16 mt-4 border-t border-white/[.05] first-of-type:border-0">
      <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,0.92fr)] gap-x-12 gap-y-8">
        <div className="min-w-0">
          <div className="dc-eyebrow">{e.group}</div>
          <h3 className="text-[1.55rem] sm:text-[1.75rem] mt-1.5 tracking-[-0.03em]">{e.title}</h3>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2 min-w-0 rounded-lg bg-white/[.04] border border-white/[.07] pl-2 pr-1 py-1 max-w-full">
              <MethodBadge method={e.method} size="md" />
              <code className="dc-mono text-[13px] text-ink truncate">{e.path}</code>
              <CopyButton text={`${ORIGIN}${e.path}`} label="Copy" />
            </div>
            {e.scope ? <span className="dc-mono text-[11px] rounded-full px-2.5 py-1 text-[var(--gold)] bg-[rgba(201,184,138,.1)] border border-[rgba(201,184,138,.2)]" title="Required key scope">{e.scope}</span>
              : <span className="text-[11px] rounded-full px-2.5 py-1 text-ink-3 border border-white/[.08]">Any valid key</span>}
          </div>
          <p className="text-ink-2 mt-4 leading-[1.75]"><Md text={e.description} /></p>

          {e.params?.length > 0 && <ParamBlock title="Path parameters" fields={e.params} spec={spec} schemaNames={schemaNames} onGo={onGo} />}
          {e.query?.length > 0 && <ParamBlock title="Query parameters" fields={e.query} spec={spec} schemaNames={schemaNames} onGo={onGo} />}
          {e.headers?.length > 0 && <ParamBlock title="Headers" fields={e.headers} spec={spec} schemaNames={schemaNames} onGo={onGo} />}
          {bodyFields && (
            <ParamBlock title="Request body" note={typeof e.body === 'string' ? <SchemaLink name={e.body} onGo={onGo} /> : 'application/json'} fields={bodyFields} spec={spec} schemaNames={schemaNames} onGo={onGo} />
          )}

          <h4 className="dc-subhead">Responses</h4>
          <ul className="grid gap-1.5">
            {e.responses.map((r) => {
              const c = r.status < 300 ? 'var(--positive)' : r.status < 500 ? 'var(--warning)' : 'var(--negative)';
              return (
                <li key={r.status} className="flex items-start gap-3 rounded-lg px-3 py-2.5 bg-white/[.02] border border-white/[.05]">
                  <span className="dc-mono text-[12px] font-semibold rounded-md px-1.5 py-0.5 shrink-0" style={{ color: c, background: `color-mix(in srgb, ${c} 12%, transparent)` }}>{r.status}</span>
                  <span className="text-[13.5px] text-ink-2 flex-1 min-w-0">{r.description ? <Md text={r.description} /> : 'OK'}{r.schema && <> · <SchemaLink name={r.schema} onGo={onGo} /></>}{r.status >= 400 && <> · <SchemaLink name="Error" onGo={onGo} /></>}</span>
                </li>
              );
            })}
          </ul>
        </div>
        <div className="min-w-0 xl:sticky xl:top-[84px] xl:self-start grid gap-3">
          <RequestPanel e={e} />
          {e.response && <CodeBlock code={JSON.stringify(e.response, null, 2)} lang="json" maxH={460}
            title={<><span className="dc-mono text-[11.5px] font-semibold" style={{ color: 'var(--positive)' }}>{okStatus}</span><span className="text-[12px] text-ink-3 ml-2">Response · captured from the live API</span></>} />}
        </div>
      </div>
    </section>
  );
}

function RequestPanel({ e }) {
  const s = useMemo(() => snippets(e, ORIGIN), [e]);
  const [tab, setTab] = useState(() => { try { return localStorage.getItem('docs-lang') || 'curl'; } catch { return 'curl'; } });
  const pick = (t) => { setTab(t); try { localStorage.setItem('docs-lang', t); } catch { /* storage blocked */ } };
  const tabs = [['curl', 'cURL'], ['node', 'Node'], ['python', 'Python']];
  return (
    <CodeBlock code={s[tab]} lang={tab === 'curl' ? 'shell' : tab} maxH={380}
      title={<div role="tablist" aria-label="Language" className="flex gap-0.5">{tabs.map(([k, l]) => (
        <button key={k} role="tab" aria-selected={tab === k} onClick={() => pick(k)} className={`text-[12px] px-2.5 py-1 rounded-md transition-colors ${tab === k ? 'bg-white/[.08] text-ink' : 'text-ink-3 hover:text-ink-2'}`}>{l}</button>
      ))}</div>} />
  );
}

const SchemaLink = ({ name, onGo }) => (
  <a href={`#${name}`} onClick={(e) => { e.preventDefault(); onGo(name); }} className="dc-mono text-[12.5px] text-[var(--gold)] hover:underline underline-offset-2">{name}</a>
);

function ParamBlock({ title, note, fields, spec, schemaNames, onGo }) {
  return (
    <>
      <h4 className="dc-subhead flex items-baseline gap-3">{title}{note && <span className="text-[12px] font-normal text-ink-3 normal-case tracking-normal">{note}</span>}</h4>
      <FieldList fields={fields} spec={spec} schemaNames={schemaNames} onGo={onGo} depth={0} />
    </>
  );
}

function TypeLabel({ type, schemaNames, onGo }) {
  const b = baseType(type);
  if (schemaNames.has(b)) return <a href={`#${b}`} onClick={(e) => { e.preventDefault(); onGo(b); }} className="dc-mono text-[12px] text-[var(--gold)] hover:underline underline-offset-2">{type}</a>;
  return <span className="dc-mono text-[12px] text-ink-3">{type}</span>;
}

function FieldList({ fields, spec, schemaNames, onGo, depth }) {
  return (
    <ul className={`divide-y divide-white/[.05] ${depth ? 'mt-2 rounded-lg border border-white/[.06] bg-white/[.015] px-3' : 'border-y border-white/[.06]'}`}>
      {fields.map((f) => <Field key={f.name} f={f} spec={spec} schemaNames={schemaNames} onGo={onGo} depth={depth} />)}
    </ul>
  );
}

function Field({ f, spec, schemaNames, onGo, depth }) {
  const [open, setOpen] = useState(false);
  const nested = depth < 2 && schemaNames.has(baseType(f.type)) ? spec.schemas[baseType(f.type)] : null;
  return (
    <li className="py-3">
      <div className="flex items-baseline gap-x-2.5 gap-y-1 flex-wrap">
        <code className="dc-mono text-[13px] font-semibold text-ink">{f.name}</code>
        <TypeLabel type={f.type} schemaNames={schemaNames} onGo={onGo} />
        {f.required && <span className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: 'var(--warning)' }}>required</span>}
        {f.default !== undefined && <span className="text-[11.5px] text-ink-3">default <code className="dc-inline">{String(f.default)}</code></span>}
      </div>
      {f.description && <p className="text-[13.5px] text-ink-2 mt-1 leading-relaxed"><Md text={f.description} /></p>}
      {f.enum && (
        <div className="mt-2 flex flex-wrap gap-1.5">{f.enum.map((v) => <code key={v} className="dc-inline !text-[11.5px]">{v}</code>)}</div>
      )}
      {f.example !== undefined && typeof f.example !== 'object' && <div className="mt-1.5 text-[12px] text-ink-3">Example <code className="dc-inline">{String(f.example)}</code></div>}
      {f.example !== undefined && typeof f.example === 'object' && <div className="mt-1.5 text-[12px] text-ink-3">Example <code className="dc-inline">{JSON.stringify(f.example)}</code></div>}
      {nested && (
        <>
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-ink-3 hover:text-ink rounded-full border border-white/[.08] px-2.5 py-1">
            <span className="transition-transform" style={{ transform: open ? 'rotate(90deg)' : 'none' }}>›</span>{open ? 'Hide' : 'Show'} child attributes
          </button>
          {open && <FieldList fields={nested.fields} spec={spec} schemaNames={schemaNames} onGo={onGo} depth={depth + 1} />}
        </>
      )}
    </li>
  );
}

function FieldTable({ fields, spec, schemaNames, onGo }) {
  return <div className="mt-4"><FieldList fields={fields} spec={spec} schemaNames={schemaNames} onGo={onGo} depth={0} /></div>;
}

// ── Enums ────────────────────────────────────────────────────────────────────
function Enums({ spec }) {
  const [mccQ, setMccQ] = useState('');
  const mcc = spec.enums.mcc.filter((m) => !mccQ || `${m.mcc} ${m.category} ${m.sub}`.toLowerCase().includes(mccQ.toLowerCase()));
  return (
    <>
      <section id="enums" className="dc-anchor pt-20 border-t border-white/[.06] mt-16">
        <div className="dc-eyebrow">Reference</div>
        <h2 className="text-[2rem] sm:text-[2.4rem] mt-2">Enums</h2>
        <p className="text-ink-2 mt-3 max-w-[680px]">Stable values you can switch on in code.</p>
      </section>
      <section id="enum-categories" className="dc-anchor pt-12 max-w-[920px]">
        <h3 className="text-[1.25rem] font-semibold">Categories</h3>
        <p className="text-ink-2 mt-1.5 text-[14px]">Every payment lands in exactly one category and subcategory.</p>
        <div className="mt-4 dc-table-wrap">
          <table className="dc-table">
            <thead><tr><th>category</th><th>Name</th><th>Subcategories</th></tr></thead>
            <tbody>{spec.enums.categories.map((c) => (
              <tr key={c.id}>
                <td className="dc-mono">{c.id}</td><td className="whitespace-nowrap">{c.name}</td>
                <td><div className="flex flex-wrap gap-1.5">{c.subcategories.map((s) => <span key={s.id} className="dc-inline !text-[11.5px]" title={s.name}>{s.id}</span>)}</div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
      <section id="enum-filter-codes" className="dc-anchor pt-12 max-w-[920px]">
        <h3 className="text-[1.25rem] font-semibold">Filter codes</h3>
        <p className="text-ink-2 mt-1.5 text-[14px]">Valid payments that are not stored as spending (<code className="dc-inline">status: filtered</code>). No action needed.</p>
        <SimpleTable head={['code', 'Meaning']} rows={spec.enums.filter_codes.map((c) => [`\`${c.code}\``, c.message])} />
      </section>
      <section id="enum-reject-codes" className="dc-anchor pt-12 max-w-[920px]">
        <h3 className="text-[1.25rem] font-semibold">Reject codes</h3>
        <p className="text-ink-2 mt-1.5 text-[14px]">Invalid input (<code className="dc-inline">status: rejected</code>). Fix the field in <code className="dc-inline">param</code> and resend.</p>
        <SimpleTable head={['code', 'Meaning']} rows={spec.enums.reject_codes.map((c) => [`\`${c.code}\``, c.message])} />
      </section>
      <section id="enum-scopes" className="dc-anchor pt-12 max-w-[920px]">
        <h3 className="text-[1.25rem] font-semibold">Scopes</h3>
        <SimpleTable head={['scope', 'Allows']} rows={spec.enums.scopes.map((s) => [`\`${s.scope}\``, s.description])} />
      </section>
      <section id="enum-mcc" className="dc-anchor pt-12 max-w-[920px]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h3 className="text-[1.25rem] font-semibold">MCC map</h3><p className="text-ink-2 mt-1.5 text-[14px]">How a Merchant Category Code maps to our taxonomy when the merchant isn’t in the catalog.</p></div>
          <input value={mccQ} onChange={(e) => setMccQ(e.target.value)} placeholder="Filter: 5814, food…" aria-label="Filter MCC codes" className="h-9 w-full sm:w-56 rounded-lg bg-white/[.04] border border-white/[.08] px-3 text-[13px] outline-none focus:border-white/20" />
        </div>
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
          {mcc.map((m) => (
            <div key={m.mcc} className="flex items-center gap-2.5 rounded-lg px-3 py-2 bg-white/[.02] border border-white/[.05] min-w-0">
              <span className="dc-mono text-[12.5px] text-[var(--gold)]">{m.mcc}</span>
              <span className="text-[12px] text-ink-2 truncate">{m.category} · {m.sub}</span>
            </div>
          ))}
          {!mcc.length && <p className="text-ink-3 text-[13px] col-span-full">No codes match.</p>}
        </div>
      </section>
    </>
  );
}

// ── Search (⌘K) ──────────────────────────────────────────────────────────────
function Search({ spec, onClose, onGo }) {
  const [term, setTerm] = useState('');
  const [sel, setSel] = useState(0);
  const listRef = useRef(null);
  const all = useMemo(() => [
    ...spec.guides.map((g) => ({ id: g.id, kind: 'Guide', label: g.title, hay: `${g.title} ${(g.body || []).join(' ')}` })),
    ...spec.endpoints.map((e) => ({ id: e.id, kind: 'Endpoint', method: e.method, label: e.title, sub: e.path, hay: `${e.title} ${e.path} ${e.method} ${e.group} ${e.scope || ''}` })),
    ...Object.entries(spec.schemas).map(([n, s]) => ({ id: n, kind: 'Schema', label: n, sub: s.description, hay: `${n} ${s.fields.map((f) => f.name).join(' ')}` })),
    ...ENUM_SECTIONS.map(([id, l]) => ({ id, kind: 'Enum', label: l, hay: l })),
  ], [spec]);
  const results = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return all.filter((x) => x.kind !== 'Schema').slice(0, 12);
    const words = t.split(/\s+/);
    return all.map((x) => {
      const h = x.hay.toLowerCase(), l = x.label.toLowerCase();
      if (!words.every((w) => h.includes(w))) return null;
      return { x, score: (l.startsWith(t) ? 3 : 0) + (l.includes(t) ? 2 : 0) + (x.kind === 'Endpoint' ? 1 : 0) };
    }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 14).map((r) => r.x);
  }, [term, all]);
  useEffect(() => setSel(0), [term]);
  useEffect(() => { listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }); }, [sel]);
  const onKey = (e) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === 'Enter' && results[sel]) onGo(results[sel].id);
  };
  return (
    <motion.div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div role="dialog" aria-modal="true" aria-label="Search documentation" className="relative w-full max-w-[600px] rounded-2xl bg-[#0c0c0d] border border-white/[.1] shadow-[0_40px_120px_-20px_rgba(0,0,0,.9)] overflow-hidden"
        initial={{ y: -8, scale: 0.98 }} animate={{ y: 0, scale: 1 }} exit={{ y: -8, scale: 0.98 }} transition={{ duration: 0.16 }}>
        <div className="flex items-center gap-3 px-4 h-14 border-b border-white/[.07]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-ink-3"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input autoFocus value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={onKey} placeholder="Search endpoints, schemas, guides…" aria-label="Search" aria-controls="docs-search-results" aria-activedescendant={results[sel] ? `ds-${results[sel].id}` : undefined}
            className="flex-1 bg-transparent outline-none text-[15px] placeholder:text-ink-3" />
          <kbd className="dc-mono text-[10.5px] px-1.5 py-0.5 rounded border border-white/[.1] text-ink-3">esc</kbd>
        </div>
        <ul id="docs-search-results" ref={listRef} role="listbox" className="max-h-[52vh] overflow-y-auto dc-scroll p-2">
          {results.map((r, i) => (
            <li key={`${r.kind}-${r.id}`} id={`ds-${r.id}`} role="option" aria-selected={i === sel}>
              <button type="button" onMouseEnter={() => setSel(i)} onClick={() => onGo(r.id)} className={`w-full text-left flex items-center gap-3 rounded-lg px-3 py-2.5 ${i === sel ? 'bg-white/[.07]' : ''}`}>
                {r.method ? <MethodBadge method={r.method} /> : <span className="dc-mono text-[9.5px] uppercase tracking-wider text-ink-3 w-[38px] text-center shrink-0">{r.kind.slice(0, 6)}</span>}
                <span className="min-w-0 flex-1"><span className="block text-[14px] truncate">{r.label}</span>{r.sub && <span className={`block text-[12px] text-ink-3 truncate ${r.kind === 'Endpoint' ? 'dc-mono' : ''}`}>{r.sub}</span>}</span>
                {i === sel && <span className="text-[11px] text-ink-3 shrink-0">↵</span>}
              </button>
            </li>
          ))}
          {!results.length && <li className="px-3 py-8 text-center text-ink-3 text-[14px]">No results for “{term}”.</li>}
        </ul>
      </motion.div>
    </motion.div>
  );
}

/** Docs-only styles (scoped under .docs). */
function DocsStyles() {
  return (
    <style>{`
      .docs { --dc-key:#a1a1a6; --dc-str:#d9c690; --dc-num:#6fd3a0; --dc-bool:#f0a35e; --dc-null:#8e8e93; --dc-punc:#5d5d63; --dc-kw:#e8e3d8; --dc-com:#5d5d63; }
      .docs .dc-mono, .docs code, .docs pre, .docs kbd { font-family: 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace; font-feature-settings: 'liga' 0; letter-spacing: 0; }
      .docs .dc-anchor { scroll-margin-top: 76px; }
      .docs .dc-eyebrow { font-family: 'Geist Mono', ui-monospace, monospace; font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: var(--gold); }
      .docs .dc-subhead { font-size: 11.5px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-3); margin: 2rem 0 .6rem; }
      .docs .dc-inline { font-size: .86em; padding: .12em .42em; border-radius: 6px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.06); color: var(--ink); white-space: normal; overflow-wrap: anywhere; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
      .docs .dc-code { border-radius: 14px; background: #08080a; border: 1px solid rgba(255,255,255,.08); overflow: hidden; box-shadow: 0 20px 60px -30px rgba(0,0,0,.9); }
      .docs .dc-pre { margin: 0; padding: 14px 16px; overflow: auto; font-size: 12.5px; line-height: 1.7; color: #d4d4d8; tab-size: 2; }
      .docs .dc-pre::-webkit-scrollbar { width: 8px; height: 8px; } .docs .dc-pre::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); border-radius: 99px; }
      .docs .dc-scroll { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,.12) transparent; }
      .docs .dc-table-wrap { overflow-x: auto; border-radius: 12px; border: 1px solid rgba(255,255,255,.07); }
      .docs .dc-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
      .docs .dc-table th { text-align: left; font-weight: 600; font-size: 11.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); background: rgba(255,255,255,.025); padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,.07); white-space: nowrap; }
      .docs .dc-table td { padding: 11px 14px; border-bottom: 1px solid rgba(255,255,255,.05); color: var(--ink-2); vertical-align: top; }
      .docs .dc-table tr:last-child td { border-bottom: 0; }
    `}</style>
  );
}
