#!/usr/bin/env node
// 假 herdr socket：NDJSON，只回應 events.subscribe（回 subscription_started）。
// 監看 FAKE_HERDR_SNAPSHOT 檔，內容一變就對所有訂閱者推每個 pane 的 pane_updated。
// 啟動時把 FAKE_HERDR_SEED 複製成執行期快照；其他 method 一律回 error 並記進 FAKE_HERDR_LOG。
// 它是第一個啟動、最後一個被關的 webServer：收到 SIGTERM 時 dashboard server 已經退出，順手刪掉 FAKE_HERDR_CLEANUP_DIR
// （globalTeardown 跑在 webServer 關掉之前，server 關機途中若又寫了東西，這裡補刪）。
import { appendFileSync, copyFileSync, mkdirSync, readFileSync, rmSync, watchFile } from 'node:fs'
import { createServer } from 'node:net'
import { dirname } from 'node:path'

const snapshotFile = process.env.FAKE_HERDR_SNAPSHOT
const socketFile = process.env.DASH_HERDR_SOCKET
const log = (s) => process.env.FAKE_HERDR_LOG && appendFileSync(process.env.FAKE_HERDR_LOG, `${Date.now()} socket ${s}\n`)
const seedFile = process.env.FAKE_HERDR_SEED
if (!snapshotFile || !socketFile || !seedFile) throw new Error('需要 FAKE_HERDR_SNAPSHOT、FAKE_HERDR_SEED 與 DASH_HERDR_SOCKET')

mkdirSync(dirname(snapshotFile), { recursive: true })
copyFileSync(seedFile, snapshotFile)
rmSync(socketFile, { force: true })

const subscribers = new Set()
const server = createServer((sock) => {
  let buf = ''
  sock.setEncoding('utf8')
  sock.on('data', (chunk) => {
    buf += chunk
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i)
      buf = buf.slice(i + 1)
      let msg
      try { msg = JSON.parse(line) } catch { continue }
      log(msg.method)
      if (msg.method === 'events.subscribe') {
        subscribers.add(sock)
        sock.write(JSON.stringify({ id: msg.id, result: { type: 'subscription_started' } }) + '\n')
      } else {
        sock.write(JSON.stringify({ id: msg.id, error: { code: 'unsupported', message: `fake herdr: ${msg.method}` } }) + '\n')
      }
    }
  })
  const drop = () => subscribers.delete(sock)
  sock.on('close', drop)
  sock.on('error', drop)
})

watchFile(snapshotFile, { interval: 100 }, () => {
  let snap
  try { snap = JSON.parse(readFileSync(snapshotFile, 'utf8')) } catch { return }
  for (const pane of snap.panes ?? snap.agents ?? []) {
    const line = JSON.stringify({ event: 'pane_updated', data: { type: 'pane_updated', pane } }) + '\n'
    for (const s of subscribers) s.write(line)
  }
})

server.listen(socketFile, () => process.stdout.write(`fake herdr socket listening on ${socketFile}\n`))
const stop = () => {
  server.close()
  rmSync(socketFile, { force: true })
  if (process.env.FAKE_HERDR_CLEANUP_DIR) rmSync(process.env.FAKE_HERDR_CLEANUP_DIR, { recursive: true, force: true })
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
