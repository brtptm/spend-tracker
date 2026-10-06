// Load the repo-root .env before anything reads process.env (imported first by index.js).
// Existing environment variables always win; a missing file is fine.
import { fileURLToPath } from 'node:url';
try { process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url))); } catch { /* no .env */ }
