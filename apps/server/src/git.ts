// GitReader：/git 頁用的唯讀 git 讀取層。
// 只准白名單內的指令（gitArgs）：status、worktree list、log、show 單一 commit 的 metadata、diff-tree 的檔案清單與單檔 patch（不跑外部 diff／textconv）。
// 一律帶 --no-optional-locks（status 不刷新 index、不建 index.lock）並關掉 fsmonitor 與 pager／color，
// 不 fetch、不 checkout、不寫任何 ref；HTTP 層只有 GET。
import { execFile } from 'node:child_process';
import { stat } from 'node:fs/promises';
import {
  GIT_LOG_DEFAULT,
  GIT_LOG_MAX,
  parsePatch,
  statusCounts,
  type GitCommit,
  type GitCommitDetail,
  type GitCommitFile,
  type GitError,
  type GitFileDiff,
  type GitRepoResponse,
  type GitStatus,
  type GitStatusFile,
  type GitSummary,
  type GitSummaryResponse,
  type GitWorktree,
} from '@dash/shared';
import type { ProjectConfig } from './config.ts';

export const DEFAULT_GIT_TIMEOUT_MS = 5_000;
const MAX_BUFFER = 32 * 1024 * 1024;

const HASH = /^[0-9a-f]{7,64}$/;
export const isCommitHash = (h: string): boolean => HASH.test(h);

/** 欄位分隔 0x1f；-z 讓 commit 之間以 NUL 分隔 */
const LOG_FORMAT = ['%H', '%P', '%an', '%ae', '%at', '%D', '%s'].join('%x1f');
const SHOW_FORMAT = ['%H', '%P', '%an', '%ae', '%at', '%D', '%s', '%cn', '%ct', '%b'].join('%x1f');

export type GitRead =
  | { op: 'status' }
  | { op: 'worktrees' }
  | { op: 'log'; limit: number }
  | { op: 'show'; hash: string }
  | { op: 'files'; hash: string; parent: string | null; numstat: boolean }
  | { op: 'diff'; hash: string; parent: string | null; paths: string[] };

/** diff 的路徑只放在 `--` 之後；另外擋 NUL、空字串與過長的值（實際上還要是該 commit 改到的檔，見 GitReader.diff） */
const isPathArg = (p: string) => p.length > 0 && p.length <= 4096 && !p.includes('\0');

/** 呼叫不在白名單內 */
export class BadGitRead extends Error {}

/** 唯讀白名單：只有這裡組得出 git 的參數 */
export function gitArgs(r: GitRead): string[] {
  const base = ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'color.ui=never', '-c', 'core.pager=cat'];
  switch (r.op) {
    case 'status':
      return [...base, 'status', '--porcelain=v2', '--branch', '-z'];
    case 'worktrees':
      return [...base, 'worktree', 'list', '--porcelain', '-z'];
    case 'log':
      if (!Number.isInteger(r.limit) || r.limit < 1 || r.limit > GIT_LOG_MAX + 1) throw new BadGitRead('git: 不允許的 limit');
      return [...base, 'log', '--exclude=refs/stash', '--all', '--topo-order', `--max-count=${r.limit}`, '-z', `--format=${LOG_FORMAT}`];
    case 'show':
      if (!isCommitHash(r.hash)) throw new BadGitRead('git: 不允許的 commit');
      return [...base, 'show', '-s', '-z', `--format=${SHOW_FORMAT}`, r.hash, '--'];
    case 'files': {
      if (!isCommitHash(r.hash) || (r.parent !== null && !isCommitHash(r.parent))) throw new BadGitRead('git: 不允許的 commit');
      const range = r.parent === null ? ['--root', r.hash] : [r.parent, r.hash];
      return [...base, 'diff-tree', '-r', '-M', '-z', '--no-commit-id', r.numstat ? '--numstat' : '--name-status', ...range, '--'];
    }
    case 'diff': {
      if (!isCommitHash(r.hash) || (r.parent !== null && !isCommitHash(r.parent))) throw new BadGitRead('git: 不允許的 commit');
      if (r.paths.length < 1 || r.paths.length > 2 || !r.paths.every(isPathArg)) throw new BadGitRead('git: 不允許的路徑');
      const range = r.parent === null ? ['--root', r.hash] : [r.parent, r.hash];
      // --no-ext-diff／--no-textconv：不執行 repo 設定的外部 diff 與 textconv 程式
      return [...base, 'diff-tree', '-r', '-M', '-p', '--no-commit-id', '--no-ext-diff', '--no-textconv', '-U3', ...range, '--', ...r.paths];
    }
    default:
      throw new BadGitRead('git: 不允許的呼叫');
  }
}

