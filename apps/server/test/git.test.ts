import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { GitCommitDetail, GitFileDiff, GitRepoResponse, GitSummaryResponse } from '@dash/shared';
import { BadGitRead, gitArgs, GitReader, parseStatus, UnknownFile } from '../src/git.ts';
import { createDashServer, type DashServer } from '../src/server.ts';
import { script, tmp, VENDOR_DIR } from './helpers.ts';

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Tester',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 'Tester',
  GIT_COMMITTER_EMAIL: 't@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
};
const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8' }).trim();

/** main 兩個 commit、feature 分支一個 commit 後 merge 回來；tag v1；一個 worktree；工作樹留各種改動 */
function makeRepo(): { root: string; wt: string; hashes: Record<string, string> } {
  const root = tmp('dash-git-');
  git(root, 'init', '-q', '-b', 'main');
  writeFileSync(join(root, 'a.txt'), 'one\n');
  writeFileSync(join(root, 'old name.txt'), 'rename me\n'.repeat(20));
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'first', '-m', 'body line');
  const first = git(root, 'rev-parse', 'HEAD');
  git(root, 'tag', 'v1');
  git(root, 'checkout', '-q', '-b', 'feature');
  writeFileSync(join(root, 'f.txt'), 'feature\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'feature work');
  const feature = git(root, 'rev-parse', 'HEAD');
  git(root, 'checkout', '-q', 'main');
  git(root, 'mv', 'old name.txt', 'new name.txt');
  writeFileSync(join(root, 'a.txt'), 'one\ntwo\n');
  git(root, 'commit', '-q', '-am', 'second');
  const second = git(root, 'rev-parse', 'HEAD');
  git(root, 'merge', '-q', '--no-ff', '-m', 'merge feature', 'feature');
  const merge = git(root, 'rev-parse', 'HEAD');
  const wt = join(root, '.worktrees', 'w1');
  git(root, 'worktree', 'add', '-q', '-b', 'wt-branch', wt);
  writeFileSync(join(wt, 'wt.txt'), 'x\n');
  // 主工作樹：已暫存＋未暫存同檔、未追蹤含空白的路徑
  writeFileSync(join(root, '.gitignore'), '.worktrees/\n');
  writeFileSync(join(root, 'a.txt'), 'staged\n');
  git(root, 'add', 'a.txt');
  writeFileSync(join(root, 'a.txt'), 'staged then edited\n');
  writeFileSync(join(root, 'with space.txt'), 'u\n');
  return { root, wt, hashes: { first, feature, second, merge } };
}

describe('gitArgs 白名單', () => {
  it('每個指令都帶 --no-optional-locks 並關 fsmonitor；只有 status／worktree／log／show／diff-tree', () => {
    const reads = [
      gitArgs({ op: 'status' }),
      gitArgs({ op: 'worktrees' }),
      gitArgs({ op: 'log', limit: 5 }),
      gitArgs({ op: 'show', hash: 'abcdef1' }),
      gitArgs({ op: 'files', hash: 'abcdef1', parent: null, numstat: true }),
      gitArgs({ op: 'diff', hash: 'abcdef1', parent: null, paths: ['a'] }),
    ];
    for (const a of reads) {
      expect(a.slice(0, 3)).toEqual(['--no-optional-locks', '-c', 'core.fsmonitor=false']);
      expect(['status', 'worktree', 'log', 'show', 'diff-tree']).toContain(a[7]);
    }
  });

  it('擋掉非 hex 的 commit 與越界的 limit', () => {
    expect(() => gitArgs({ op: 'show', hash: '--output=/tmp/x' })).toThrow(BadGitRead);
    expect(() => gitArgs({ op: 'show', hash: 'HEAD' })).toThrow(BadGitRead);
    expect(() => gitArgs({ op: 'files', hash: 'abcdef1', parent: 'x; rm', numstat: false })).toThrow(BadGitRead);
    expect(() => gitArgs({ op: 'log', limit: 0 })).toThrow(BadGitRead);
    expect(() => gitArgs({ op: 'log', limit: 1e6 })).toThrow(BadGitRead);
    expect(() => gitArgs({ op: 'push' } as never)).toThrow(BadGitRead);
    expect(() => gitArgs({ op: 'diff', hash: 'abcdef1', parent: null, paths: [] })).toThrow(BadGitRead);
    expect(() => gitArgs({ op: 'diff', hash: 'abcdef1', parent: null, paths: ['a\0b'] })).toThrow(BadGitRead);
    // 路徑一律在 -- 之後，就算長得像選項也只會被當成 pathspec
    const a = gitArgs({ op: 'diff', hash: 'abcdef1', parent: null, paths: ['--output=/tmp/x'] });
    expect(a.indexOf('--')).toBe(a.length - 2);
    expect(a).toEqual(expect.arrayContaining(['--no-ext-diff', '--no-textconv']));
  });
});

