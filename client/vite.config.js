import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Fixed ports (7000 itself is macOS AirPlay): app 7100, API 7101. strictPort fails loudly
// instead of silently moving to another port, so URLs never change.
const API = `http://localhost:${process.env.API_PORT || 7101}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 7100, strictPort: true, proxy: { '/api': API, '/v1': API } },
  preview: { port: 7100, strictPort: true, proxy: { '/api': API, '/v1': API } },
  build: { chunkSizeWarningLimit: 1200 },
});
