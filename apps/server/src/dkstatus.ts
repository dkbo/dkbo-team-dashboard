// 以子行程跑 dk-status --json 並驗 schema。不自寫 dkbo markdown 解析器。
import { spawn, type ChildProcess } from 'node:child_process';
import { DK_STATUS_SCHEMA_VERSION, type DetailDoc, type ListDoc, type ProjectError, type ProjectErrorKind } from '@dash/shared';

export const DEFAULT_DK_TIMEOUT_MS = 10_000;

const PANE_VARS = new Set(['HERDR_PANE_ID', 'HERDR_TAB_ID', 'HERDR_WORKSPACE_ID']);

/**
 * 子行程環境：拿掉所有 DK_* 與 herdr pane 變數，再明確設 DK_ROOT／DK_PROJECT_ROOT。
 * lib/common.sh 以環境的 DK_ROOT 優先 —— 不這樣做，dkbo pane 裡起的 server 會讓每個專案都讀到同一份 .dkbo。
 */
export function childEnv(base: NodeJS.ProcessEnv, dkRoot: string, projectRoot: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(base)) {
    if (k.startsWith('DK_') || PANE_VARS.has(k)) continue;
    env[k] = v;
  }
  env.DK_ROOT = dkRoot;
  env.DK_PROJECT_ROOT = projectRoot;
  return env;
}

const fail = (kind: ProjectErrorKind, message?: string): { ok: false; error: ProjectError } => ({
  ok: false,
  error: { kind, message: message || kind },
});

export type ParseResult<T> = { ok: true; doc: T } | { ok: false; error: ProjectError };

export function parseDoc(stdout: string, mode: 'list'): ParseResult<ListDoc>;
export function parseDoc(stdout: string, mode: 'detail'): ParseResult<DetailDoc>;
export function parseDoc(stdout: string, mode: 'list' | 'detail'): ParseResult<ListDoc | DetailDoc> {
  let j: unknown;
  try {
    j = JSON.parse(stdout);
  } catch {
    return fail('json');
  }
  if (typeof j !== 'object' || j === null || Array.isArray(j)) return fail('json');
  const o = j as Record<string, unknown>;
  if (o.schema_version !== DK_STATUS_SCHEMA_VERSION) return fail('schema');
  if (mode === 'list' ? !Array.isArray(o.tasks) : typeof o.task !== 'object' || o.task === null) return fail('schema');
  return { ok: true, doc: o as unknown as ListDoc | DetailDoc };
}

export interface RunOpts {
  bin: string;
  dkRoot: string;
  projectRoot: string;
  args: string[];
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  /** 登記在途子行程，關機時收掉；關閉後不再 spawn */
  tracker?: ChildTracker;
}

const killGroup = (child: ChildProcess, sig: NodeJS.Signals) => {
  try {
    if (child.pid) process.kill(-child.pid, sig);
  } catch {
    child.kill(sig);
  }
};

export const SHUTDOWN_GRACE_MS = 2000;

/** 在途 dk-status 子行程（每個都是自己行程群組的組長）。一個 server 一份 */
export class ChildTracker {
  private readonly live = new Map<ChildProcess, Promise<void>>();
  private closed = false;

  get isClosed(): boolean {
    return this.closed;
  }

  add(child: ChildProcess): void {
    const gone = new Promise<void>((r) => {
      child.once('close', () => r());
      child.once('error', () => r());
    }).then(() => void this.live.delete(child));
    this.live.set(child, gone);
  }

  /** 停止接新子行程；對每個行程群組送 SIGTERM，graceMs 內沒結束的改 SIGKILL，全部結束才 resolve */
  async terminate(graceMs = SHUTDOWN_GRACE_MS): Promise<void> {
    this.closed = true;
    const all = [...this.live];
    if (all.length === 0) return;
    for (const [c] of all) killGroup(c, 'SIGTERM');
    let timer: NodeJS.Timeout | undefined;
    const graceful = Promise.all(all.map(([, p]) => p)).then(() => true);
    const late = new Promise<false>((r) => (timer = setTimeout(() => r(false), graceMs)));
    const ok = await Promise.race([graceful, late]);
    clearTimeout(timer);
    if (ok) return;
    for (const [c] of this.live) killGroup(c, 'SIGKILL');
    await Promise.all(this.live.values());
  }

  /** 同步版（stop()／exit handler 用）：不等，直接 SIGKILL */
  killSync(): void {
    this.closed = true;
    for (const c of this.live.keys()) killGroup(c, 'SIGKILL');
  }
}

export type RunResult =
  | { ok: true; stdout: string }
  | { ok: false; error: ProjectError; code?: number | null };

const firstLine = (s: string) => s.split('\n').map((l) => l.trim()).find((l) => l !== '') ?? '';

/** 跑一次 dk-status；逾時 SIGKILL 整個行程群組（jq／awk 子行程一起收掉） */
export function runRaw(opts: RunOpts): Promise<RunResult> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (r: RunResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(r);
    };
    if (opts.tracker?.isClosed) return resolve(fail('exit', 'shutting down'));
    const child = spawn(opts.bin, opts.args, {
      env: childEnv(opts.env ?? process.env, opts.dkRoot, opts.projectRoot),
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    opts.tracker?.add(child);
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on('data', (b: Buffer) => out.push(b));
    child.stderr.on('data', (b: Buffer) => err.push(b));
    const timer = setTimeout(() => {
      killGroup(child, 'SIGKILL');
      finish(fail('timeout'));
    }, opts.timeoutMs ?? DEFAULT_DK_TIMEOUT_MS);
    child.on('error', (e) => finish({ ...fail('exit', e.message), code: null }));
    child.on('close', (code) => {
      const stderr = Buffer.concat(err).toString('utf8');
      if (code !== 0) finish({ ...fail('exit', firstLine(stderr)), code });
      else finish({ ok: true, stdout: Buffer.concat(out).toString('utf8') });
    });
  });
}

export type DkResult<T> = { ok: true; doc: T; stdout: string } | { ok: false; error: ProjectError; code?: number | null };

export async function runDkStatus(opts: RunOpts & { args: ['--json'] }): Promise<DkResult<ListDoc>>;
export async function runDkStatus(opts: RunOpts): Promise<DkResult<ListDoc | DetailDoc>>;
export async function runDkStatus(opts: RunOpts): Promise<DkResult<ListDoc | DetailDoc>> {
  const r = await runRaw(opts);
  if (!r.ok) return r;
  const p = opts.args.length > 1 ? parseDoc(r.stdout, 'detail') : parseDoc(r.stdout, 'list');
  return p.ok ? { ok: true, doc: p.doc, stdout: r.stdout } : p;
}