describe('parseStatus', () => {
  it('讀 branch 標頭、一般／改名／衝突／未追蹤列，路徑可含空白', () => {
    const out = [
      '# branch.oid 1111111111111111111111111111111111111111',
      '# branch.head main',
      '# branch.upstream origin/main',
      '# branch.ab +2 -3',
      '1 MM N... 100644 100644 100644 aaa bbb dir/a b.txt',
      '2 R. N... 100644 100644 100644 aaa bbb R100 new.txt',
      'old.txt',
      'u UU N... 100644 100644 100644 100644 aaa bbb ccc c.txt',
      '? new dir/x.txt',
      '',
    ].join('\0');
    const s = parseStatus(out);
    expect(s).toMatchObject({ branch: 'main', upstream: 'origin/main', ahead: 2, behind: 3, head: '1'.repeat(40) });
    expect(s.files).toEqual([
      { path: 'dir/a b.txt', orig: null, x: 'M', y: 'M', conflict: false },
      { path: 'new.txt', orig: 'old.txt', x: 'R', y: '.', conflict: false },
      { path: 'c.txt', orig: null, x: 'U', y: 'U', conflict: true },
      { path: 'new dir/x.txt', orig: null, x: '?', y: '?', conflict: false },
    ]);
  });

  it('空 repo 與 detached', () => {
    expect(parseStatus('# branch.oid (initial)\0# branch.head (detached)\0')).toMatchObject({ head: null, branch: null, ahead: null });
  });
});

