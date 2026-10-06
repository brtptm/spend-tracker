import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';
import { requireAuth, publicUser } from './lib/auth.js';
import { aiStatus } from './ai/index.js';
import { probeAgentSdk } from './ai/claude.js';
import { ensureDemoUsers } from './seed.js';
import auth from './routes/auth.js';
import spending from './routes/spending.js';
import analysis from './routes/analysis.js';
import recommendations from './routes/recommendations.js';
import ads from './routes/ads.js';
import paytm, { PARTNER_KEY, usingDemoKey } from './routes/paytm.js';
import budget from './routes/budget.js';
import alerts from './routes/alerts.js';
import exporter from './routes/export.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 4400);

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], fontSrc: ["'self'", 'https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:', 'blob:'], workerSrc: ["'self'", 'blob:'] } } }));
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',') || true }));
app.use(express.json({ limit: '6mb' }));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 1500, standardHeaders: 'draft-8', legacyHeaders: false }));
app.use(['/api/analysis/ask', '/api/spending/import'], rateLimit({ windowMs: 60 * 1000, limit: 20, message: { error: 'Too many requests. Wait a minute and try again.' } }));

app.get('/api/health', (_req, res) => res.json({ ok: true, ai: aiStatus() }));
app.get('/api/me', requireAuth, (req, res) => {
  const n = db.prepare('SELECT COUNT(*) n FROM transactions WHERE user_id = ?').get(req.user.id).n;
  res.json({ user: publicUser(req.user), hasData: n > 0, transactions: n });
});
app.use('/api/auth', auth);
app.use('/api/spending', spending);
app.use('/api/analysis', analysis);
app.use('/api/recommendations', recommendations);
app.use('/api/ads', ads);
app.use('/api/paytm', rateLimit({ windowMs: 60 * 1000, limit: 300 }), paytm);
app.use('/api/budget', budget);
app.use('/api/alerts', alerts);
app.use('/api', exporter);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));

const dist = path.resolve(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : err.type === 'entity.too.large' ? 413 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on our side. Try again in a moment.' : err.message });
});

await ensureDemoUsers();
const describe = (ai) => (ai.provider === 'api' ? `Claude API (${ai.model})` : ai.provider === 'agent-sdk' ? `Claude Agent SDK via local Claude Code login (${ai.model})` : 'built-in engine (set ANTHROPIC_API_KEY, or sign in to Claude Code, to enable Claude)');
app.listen(PORT, () => {
  console.log(`◎ Spend Tracker API on http://localhost:${PORT}`);
  console.log(`  AI: ${describe(aiStatus())}`);
  console.log(`  Partner API: ${!PARTNER_KEY ? 'disabled (set PAYTM_API_KEY)' : usingDemoKey ? 'demo key "demo-paytm-partner-key" (development only)' : 'key from PAYTM_API_KEY'}`);
});
if (aiStatus().provider === 'engine') probeAgentSdk().then((ai) => ai.enabled && console.log(`  AI: ${describe(ai)}`));
