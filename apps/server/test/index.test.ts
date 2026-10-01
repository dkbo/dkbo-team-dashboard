// 真的起一個 server 行程（tsx src/index.ts），驗 SIGINT／SIGTERM 後只清自己建的 overlay。tsx 一律 TSX_DISABLE_CACHE=1，不在 $TMPDIR 留快取。
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { calls, fakeProject, miniProject, script, setFake, tmp, waitFor } from './helpers.ts';

const SERVER_DIR = resolve(import.meta.dirname, '..');
/** `node --import tsx`：不經 tsx CLI（它會在 $TMPDIR 建 tsx-<uid> 放 IPC pipe） */
const SERVER_ARGS = ['--import', 'tsx', 'src/index.ts'];

describe.each(['SIGTERM', 'SIGINT'] as const)('收到 %s', (sig) => {
  it('刪掉本行程建的 dash-overlay-*，其他行程的不受影響；只 listen 127.0.0.1', async () => {
    const base = tmp('dash-tmpbase-');
    const foreign = join(base, 'dash-overlay-foreign');
    mkdirSync(foreign);
    writeFileSync(join(foreign, 'keep'), 'x');
    const compatA = miniProject(tmp(), { version: '0.16.0', tasks: ['2026-01-01-a'] });
    const compatB = miniProject(tmp(), { version: '0.16.0', tasks: ['2026-01-02-b'] });
    const cfg = join(tmp(), 'dashboard.config.json');
    writeFileSync(cfg, JSON.stringify({ projects: [{ name: 'a', path: compatA }, { name: 'b', path: compatB }], pollMs: 200 }));

    const child = spawn(process.execPath, SERVER_ARGS, {
      cwd: SERVER_DIR,
      env: { ...process.env, TSX_DISABLE_CACHE: '1', PORT: '0', DASHBOARD_CONFIG: cfg, DASH_HERDR: 'off', TMPDIR: base },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    const exited = new Promise<number | null>((r) => child.on('exit', (code) => r(code)));

    const url = await waitFor(() => /listening on (http:\/\/\S+)/.exec(out)?.[1], 15_000);
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    const mine = await waitFor(() => {
      const d = readdirSync(base).filter((n) => n.startsWith('dash-overlay-') && n !== 'dash-overlay-foreign');
      return d.length === 2 ? d : null;
    }, 10_000);
    const res = await fetch(`${url}/api/overview`);
    expect(res.status).toBe(200);

    child.kill(sig);
    expect(await exited).toBe(0);
    for (const d of mine) expect(existsSync(join(base, d))).toBe(false);
    expect(existsSync(join(foreign, 'keep'))).toBe(true);
    expect(existsSync(join(compatA, '.dkbo/tasks/2026-01-01-a/process.md'))).toBe(true);
  });
});

const alive = (pgid: number) => {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch {
    return false;
  }
};

describe('關機不留孤兒（debt AC6）', () => {
  it('SIGTERM 時先收掉卡住的 dk-status 行程群組，再清 overlay，5 秒內退出', async () => {
    const base = tmp('dash-tmpbase-');
    const hung = fakeProject(tmp(), { list: { schema_version: 1, tasks: [] } });
    setFake(hung, 'sleep', '60');
    const compat = miniProject(tmp(), { version: '0.16.0', tasks: ['2026-01-01-a'] });
    const cfg = join(tmp(), 'dashboard.config.json');
    writeFileSync(cfg, JSON.stringify({ projects: [{ name: 'hung', path: hung }, { name: 'c', path: compat }], pollMs: 200 }));

    const child = spawn(process.execPath, SERVER_ARGS, {
      cwd: SERVER_DIR,
      env: { ...process.env, TSX_DISABLE_CACHE: '1', PORT: '0', DASHBOARD_CONFIG: cfg, DASH_HERDR: 'off', TMPDIR: base },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    const exited = new Promise<number | null>((r) => child.on('exit', (code) => r(code)));

    await waitFor(() => /listening on/.test(out), 15_000);
    const pid = Number(await waitFor(() => /^start (\d+)/.exec(calls(hung)[0] ?? '')?.[1], 10_000));
    const overlay = await waitFor(() => readdirSync(base).find((n) => n.startsWith('dash-overlay-')), 10_000);
    expect(alive(pid)).toBe(true);

    const t0 = Date.now();
    child.kill('SIGTERM');
    expect(await exited).toBe(0);
    expect(Date.now() - t0).toBeLessThanOrEqual(5000);
    expect(alive(pid)).toBe(false);
    expect(existsSync(join(base, overlay))).toBe(false);
  });
});

describe('趨勢取樣只寫 DASH_DATA_DIR（AC8）', () => {
  it('HOME、XDG_STATE_HOME 指到空目錄，跑完仍是空的；樣本落在 DASH_DATA_DIR', async () => {
    const home = tmp('dash-home-');
    const xdg = tmp('dash-xdg-');
    const data = join(tmp('dash-data-'), 'd');
    const herdrDir = tmp('dash-herdr-');
    const snap = join(herdrDir, 'snap.json');
    writeFileSync(
      snap,
      JSON.stringify({ panes: [{ pane_id: 'wX:p1', tab_id: 'wX:t1', workspace_id: 'wX', agent: 'claude', agent_status: 'working', cwd: '/nowhere', tokens: { cost: '$0.50' } }] }),
    );
    const bin = script(join(herdrDir, 'herdr'), `cat ${snap}`);
    const cfg = join(tmp(), 'dashboard.config.json');
    writeFileSync(cfg, JSON.stringify({ projects: [], pollMs: 200 }));

    const child = spawn(process.execPath, SERVER_ARGS, {
      cwd: SERVER_DIR,
      env: {
        ...process.env,
        TSX_DISABLE_CACHE: '1',
        PORT: '0',
        DASHBOARD_CONFIG: cfg,
        DASH_HERDR_BIN: bin,
        DASH_HERDR_SOCKET: join(herdrDir, 'none.sock'),
        HOME: home,
        XDG_STATE_HOME: xdg,
        DASH_DATA_DIR: data,
        DASH_SAMPLE_MS: '50',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    const exited = new Promise<number | null>((r) => child.on('exit', (code) => r(code)));
    try {
      const url = await waitFor(() => /listening on (http:\/\/\S+)/.exec(out)?.[1], 15_000);
      const files = await waitFor(() => existsSync(join(data, 'samples')) && readdirSync(join(data, 'samples')), 10_000);
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^\d{4}-\d{2}-\d{2}\.jsonl$/);
      const t = (await (await fetch(`${url}/api/trends?range=6h`)).json()) as { dataDir: string };
      expect(t.dataDir).toBe(data);
    } finally {
      child.kill('SIGTERM');
      await exited;
    }
    expect(readdirSync(home)).toEqual([]);
    expect(readdirSync(xdg)).toEqual([]);
  });
});