export class GitFailure extends Error {
  constructor(readonly error: GitError) {
    super(error.message);
  }
}

export class UnknownCommit extends Error {}

/** 檔案不在這個 commit 的改動清單裡 */
export class UnknownFile extends Error {}

const num = (s: string | undefined) => (s === undefined || !/^[+-]?\d+$/.test(s) ? null : Math.abs(Number(s)));

/** `git status --porcelain=v2 --branch -z` */
export function parseStatus(out: string): GitStatus {
  const s: GitStatus = { branch: null, head: null, upstream: null, ahead: null, behind: null, files: [] };
  const recs = out.split('\0');
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    if (!r) continue;
    if (r.startsWith('# ')) {
      const [, key, ...rest] = r.split(' ');
      const v = rest.join(' ');
      if (key === 'branch.oid') s.head = v === '(initial)' ? null : v;
      else if (key === 'branch.head') s.branch = v === '(detached)' ? null : v;
      else if (key === 'branch.upstream') s.upstream = v;
      else if (key === 'branch.ab') {
        s.ahead = num(rest[0]);
        s.behind = num(rest[1]);
      }
      continue;
    }
    const field = (n: number) => {
      // 前 n 個空白分隔欄位之後全是路徑（路徑可含空白）
      let at = 0;
      for (let k = 0; k < n; k++) at = r.indexOf(' ', at) + 1;
      return { head: r.slice(0, at - 1).split(' '), path: r.slice(at) };
    };
    if (r[0] === '1') {
      const { head, path } = field(8);
      s.files.push({ path, orig: null, x: head[1][0], y: head[1][1], conflict: false });
    } else if (r[0] === '2') {
      const { head, path } = field(9);
      s.files.push({ path, orig: recs[++i] ?? null, x: head[1][0], y: head[1][1], conflict: false });
    } else if (r[0] === 'u') {
      const { head, path } = field(10);
      s.files.push({ path, orig: null, x: head[1][0], y: head[1][1], conflict: true });
    } else if (r[0] === '?') {
      s.files.push({ path: r.slice(2), orig: null, x: '?', y: '?', conflict: false });
    }
  }
  return s;
}

