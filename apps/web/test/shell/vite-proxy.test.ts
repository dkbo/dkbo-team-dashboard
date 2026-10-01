// @vitest-environment node
/// <reference types="node" />
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createServer, type ViteDevServer } from 'vite'

let upstream: http.Server | null = null
let vite: ViteDevServer | null = null
const savedPort = process.env.PORT

afterEach(async () => {
  await vite?.close()
  upstream?.closeAllConnections()
  await new Promise((r) => (upstream ? upstream.close(r) : r(null)))
  vite = null
  upstream = null
  process.env.PORT = savedPort
})

describe('vite dev proxy', () => {
  it('上游 SSE 連線斷掉時，下游（瀏覽器端）連線也跟著結束', async () => {
    upstream = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write(': connected\n\n')
    })
    await new Promise<void>((r) => upstream!.listen(0, '127.0.0.1', r))
    process.env.PORT = String((upstream.address() as AddressInfo).port)

    vite = await createServer({
      configFile: path.resolve(import.meta.dirname, '../../vite.config.ts'),
      server: { port: 0, strictPort: false, hmr: false },
      logLevel: 'silent',
    })
    await vite.listen()
    const port = (vite.httpServer!.address() as AddressInfo).port

    const ended = new Promise<string>((resolve) => {
      http.get({ host: '127.0.0.1', port, path: '/api/stream' }, (res) => {
        res.once('data', () => upstream!.closeAllConnections())
        res.on('close', () => resolve('closed'))
        res.resume()
      })
    })
    const timeout = new Promise<string>((r) => setTimeout(() => r('hung'), 3000))
    expect(await Promise.race([ended, timeout])).toBe('closed')
  }, 15_000)
})
