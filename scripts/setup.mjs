// One-command setup: `pnpm run setup` (note: plain `pnpm setup` is a built-in pnpm command).
// Safe to re-run — every step skips work that is already done.
//   --skip-model   don't download the server model (≈1.1 GB)
//   --skip-build   don't build the client
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const ok = (m) => console.log(`\x1b[32m✓\x1b[0m ${m}`);
const step = (m) => console.log(`\n\x1b[1m→ ${m}\x1b[0m`);
const run = (cmd, cmdArgs) => {
  const r = spawnSync(cmd, cmdArgs, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) { console.error(`\n✗ Failed: ${cmd} ${cmdArgs.join(' ')}`); process.exit(r.status || 1); }
};

step('Checking Node.js');
const major = Number(process.versions.node.split('.')[0]);
if (major < 24) { console.error(`✗ Node ${process.versions.node} found — Spend Tracker needs Node 24+ (see .nvmrc).`); process.exit(1); }
ok(`Node ${process.versions.node}`);

step('Installing dependencies');
run('pnpm', ['install']);
ok('Dependencies installed');

step('Environment file');
const env = path.join(root, '.env');
if (fs.existsSync(env)) ok('.env already exists — left unchanged');
else { fs.copyFileSync(path.join(root, '.env.example'), env); ok('Created .env from .env.example (demo sign-in codes and portal demo login enabled)'); }

step('Server AI model (offline fallback when Claude is unavailable)');
if (args.has('--skip-model') || process.env.SERVER_LLM === 'off') ok('Skipped (--skip-model)');
else { run('pnpm', ['--filter', './server', 'model:pull']); ok('Model ready in server/data/models'); }

step('Building the app');
if (args.has('--skip-build')) ok('Skipped (--skip-build)');
else { run('pnpm', ['--filter', './client', 'build']); ok('Built client/dist (served by `pnpm start`)'); }

console.log(`
\x1b[1mAll set.\x1b[0m
  pnpm dev     → app http://localhost:7100 · API http://localhost:7101
  pnpm start   → everything on http://localhost:7101 (production build)

  Demo: phone 98765 00001 (code shown on screen) · Portal: /portal → "Use demo account" · Docs: /docs
`);