/** `git worktree list --porcelain -z`；status 之後另外補 */
export function parseWorktrees(out: string): GitWorktree[] {
  const list: GitWorktree[] = [];
  let cur: GitWorktree | null = null;
  for (const r of out.split('\0')) {
    if (!r) {
      cur = null;
      continue;
    }
    const sp = r.indexOf(' ');
    const key = sp === -1 ? r : r.slice(0, sp);
    const v = sp === -1 ? '' : r.slice(sp + 1);
    if (key === 'worktree') {
      cur = { path: v, head: null, branch: null, detached: false, bare: false, locked: false, prunable: false, main: list.length === 0, status: null };
      list.push(cur);
    } else if (cur) {
      if (key === 'HEAD') cur.head = /^0+$/.test(v) ? null : v;
      else if (key === 'branch') cur.branch = v.replace(/^refs\/heads\//, '');
      else if (key === 'detached') cur.detached = true;
      else if (key === 'bare') cur.bare = true;
      else if (key === 'locked') cur.locked = true;
      else if (key === 'prunable') cur.prunable = true;
    }
  }
  return list;
}

const refsOf = (d: string) => (d ? d.split(', ').filter(Boolean) : []);

function commitOf(f: string[]): GitCommit {
  return {
    hash: f[0],
    parents: f[1] ? f[1].split(' ') : [],
    author: f[2] ?? '',
    email: f[3] ?? '',
    time: Number(f[4]) || 0,
    refs: refsOf(f[5] ?? ''),
    subject: f[6] ?? '',
  };
}

/** `git log -z --format=LOG_FORMAT` */
export function parseLog(out: string): GitCommit[] {
  return out
    .split('\0')
    .map((r) => r.replace(/^\n/, ''))
    .filter(Boolean)
    .map((r) => commitOf(r.split('\x1f')));
}

/** `git show -s -z --format=SHOW_FORMAT` */
export function parseShow(out: string): Omit<GitCommitDetail, 'files'> {
  const f = out.replace(/\0+$/, '').split('\x1f');
  return { ...commitOf(f), committer: f[7] ?? '', commitTime: Number(f[8]) || 0, body: (f.slice(9).join('\x1f') ?? '').trimEnd() };
}

/** `diff-tree -z --name-status` 與 `--numstat` 合併成檔案清單 */
export function parseCommitFiles(nameStatus: string, numstat: string): GitCommitFile[] {
  const files: GitCommitFile[] = [];
  const ns = nameStatus.split('\0');
  for (let i = 0; i < ns.length; i++) {
    const code = ns[i];
    if (!code) continue;
    const change = code[0];
    if (change === 'R' || change === 'C') {
      const orig = ns[++i];
      const path = ns[++i];
      files.push({ path, orig, change, additions: null, deletions: null });
    } else {
      files.push({ path: ns[++i], orig: null, change, additions: null, deletions: null });
    }
  }
  // numstat -z：一般檔「A\tD\tpath\0」；改名「A\tD\t\0orig\0path\0」
  const st = numstat.split('\0');
  const counts = new Map<string, [number | null, number | null]>();
  for (let i = 0; i < st.length; i++) {
    const r = st[i];
    if (!r) continue;
    const [a, d, p] = r.split('\t');
    const path = p === '' ? (i += 2, st[i]) : p;
    counts.set(path, [a === '-' ? null : Number(a), d === '-' ? null : Number(d)]);
  }
  for (const f of files) {
    const c = counts.get(f.path);
    if (c) [f.additions, f.deletions] = c;
  }
  return files;
}

export interface GitReaderOpts {
  projects: ProjectConfig[];
  bin?: string;
  timeoutMs?: number;
  now?: () => number;
}

/** 子行程環境：不讓 git 問帳密、不讀使用者的 pager，GIT_DIR 等變數也不從 server 繼承 */
function gitEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(base)) if (!k.startsWith('GIT_')) env[k] = v;
  env.GIT_TERMINAL_PROMPT = '0';
  env.GIT_OPTIONAL_LOCKS = '0';
  env.LC_ALL = 'C';
  return env;
}

export class GitReader {
  private readonly bin: string;
  private readonly timeoutMs: number;
  private readonly now: () => number;

  constructor(private readonly o: GitReaderOpts) {
    this.bin = o.bin ?? 'git';
    this.timeoutMs = o.timeoutMs ?? DEFAULT_GIT_TIMEOUT_MS;
    this.now = o.now ?? Date.now;
  }

  find(name: string): ProjectConfig | undefined {
    return this.o.projects.find((p) => p.name === name);
  }

  run(cwd: string, r: GitRead): Promise<string> {
    const args = gitArgs(r);
    return new Promise((resolve, reject) => {
      execFile(this.bin, args, { cwd, env: gitEnv(process.env), timeout: this.timeoutMs, maxBuffer: MAX_BUFFER, encoding: 'utf8' }, (err, stdout, stderr) => {
        if (!err) return resolve(stdout);
        const e = err as NodeJS.ErrnoException & { killed?: boolean };
        const first = String(stderr).trim().split('\n')[0] || e.message;
        if (e.killed) return reject(new GitFailure({ kind: 'timeout', message: `git ${r.op} 逾時` }));
        if (/not a git repository/i.test(first)) return reject(new GitFailure({ kind: 'not-git', message: '不是 git repo' }));
        reject(new GitFailure({ kind: 'exit', message: first }));
      });
    });
  }

  private async checkDir(p: ProjectConfig): Promise<void> {
    const s = await stat(p.path).catch(() => null);
    if (!s?.isDirectory()) throw new GitFailure({ kind: 'missing', message: '路徑不存在' });
  }

  private async worktrees(cwd: string): Promise<GitWorktree[]> {
    const list = parseWorktrees(await this.run(cwd, { op: 'worktrees' }));
    await Promise.all(
      list.map(async (w) => {
        if (w.bare || w.prunable) return;
        w.status = await this.run(w.path, { op: 'status' }).then(parseStatus, () => null);
      }),
    );
    return list;
  }

