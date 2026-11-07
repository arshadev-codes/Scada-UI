import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Root-relative alias: keeps one module ID per file (an absolute Windows
    // path here makes Vite serve some modules twice, via /@fs/ and /src/).
    alias: { '@': '/src' },
  },
  server: {
    port: 5173,
    open: true,
    // Modbus-TCP bridge for /plc-test (server/modbus-bridge.mjs)
    proxy: { '/api': 'http://127.0.0.1:8502' },
  },
});
