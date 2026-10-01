// `pnpm test` 的入口：vitest 在讀設定之前就在 $TMPDIR 放自己的模組快取且不清，
// 所以整個 vitest 跑在一個私有 TMPDIR 裡，結束後刪掉（debt AC14）。參數原樣轉給 vitest run。
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const bin = join(dirname(createRequire(import.meta.url).resolve('vitest/package.json')), 'vitest.mjs');
const dir = mkdtempSync(join(tmpdir(), 'dash-vitest-run-'));
const r = spawnSync(process.execPath, [bin, 'run', '--passWithNoTests', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, TMPDIR: dir },
});
rmSync(dir, { recursive: true, force: true });
process.exit(r.status ?? 1);
