import { readFileSync, existsSync, mkdirSync, lstatSync, readlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ChildTracker, childEnv, parseDoc, runDkStatus } from '../src/dkstatus.ts';
import { OverlayManager } from '../src/overlay.ts';
import { resolveProject } from '../src/registry.ts';
import { miniProject, script, tmp, VENDOR_DIR, waitFor } from './helpers.ts';

const listJson = (v = 1) => JSON.stringify({ schema_version: v, dkbo_version: '0.17.0', generated_at: 'x', kinds_down: [], tasks: [] });

describe('parseDoc：schema 版本檢查', () => {
  it('schema_version 1 通過、未知欄位保留不報錯', () => {
    const r = parseDoc(JSON.stringify({ ...JSON.parse(listJson()), future: 1 }), 'list');
    expect(r.ok).toBe(true);
  });
  it('schema_version ≠ 1 → schema', () => {
    expect(parseDoc(listJson(2), 'list')).toEqual({ ok: false, error: { kind: 'schema', message: 'schema' } });
    expect(parseDoc(JSON.stringify({ tasks: [] }), 'list')).toMatchObject({ ok: false, error: { kind: 'schema' } });
  });
  it('壞 JSON → json', () => {
    expect(parseDoc('{nope', 'list')).toEqual({ ok: false, error: { kind: 'json', message: 'json' } });
    expect(parseDoc('', 'list')).toMatchObject({ ok: false, error: { kind: 'json' } });
  });
  it('形狀不對（list 沒 tasks、detail 沒 task）→ schema', () => {
    expect(parseDoc(JSON.stringify({ schema_version: 1 }), 'list')).toMatchObject({ ok: false, error: { kind: 'schema' } });
    expect(parseDoc(listJson(), 'detail')).toMatchObject({ ok: false, error: { kind: 'schema' } });
  });
});

describe('childEnv', () => {
  it('明確設 DK_ROOT／DK_PROJECT_ROOT，移除 dkbo pane 變數', () => {
    const env = childEnv(
      { PATH: '/bin', DK_ROOT: '/wrong', DK_AGENT: 'x', DK_TASK: 't', HERDR_PANE_ID: 'p', HERDR_TAB_ID: 't', HERDR_WORKSPACE_ID: 'w', HOME: '/h' },
      '/p/.dkbo',
      '/p',
    );
    expect(env).toEqual({ PATH: '/bin', HOME: '/h', DK_ROOT: '/p/.dkbo', DK_PROJECT_ROOT: '/p' });
  });
});

describe('runDkStatus', () => {
  const dir = tmp();
  const run = (body: string, timeoutMs = 5000) =>
    runDkStatus({ bin: script(join(dir, `s${Math.random()}.sh`), body), dkRoot: '/r/.dkbo', projectRoot: '/r', args: ['--json'], timeoutMs });

  it('成功回傳 doc 與原始 stdout', async () => {
    const r = await run(`echo '${listJson()}'`);
    expect(r.ok && r.doc.schema_version).toBe(1);
  });
  it('非零 → exit，訊息為 stderr 第一個非空行', async () => {
    expect(await run(`echo >&2; echo "dk: no task 'x'" >&2; echo more >&2; exit 1`)).toEqual({
      ok: false,
      error: { kind: 'exit', message: "dk: no task 'x'" },
      code: 1,
    });
  });
  it('非零且沒有 stderr → 訊息為錯誤種類', async () => {
    expect(await run('exit 3')).toMatchObject({ ok: false, error: { kind: 'exit', message: 'exit' } });
  });
  it('逾時 kill 整個行程群組', async () => {
    const pidFile = join(dir, 'child.pid');
    const t0 = Date.now();
    const r = await run(`sleep 30 & echo $! > ${pidFile}; wait`, 300);
    expect(r).toMatchObject({ ok: false, error: { kind: 'timeout', message: 'timeout' } });
    expect(Date.now() - t0).toBeLessThan(3000);
    const pid = Number(readFileSync(pidFile, 'utf8'));
    await waitFor(() => {
      try {
        process.kill(pid, 0);
        return false;
      } catch {
        return true;
      }
    }, 2000);
  });
  it('執行檔不存在 → exit', async () => {
    const r = await runDkStatus({ bin: join(dir, 'nope'), dkRoot: '/r', projectRoot: '/r', args: ['--json'], timeoutMs: 1000 });
    expect(r).toMatchObject({ ok: false, error: { kind: 'exit' } });
  });
});

