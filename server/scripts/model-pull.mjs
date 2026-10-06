// Download the in-process fallback model once (≈1.1 GB) into server/data/models.
// Usage: pnpm --filter ./server model:pull   (override with SERVER_LLM_MODEL=hf:org/repo:QUANT)
import { resolveModelFile } from 'node-llama-cpp';
import { MODELS_DIR, MODEL_URI } from '../src/ai/serverModel.js';

const file = await resolveModelFile(MODEL_URI, { directory: MODELS_DIR });
console.log(`Ready: ${file}`);
