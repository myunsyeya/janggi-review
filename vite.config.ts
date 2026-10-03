import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The engine runs with pthreads, which need SharedArrayBuffer (cross-origin isolation).
const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig({
  plugins: [react()],
  server: { headers: isolation },
  preview: { headers: isolation },
  optimizeDeps: { exclude: ['ffish-es6'] },
})
