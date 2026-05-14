import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['ccxt'], // Exclude CCXT from optimization (causes issues in browser)
  },
  define: {
    // Stub Node.js globals
    global: 'globalThis',
  },
  resolve: {
    alias: {
      // Stub Node.js modules that don't work in browser
      'http-proxy-agent': path.resolve(__dirname, 'src/stubs/empty.ts'),
      'https-proxy-agent': path.resolve(__dirname, 'src/stubs/empty.ts'),
      'socks-proxy-agent': path.resolve(__dirname, 'src/stubs/empty.ts'),
    }
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    }
  }
})
