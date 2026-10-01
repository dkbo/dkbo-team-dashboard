#!/usr/bin/env node
// 假 dk-status（原生模式專案的 .dkbo/bin/dk-status）：`--json` 印 $DK_ROOT/fake/list.json，
// `--json <任務>` 印 $DK_ROOT/fake/details/<任務>.json；找不到的任務跟真的一樣非零退出。資料由 e2e/fixtures/projects.ts 產生。
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const root = process.env.DK_ROOT
if (!root || args[0] !== '--json' || args.length > 2) {
  process.stderr.write('dk-status: 目前只支援 --json（用法：dk-status --json [<任務>]）\n')
  process.exit(2)
}
const file = args[1] === undefined ? join(root, 'fake/list.json') : join(root, 'fake/details', `${args[1]}.json`)
if (args[1] !== undefined && (!/^[\w-]+$/.test(args[1]) || !existsSync(file))) {
  process.stderr.write(`dk-status: no task '${args[1]}'\n`)
  process.exit(1)
}
process.stdout.write(readFileSync(file, 'utf8'))