describe('GitReader（真 git repo）', () => {
  it('repo：狀態、worktree 與各自的 status、--all 的 topo 歷史與 refs', async () => {
    const { root, wt, hashes } = makeRepo();
    const r = new GitReader({ projects: [{ name: 'p', path: root }], now: () => 42 });
    const d = await r.repo('p', 10);
    expect(d.status.branch).toBe('main');
    expect(d.status.files).toEqual(
      expect.arrayContaining([
        { path: 'a.txt', orig: null, x: 'M', y: 'M', conflict: false },
        { path: 'with space.txt', orig: null, x: '?', y: '?', conflict: false },
      ]),
    );
    expect(d.worktrees.map((w) => [w.main, w.branch])).toEqual([
      [true, 'main'],
      [false, 'wt-branch'],
    ]);
    expect(d.worktrees[1].path).toBe(wt);
    expect(d.worktrees[1].status?.files).toEqual([{ path: 'wt.txt', orig: null, x: '?', y: '?', conflict: false }]);
    expect(d.commits.map((c) => c.subject)).toEqual(['merge feature', 'feature work', 'second', 'first']);
    expect(d.commits[0].parents).toEqual([hashes.second, hashes.feature]);
    expect(d.commits[0].refs).toEqual(expect.arrayContaining(['HEAD -> main', 'wt-branch']));
    expect(d.commits.at(-1)!.refs).toContain('tag: v1');
    expect(d.truncated).toBe(false);
    expect(d.generatedAt).toBe(42);
    expect((await r.repo('p', 2)).truncated).toBe(true);
    // 唯讀：沒有留下 index.lock
    expect(existsSync(join(root, '.git/index.lock'))).toBe(false);
  });

  it('commit：root commit 列全部檔案、改名帶來源、merge 對第一個 parent 比較、body', async () => {
    const { root, hashes } = makeRepo();
    const r = new GitReader({ projects: [{ name: 'p', path: root }] });
    const first = await r.commit('p', hashes.first);
    expect(first.body).toBe('body line');
    expect(first.files.map((f) => [f.change, f.path, f.additions])).toEqual([
      ['A', 'a.txt', 1],
      ['A', 'old name.txt', 20],
    ]);
    const second = await r.commit('p', hashes.second.slice(0, 10));
    expect(second.hash).toBe(hashes.second);
    expect(second.files).toEqual(
      expect.arrayContaining([
        { path: 'a.txt', orig: null, change: 'M', additions: 1, deletions: 0 },
        { path: 'new name.txt', orig: 'old name.txt', change: 'R', additions: 0, deletions: 0 },
      ]),
    );
    const merge = await r.commit('p', hashes.merge);
    expect(merge.files.map((f) => f.path)).toEqual(['f.txt']);
  });

  it('diff：一般修改、改名、root commit；不在該 commit 的檔回 UnknownFile；不跑 textconv', async () => {
    const { root, hashes } = makeRepo();
    // repo 設定的 textconv 若被執行會建出 canary
    const canary = join(root, 'textconv-ran');
    writeFileSync(join(root, '.git/info/attributes'), '*.txt diff=evil\n');
    git(root, 'config', 'diff.evil.textconv', `sh -c 'touch ${canary}; cat "$0"'`);
    const r = new GitReader({ projects: [{ name: 'p', path: root }] });
    const m = await r.diff('p', hashes.second, 'a.txt');
    expect(m).toMatchObject({ path: 'a.txt', change: 'M', binary: false, truncated: false });
    expect(m.hunks[0].lines).toEqual([
      { kind: 'ctx', old: 1, new: 1, text: 'one' },
      { kind: 'add', old: null, new: 2, text: 'two' },
    ]);
    const rn = await r.diff('p', hashes.second, 'new name.txt');
    expect(rn).toMatchObject({ orig: 'old name.txt', change: 'R', hunks: [] });
    const first = await r.diff('p', hashes.first, 'a.txt');
    expect(first.hunks[0].lines).toEqual([{ kind: 'add', old: null, new: 1, text: 'one' }]);
    await expect(r.diff('p', hashes.second, 'f.txt')).rejects.toBeInstanceOf(UnknownFile);
    expect(existsSync(canary)).toBe(false);
  });

  it('summaries：路徑不存在、不是 git repo 各自回錯誤，不影響其他專案', async () => {
    const { root } = makeRepo();
    const plain = tmp('dash-nogit-');
    const r = new GitReader({
      projects: [
        { name: 'ok', path: root },
        { name: 'gone', path: '/nonexistent/dash-gone' },
        { name: 'plain', path: plain },
      ],
    });
    const s = await r.summaries();
    expect(s.projects.map((p) => [p.project, p.error?.kind ?? null])).toEqual([
      ['ok', null],
      ['gone', 'missing'],
      ['plain', 'not-git'],
    ]);
    expect(s.projects[0]).toMatchObject({ branch: 'main', counts: { staged: 1, unstaged: 1, untracked: 2, conflicts: 0 }, worktrees: 2 });
  });

  it('空 repo：沒有歷史也不報錯', async () => {
    const root = tmp('dash-git-empty-');
    git(root, 'init', '-q', '-b', 'main');
    const d = await new GitReader({ projects: [{ name: 'e', path: root }] }).repo('e');
    expect(d.commits).toEqual([]);
    expect(d.status).toMatchObject({ branch: 'main', head: null });
  });
});

