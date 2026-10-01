// 整輪測試用一個私有暫存目錄：helper 的 tmp()、測試起的 server（overlay；tsx 已設 TSX_DISABLE_CACHE=1）、vitest 自己的快取都落在這裡，
// teardown 整個刪掉 —— 跑完 $TMPDIR 不留東西（debt AC14）。worker 與子行程都繼承 TMPDIR。
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default function setup(): () => void {
  const prev = process.env.TMPDIR;
  const dir = mkdtempSync(join(tmpdir(), 'dash-vitest-'));
  process.env.TMPDIR = dir;
  return () => {
    if (prev === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = prev;
    rmSync(dir, { recursive: true, force: true });
  };
}