describe('ChildTracker（debt AC6）', () => {
  const dir = tmp();
  const gone = (pid: number) => {
    try {
      process.kill(-pid, 0);
      return false;
    } catch {
      return true;
    }
  };
  const start = (tracker: ChildTracker, body: string) => {
    const pidFile = join(dir, `p${Math.random()}`);
    const r = runDkStatus({ bin: script(join(dir, `s${Math.random()}.sh`), `echo $$ > ${pidFile}\n${body}`), dkRoot: '/r', projectRoot: '/r', args: ['--json'], timeoutMs: 30_000, tracker });
    return { r, pid: () => waitFor(() => existsSync(pidFile) && Number(readFileSync(pidFile, 'utf8')) || null) };
  };

  it('terminate 送 SIGTERM 給整個行程群組，等它們結束才 resolve', async () => {
    const tk = new ChildTracker();
    const a = start(tk, 'sleep 30');
    const pid = await a.pid();
    await tk.terminate(2000);
    expect(gone(pid)).toBe(true);
    expect(await a.r).toMatchObject({ ok: false });
  });
  it('忽略 SIGTERM 的行程在 grace 後改 SIGKILL', async () => {
    const tk = new ChildTracker();
    const a = start(tk, `trap '' TERM; sleep 30 & wait; sleep 30`);
    const pid = await a.pid();
    const t0 = Date.now();
    await tk.terminate(300);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(gone(pid)).toBe(true);
  });
  it('關閉後不再 spawn', async () => {
    const tk = new ChildTracker();
    await tk.terminate();
    const marker = join(dir, 'ran');
    const r = await runDkStatus({ bin: script(join(dir, 'm.sh'), `touch ${marker}`), dkRoot: '/r', projectRoot: '/r', args: ['--json'], tracker: tk });
    expect(r).toMatchObject({ ok: false, error: { kind: 'exit' } });
    expect(existsSync(marker)).toBe(false);
  });
});

describe('resolveProject', () => {
  it('路徑不存在 → missing', async () => {
    expect(await resolveProject('/nonexistent/dash-x')).toMatchObject({ ok: false, error: { kind: 'missing' }, mode: null });
  });
  it('沒有 .dkbo → no-dkbo', async () => {
    expect(await resolveProject(tmp())).toMatchObject({ ok: false, error: { kind: 'no-dkbo' }, mode: null });
  });
  it('有 .dkbo/bin/dk-status → native，版本取專案 VERSION', async () => {
    const p = miniProject(tmp(), { native: true, version: '0.17.1', tasks: [] });
    expect(await resolveProject(p)).toEqual({ ok: true, mode: 'native', dkboVersion: '0.17.1', dkbo: join(p, '.dkbo') });
  });
  it('沒有 dk-status → compat', async () => {
    const p = miniProject(tmp(), { version: '0.16.0', tasks: [] });
    expect(await resolveProject(p)).toEqual({ ok: true, mode: 'compat', dkboVersion: '0.16.0', dkbo: join(p, '.dkbo') });
  });
  it('沒有 VERSION 檔 → dkboVersion null', async () => {
    const p = tmp();
    mkdirSync(join(p, '.dkbo'));
    expect(await resolveProject(p)).toMatchObject({ ok: true, mode: 'compat', dkboVersion: null });
  });
});

