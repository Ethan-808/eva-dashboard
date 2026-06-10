import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react()],
    appType: 'spa',
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: false,
      proxy: {
        '/api/claude': {
          target: 'https://api.anthropic.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/claude/, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              const key = env.VITE_CLAUDE_API_KEY
              if (key) proxyReq.setHeader('x-api-key', key)
              proxyReq.setHeader('anthropic-version', '2023-06-01')
              // Remove browser-origin headers so Anthropic sees a server-side request
              proxyReq.removeHeader('origin')
              proxyReq.removeHeader('anthropic-dangerous-direct-browser-access')
            })
          },
        },
        '/api/news': {
          target: 'https://newsapi.org',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/news/, ''),
        },
        '/api/weather': {
          target: 'https://api.openweathermap.org',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/weather/, ''),
        },
        '/api/finnhub': {
          target: 'https://finnhub.io',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/finnhub/, ''),
        },
        '/api/gcal': {
          target: 'https://www.googleapis.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/gcal/, ''),
        },
      },
    },
  }
})
