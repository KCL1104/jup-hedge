import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // Required for Solana web3.js and Drift SDK
      include: ['buffer', 'crypto', 'stream', 'util', 'events', 'process', 'vm', 'path', 'os', 'fs'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  define: {
    'process.env': {},
  },
  resolve: {
    alias: {
      // Ensure Buffer is available
      buffer: 'buffer',
    },
  },
  optimizeDeps: {
    include: ['buffer'],
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  build: {
    rollupOptions: {
      // External dependencies that shouldn't be bundled
      external: [],
    },
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
});
