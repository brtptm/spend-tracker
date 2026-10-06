import { Fragment, useState } from 'react';

/** Inline markdown-lite: **bold**, `code`. `{BASE}` → this origin. */
export function Md({ text, className = '' }) {
  const s = String(text ?? '').replaceAll('{BASE}', typeof window !== 'undefined' ? window.location.origin : '');
  const parts = s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return (
    <span className={className}>
      {parts.map((p, i) => p.startsWith('**') ? <strong key={i} className="text-ink font-semibold">{p.slice(2, -2)}</strong>
        : p.startsWith('`') ? <code key={i} className="dc-inline">{p.slice(1, -1)}</code>
        : <Fragment key={i}>{p}</Fragment>)}
    </span>
  );
}

export function CopyButton({ text, label = 'Copy', className = '' }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1400); } catch { /* clipboard blocked */ } }}
      className={`text-[11.5px] font-medium px-2 py-1 rounded-md text-ink-3 hover:text-ink hover:bg-white/[.06] transition-colors ${className}`} aria-label={done ? 'Copied' : label}>
      {done ? 'Copied' : label}
    </button>
  );
}

// ── Syntax highlighting (JSON, shell, JS, Python) — small and dependency-free ──
const C = { key: 'var(--dc-key)', str: 'var(--dc-str)', num: 'var(--dc-num)', bool: 'var(--dc-bool)', nul: 'var(--dc-null)', punc: 'var(--dc-punc)', kw: 'var(--dc-kw)', com: 'var(--dc-com)' };

export function highlightJson(src) {
  const out = [];
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}[\],]/g;
  let last = 0, m, i = 0;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push(src.slice(last, m.index));
    const t = m[0];
    let color = C.punc;
    if (m[1]) color = m[2] ? C.key : C.str;
    else if (m[3]) color = C.bool;
    else if (t === 'null') color = C.nul;
    else if (/^-?\d/.test(t)) color = C.num;
    if (m[1] && m[2]) { out.push(<span key={i++} style={{ color }}>{m[1]}</span>); out.push(<span key={i++} style={{ color: C.punc }}>{m[2]}</span>); }
    else out.push(<span key={i++} style={{ color }}>{t}</span>);
    last = re.lastIndex;
  }
  if (last < src.length) out.push(src.slice(last));
  return out;
}

export function highlightCode(src, lang) {
  if (lang === 'json') return highlightJson(src);
  const kw = lang === 'python' ? /\b(import|from|as|def|return|print|None|True|False)\b/ : lang === 'node' ? /\b(const|await|async|new|return|import|from)\b/ : /\b(curl)\b/;
  const re = new RegExp(`(#[^\\n]*|//[^\\n]*)|('(?:[^'\\\\]|\\\\.)*'|"(?:[^"\\\\]|\\\\.)*"|\`[^\`]*\`)|(\\s-[A-Za-z]\\b|\\s--[a-z-]+)|${kw.source}|\\b\\d+\\b`, 'g');
  const out = []; let last = 0, m, i = 0;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push(src.slice(last, m.index));
    const color = m[1] ? C.com : m[2] ? C.str : m[3] ? C.key : /^\d/.test(m[0]) ? C.num : C.kw;
    out.push(<span key={i++} style={{ color }}>{m[0]}</span>);
    last = re.lastIndex;
  }
  if (last < src.length) out.push(src.slice(last));
  return out;
}

export function CodeBlock({ code, lang = 'json', title, actions, maxH = 520, className = '' }) {
  return (
    <div className={`dc-code ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2 px-3.5 h-10 border-b border-white/[.07]">
          <div className="flex items-center gap-1 min-w-0">{title}</div>
          <div className="flex items-center gap-1 shrink-0">{actions}<CopyButton text={code} /></div>
        </div>
      )}
      <pre className="dc-pre" style={{ maxHeight: maxH }}><code>{highlightCode(code, lang)}</code></pre>
    </div>
  );
}

// ── Request snippets ─────────────────────────────────────────────────────────
const QUERY_PRESET = { 'get-summary': 'period=month', 'get-categories': 'period=3m', 'get-merchants': 'period=3m&limit=10', 'get-report': 'month=2026-09', 'list-transactions': 'limit=50', 'list-ingest-logs': 'limit=20', 'get-offers': 'limit=5' };

export function exampleUrl(ep, origin) {
  let p = ep.path;
  for (const f of ep.params || []) p = p.replace(`{${f.name}}`, f.example ?? `{${f.name}}`);
  if (ep.id === 'get-ingest-log') p = p.replace('ing_…', ep.response?.id || 'ing_7Hq2kR9xV3mN1pL4sT');
  const q = QUERY_PRESET[ep.id];
  return `${origin}${p}${q ? `?${q}` : ''}`;
}

export function snippets(ep, origin) {
  const url = exampleUrl(ep, origin);
  const body = ep.bodyExample ? JSON.stringify(ep.bodyExample, null, 2) : null;
  const extra = (ep.headers || []).map((h) => [h.name, h.example || '…']);
  const curl = [
    `curl${ep.method === 'GET' ? '' : ` -X ${ep.method}`} "${url}"`,
    `  -H "Authorization: Bearer $STK_KEY"`,
    ...(body ? ['  -H "Content-Type: application/json"'] : []),
    ...extra.map(([k, v]) => `  -H "${k}: ${v}"`),
    ...(body ? [`  -d '${body.replace(/'/g, "'\\''").replace(/\n/g, '\n  ')}'`] : []),
  ].join(' \\\n');
  const headersJs = [`    Authorization: \`Bearer \${process.env.STK_KEY}\`,`, ...(body ? ["    'Content-Type': 'application/json',"] : []), ...extra.map(([k, v]) => `    '${k}': '${v}',`)].join('\n');
  const node = `const res = await fetch('${url}', {\n  method: '${ep.method}',\n  headers: {\n${headersJs}\n  },${body ? `\n  body: JSON.stringify(${body.replace(/\n/g, '\n  ')}),` : ''}\n});\nconst data = await res.json();\nconsole.log(res.status, data);`;
  const pyBody = body ? body.replace(/\btrue\b/g, 'True').replace(/\bfalse\b/g, 'False').replace(/\bnull\b/g, 'None') : null;
  const python = `import os, requests\n\nres = requests.${ep.method.toLowerCase()}(\n    "${url}",\n    headers={"Authorization": f"Bearer {os.environ['STK_KEY']}"${extra.map(([k, v]) => `, "${k}": "${v}"`).join('')}},${pyBody ? `\n    json=${pyBody.replace(/\n/g, '\n    ')},` : ''}\n    timeout=10,\n)\nprint(res.status_code, res.json())`;
  return { curl, node, python };
}