describe('OverlayManager', () => {
  const managers: OverlayManager[] = [];
  afterEach(() => managers.splice(0).forEach((m) => m.cleanupSync()));

  it('bin/lib/VERSION 來自 vendor，tasks/roles/kinds/.sessions symlink（存在才連），同一專案重用', async () => {
    const base = tmp('dash-base-');
    const m = new OverlayManager({ vendorDir: VENDOR_DIR, tmpBase: base });
    managers.push(m);
    const withS = miniProject(tmp(), { version: '0.16.0', tasks: ['2026-01-01-a'], sessions: true });
    const noS = miniProject(tmp(), { version: '0.16.0', tasks: [] });
    const o1 = await m.get(join(withS, '.dkbo'));
    expect(o1.startsWith(join(base, 'dash-overlay-'))).toBe(true);
    expect(existsSync(join(o1, 'bin/dk-status'))).toBe(true);
    expect(existsSync(join(o1, 'lib/common.sh'))).toBe(true);
    expect(readFileSync(join(o1, 'VERSION'), 'utf8')).toBe(readFileSync(join(VENDOR_DIR, 'VERSION'), 'utf8'));
    for (const x of ['tasks', 'roles', 'kinds', '.sessions']) {
      expect(lstatSync(join(o1, x)).isSymbolicLink()).toBe(true);
      expect(readlinkSync(join(o1, x))).toBe(join(withS, '.dkbo', x));
    }
    const o2 = await m.get(join(noS, '.dkbo'));
    expect(existsSync(join(o2, '.sessions'))).toBe(false);
    expect(await m.get(join(withS, '.dkbo'))).toBe(o1);
    expect(m.paths()).toEqual([o1, o2]);
  });

  it('overlay 建好後才出現的 tasks／.sessions 下次取用時補連，不重建、不動已有連結（debt AC5）', async () => {
    const base = tmp('dash-base-');
    const m = new OverlayManager({ vendorDir: VENDOR_DIR, tmpBase: base });
    managers.push(m);
    const proj = miniProject(tmp(), { version: '0.16.0', tasks: [] });
    const dk = join(proj, '.dkbo');
    const o = await m.get(dk);
    expect(existsSync(join(o, 'tasks'))).toBe(false);
    const rolesIno = lstatSync(join(o, 'roles')).ino;

    mkdirSync(join(dk, 'tasks/2026-01-01-late'), { recursive: true });
    writeFileSync(join(dk, 'tasks/2026-01-01-late/process.md'), '2026-01-01T09:00 task-new late\n');
    mkdirSync(join(dk, '.sessions'));
    expect(await m.get(dk)).toBe(o);
    expect(readlinkSync(join(o, 'tasks'))).toBe(join(dk, 'tasks'));
    expect(readlinkSync(join(o, '.sessions'))).toBe(join(dk, '.sessions'));
    expect(lstatSync(join(o, 'roles')).ino).toBe(rolesIno);
    expect(m.paths()).toEqual([o]);

    const r = await runDkStatus({ bin: join(o, 'bin/dk-status'), dkRoot: o, projectRoot: proj, args: ['--json'] });
    expect(r.ok && r.doc.tasks.map((t) => t.dir)).toEqual(['2026-01-01-late']);
  });

  it('清理只刪自己建的 overlay，不跟隨 symlink、不碰別人的 dash-overlay-*', async () => {
    const base = tmp('dash-base-');
    const foreign = join(base, 'dash-overlay-foreign');
    mkdirSync(foreign);
    writeFileSync(join(foreign, 'keep'), 'x');
    const proj = miniProject(tmp(), { version: '0.16.0', tasks: ['2026-01-01-a'] });
    const m = new OverlayManager({ vendorDir: VENDOR_DIR, tmpBase: base });
    const o = await m.get(join(proj, '.dkbo'));
    m.cleanupSync();
    expect(existsSync(o)).toBe(false);
    expect(existsSync(join(foreign, 'keep'))).toBe(true);
    expect(existsSync(join(proj, '.dkbo/tasks/2026-01-01-a/process.md'))).toBe(true);
    expect(m.paths()).toEqual([]);
  });
});
