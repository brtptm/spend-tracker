import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5273, proxy: { '/api': 'http://localhost:4400' } },
  build: { chunkSizeWarningLimit: 1200 },
});