describe('HTTP /api/git', () => {
  const servers: DashServer[] = [];
  afterEach(() => servers.splice(0).forEach((s) => s.stop()));

  function server(projects: { name: string; path: string }[], gitBin?: string) {
    const s = createDashServer({
      config: { projects, pollMs: 60_000 },
      herdr: { bin: 'herdr', socket: '/nonexistent.sock', off: true },
      vendorDir: VENDOR_DIR,
      gitBin,
    });
    servers.push(s);
    return s.app;
  }

  it('GET 摘要、repo、commit；錯誤碼 400／404／409', async () => {
    const { root, hashes } = makeRepo();
    const plain = tmp('dash-nogit-');
    const app = server([
      { name: 'p', path: root },
      { name: 'plain', path: plain },
    ]);
    const sum = (await (await app.request('/api/git')).json()) as GitSummaryResponse;
    expect(sum.projects.map((p) => p.project)).toEqual(['p', 'plain']);
    const repo = (await (await app.request('/api/git/p?limit=3')).json()) as GitRepoResponse;
    expect(repo.commits).toHaveLength(3);
    expect(repo.truncated).toBe(true);
    const c = (await (await app.request(`/api/git/p/commits/${hashes.feature}`)).json()) as GitCommitDetail;
    expect(c.subject).toBe('feature work');

    expect((await app.request('/api/git/p?limit=0')).status).toBe(400);
    expect((await app.request('/api/git/p?limit=abc')).status).toBe(400);
    expect((await app.request('/api/git/p/commits/HEAD')).status).toBe(400);
    expect((await app.request(`/api/git/p/commits/${'0'.repeat(40)}`)).status).toBe(404);
    expect((await app.request('/api/git/nope')).status).toBe(404);
    expect((await app.request('/api/git/plain')).status).toBe(409);
    expect((await app.request('/api/git/p', { method: 'POST' })).status).toBe(404);
    const d = (await (await app.request(`/api/git/p/commits/${hashes.feature}/diff?path=f.txt`)).json()) as GitFileDiff;
    expect(d.hunks[0].lines[0]).toEqual({ kind: 'add', old: null, new: 1, text: 'feature' });
    expect((await app.request(`/api/git/p/commits/${hashes.feature}/diff`)).status).toBe(400);
    expect((await app.request(`/api/git/p/commits/${hashes.feature}/diff?path=a.txt`)).status).toBe(404);
  });

  it('server 只以白名單參數呼叫 git', async () => {
    const { root, hashes } = makeRepo();
    const dir = tmp('dash-gitbin-');
    const log = join(dir, 'calls.log');
    const bin = script(join(dir, 'git'), `printf '%s\\n' "$*" >> ${log}\nexec git "$@"`);
    const app = server([{ name: 'p', path: root }], bin);
    await app.request('/api/git');
    await app.request('/api/git/p');
    await app.request(`/api/git/p/commits/${hashes.merge}`);
    await app.request(`/api/git/p/commits/${hashes.second}/diff?path=${encodeURIComponent('new name.txt')}`);
    const lines = readFileSync(log, 'utf8').trim().split('\n');
    expect(lines.length).toBeGreaterThan(0);
    const PREFIX = '--no-optional-locks -c core.fsmonitor=false -c color.ui=never -c core.pager=cat ';
    for (const l of lines) {
      expect(l.startsWith(PREFIX)).toBe(true);
      expect(l.slice(PREFIX.length)).toMatch(/^(status --porcelain=v2 --branch -z|worktree list --porcelain -z|log --exclude=refs\/stash --all --topo-order --max-count=\d+ -z --format=\S+|show -s -z --format=\S+ [0-9a-f]{40} --|diff-tree -r -M -z --no-commit-id --(numstat|name-status) [0-9a-f]{40} [0-9a-f]{40} --|diff-tree -r -M -p --no-commit-id --no-ext-diff --no-textconv -U3 [0-9a-f]{40} [0-9a-f]{40} -- .+)$/);
    }
  });
});
