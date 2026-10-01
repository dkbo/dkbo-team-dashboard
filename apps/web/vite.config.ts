import path from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const apiPort = process.env.PORT ?? '4317'
const webPort = Number(process.env.WEB_PORT ?? 5173)

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  server: {
    port: webPort,
    strictPort: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
        // 上游串流（SSE）中途斷掉時 proxy 預設不結束下游回應，EventSource 會永遠以為還連著；這裡把斷線傳下去。
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes, _req, res) => {
            proxyRes.on('close', () => {
              if (!proxyRes.complete) res.destroy()
            })
          })
        },
      },
    },
  },
  test: { environment: 'jsdom', globals: false },
})
