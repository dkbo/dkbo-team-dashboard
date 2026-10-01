#!/usr/bin/env node
// 假 herdr：只實作 `api snapshot` 與 `pane read`，印出 FAKE_HERDR_SNAPSHOT（不存在時用 FAKE_HERDR_SEED）的內容。
// 其他子命令一律非零退出，任何寫入類呼叫都會在 FAKE_HERDR_LOG 留紀錄以便驗唯讀。
import { appendFileSync, existsSync, readFileSync } from 'node:fs'

const args = process.argv.slice(2)
if (process.env.FAKE_HERDR_LOG) appendFileSync(process.env.FAKE_HERDR_LOG, `${Date.now()} ${args.join(' ')}\n`)

if (args[0] === 'api' && args[1] === 'snapshot') {
  const file = process.env.FAKE_HERDR_SNAPSHOT && existsSync(process.env.FAKE_HERDR_SNAPSHOT) ? process.env.FAKE_HERDR_SNAPSHOT : process.env.FAKE_HERDR_SEED
  if (!file) throw new Error('需要 FAKE_HERDR_SNAPSHOT 或 FAKE_HERDR_SEED')
  const snapshot = JSON.parse(readFileSync(file, 'utf8'))
  process.stdout.write(JSON.stringify({ id: 'cli:api:snapshot', result: { snapshot } }) + '\n')
  process.exit(0)
}
if (args[0] === 'pane' && args[1] === 'read') {
  process.stdout.write(`\u001b[32mfake screen ${args[2]}\u001b[0m\r\nsecond line\r\n`)
  process.exit(0)
}
process.stderr.write(`fake-herdr: unsupported command: ${args.join(' ')}\n`)
process.exit(2)
