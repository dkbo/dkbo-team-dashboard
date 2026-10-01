import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const REPO_ROOT = resolve(import.meta.dirname, '../../..');
export const VENDOR_DIR = join(REPO_ROOT, 'vendor/dkbo-status');

export function tmp(prefix = 'dash-test-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function script(path: string, body: string): string {
  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(path, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

/** 在 root 建一個最小 dkbo 專案：tasks/<dir>/process.md 各一行 task-new */
export function miniProject(root: string, opts: { version?: string; native?: boolean; tasks: string[]; sessions?: boolean }): string {
  const dk = join(root, '.dkbo');
  mkdirSync(join(dk, 'roles'), { recursive: true });
  mkdirSync(join(dk, 'kinds'), { recursive: true });
  if (opts.sessions) mkdirSync(join(dk, '.sessions'), { recursive: true });
  writeFileSync(join(dk, 'VERSION'), `${opts.version ?? '0.17.0'}\n`);
  for (const t of opts.tasks) {
    mkdirSync(join(dk, 'tasks', t), { recursive: true });
    writeFileSync(join(dk, 'tasks', t, 'process.md'), `2026-01-01T09:00 task-new ${t.slice(11)}\n`);
  }
  if (opts.native) {
    cpSync(join(VENDOR_DIR, 'bin'), join(dk, 'bin'), { recursive: true });
    cpSync(join(VENDOR_DIR, 'lib'), join(dk, 'lib'), { recursive: true });
  }
  return root;
}

export async function waitFor<T>(fn: () => T | undefined | false | null | Promise<T | undefined | false | null>, ms = 5000, step = 20): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, step));
  }
}

/**
 * 假原生專案：.dkbo/bin/dk-status 讀 $DK_ROOT/fake/ 下的檔回應，並把每次呼叫記進 calls.log。
 * fake/mode 可設 exit｜json｜schema｜hang；fake/sleep 設每次呼叫的秒數、fake/sleep-detail 只套在 detail 呼叫；list.json 內的 __NOW__ 會換成當下奈秒（模擬 generated_at 變動）。
 */
export function fakeProject(root: string, opts: { list?: unknown; details?: Record<string, unknown>; version?: string } = {}): string {
  const dk = join(root, '.dkbo');
  const fake = join(dk, 'fake');
  mkdirSync(fake, { recursive: true });
  writeFileSync(join(dk, 'VERSION'), `${opts.version ?? '0.17.0'}\n`);
  if (opts.list) writeFileSync(join(fake, 'list.json'), JSON.stringify(opts.list));
  for (const [dir, d] of Object.entries(opts.details ?? {})) writeFileSync(join(fake, `detail-${dir}.json`), JSON.stringify(d));
  script(
    join(dk, 'bin/dk-status'),
    `F="$DK_ROOT/fake"
echo "start $$ \${2:-list} $(date +%s%N)" >> "$F/calls.log"
[ -f "$F/sleep" ] && sleep "$(cat "$F/sleep")"
[ -n "\${2:-}" ] && [ -f "$F/sleep-detail" ] && sleep "$(cat "$F/sleep-detail")"
mode=$(cat "$F/mode" 2>/dev/null || true)
finish() { echo "end $$ $(date +%s%N)" >> "$F/calls.log"; }
case "$mode" in
  exit) echo "dk: boom happened" >&2; echo "second line" >&2; finish; exit 3;;
  json) echo '{not json'; finish; exit 0;;
  schema) echo '{"schema_version":2,"tasks":[]}'; finish; exit 0;;
  hang) sleep 30;;
esac
if [ -n "\${2:-}" ]; then
  f="$F/detail-$2.json"
  [ -f "$f" ] || { echo "dk: no task '$2'" >&2; finish; exit 1; }
  sed "s/__NOW__/$(date +%s%N)/" "$f"
else
  sed "s/__NOW__/$(date +%s%N)/" "$F/list.json"
fi
finish`,
  );
  return root;
}

export function setFake(root: string, file: 'mode' | 'sleep' | 'sleep-detail' | 'list.json' | `detail-${string}.json`, content: string | null): void {
  const p = join(root, '.dkbo/fake', file);
  if (content === null) rmSync(p, { force: true });
  else writeFileSync(p, content);
}

export function calls(root: string): string[] {
  const p = join(root, '.dkbo/fake/calls.log');
  return existsSync(p) ? readFileSync(p, 'utf8').trim().split('\n').filter(Boolean) : [];
}
