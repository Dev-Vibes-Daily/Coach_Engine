// vite.config.js — SHARED FOUNDATION
// Dev-server proxy: the app calls /api/anthropic, Vite forwards to
// api.anthropic.com and attaches the API key server-side, so the key
// never reaches the browser. (For production, put this behind your own
// serverless function / backend instead of the dev proxy.)

import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const key = env.VITE_ANTHROPIC_KEY || ''

  return {
    server: {
      proxy: {
        '/api/anthropic': {
          target: 'https://api.anthropic.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/anthropic/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('x-api-key', key)
              proxyReq.setHeader('anthropic-version', '2023-06-01')
              proxyReq.setHeader('anthropic-dangerous-direct-browser-access', 'true')
            })
          },
        },
      },
    },
  }
})