  async repo(name: string, limit = GIT_LOG_DEFAULT): Promise<GitRepoResponse> {
    const p = this.find(name);
    if (!p) throw new GitFailure({ kind: 'missing', message: 'unknown project' });
    await this.checkDir(p);
    const [status, worktrees, log] = await Promise.all([
      this.run(p.path, { op: 'status' }).then(parseStatus),
      this.worktrees(p.path),
      // 多抓一筆判斷有沒有截斷；空 repo（沒有任何 commit）log 會失敗，當成沒有歷史
      this.run(p.path, { op: 'log', limit: limit + 1 }).then(parseLog, (e) => {
        if (e instanceof GitFailure && e.error.kind === 'exit' && /does not have any commits|bad default revision/i.test(e.message)) return [];
        throw e;
      }),
    ]);
    return { project: name, path: p.path, status, worktrees, commits: log.slice(0, limit), truncated: log.length > limit, generatedAt: this.now() };
  }

  async summaries(): Promise<GitSummaryResponse> {
    const projects = await Promise.all(
      this.o.projects.map(async (p): Promise<GitSummary> => {
        const empty = { project: p.name, path: p.path, branch: null, ahead: null, behind: null, counts: null, worktrees: 0 };
        try {
          await this.checkDir(p);
          const [s, w] = await Promise.all([
            this.run(p.path, { op: 'status' }).then(parseStatus),
            this.run(p.path, { op: 'worktrees' }).then(parseWorktrees),
          ]);
          return { ...empty, error: null, branch: s.branch, ahead: s.ahead, behind: s.behind, counts: statusCounts(s), worktrees: w.length };
        } catch (e) {
          return { ...empty, error: e instanceof GitFailure ? e.error : { kind: 'exit', message: String(e) } };
        }
      }),
    );
    return { projects, generatedAt: this.now() };
  }

  async commit(name: string, hash: string): Promise<GitCommitDetail> {
    const p = this.find(name);
    if (!p) throw new GitFailure({ kind: 'missing', message: 'unknown project' });
    if (!isCommitHash(hash)) throw new BadGitRead('commit 只能是 7–64 碼小寫 hex');
    await this.checkDir(p);
    let meta: Omit<GitCommitDetail, 'files'>;
    try {
      meta = parseShow(await this.run(p.path, { op: 'show', hash }));
    } catch (e) {
      if (e instanceof GitFailure && e.error.kind === 'exit') throw new UnknownCommit(hash);
      throw e;
    }
    const parent = meta.parents[0] ?? null;
    const [ns, st] = await Promise.all([
      this.run(p.path, { op: 'files', hash: meta.hash, parent, numstat: false }),
      this.run(p.path, { op: 'files', hash: meta.hash, parent, numstat: true }),
    ]);
    return { ...meta, files: parseCommitFiles(ns, st) };
  }

  /** 單一檔案在某 commit 的 diff（對第一個 parent）；path 必須是這個 commit 改到的檔 */
  async diff(name: string, hash: string, path: string): Promise<GitFileDiff> {
    const p = this.find(name);
    if (!p) throw new GitFailure({ kind: 'missing', message: 'unknown project' });
    if (!isCommitHash(hash)) throw new BadGitRead('commit 只能是 7–64 碼小寫 hex');
    if (!isPathArg(path)) throw new BadGitRead('path 不合法');
    await this.checkDir(p);
    let meta: Omit<GitCommitDetail, 'files'>;
    try {
      meta = parseShow(await this.run(p.path, { op: 'show', hash }));
    } catch (e) {
      if (e instanceof GitFailure && e.error.kind === 'exit') throw new UnknownCommit(hash);
      throw e;
    }
    const parent = meta.parents[0] ?? null;
    const files = parseCommitFiles(await this.run(p.path, { op: 'files', hash: meta.hash, parent, numstat: false }), '');
    const f = files.find((x) => x.path === path);
    if (!f) throw new UnknownFile(path);
    // 改名要同時給新舊路徑，-M 才認得出是同一個檔
    const patch = await this.run(p.path, { op: 'diff', hash: meta.hash, parent, paths: f.orig ? [f.orig, f.path] : [f.path] });
    return { hash: meta.hash, path: f.path, orig: f.orig, change: f.change, ...parsePatch(patch) };
  }
}
