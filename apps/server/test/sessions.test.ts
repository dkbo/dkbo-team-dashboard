import { mkdirSync, truncateSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PaneLive } from '@dash/shared';
import { SessionTracker, sessionOptsFromEnv, type TrackerDeps } from '../src/sessions.ts';
import { appendJsonl, cl, claudeFile, codexFile, cx, writeJsonl } from './session-fixtures.ts';
import { tmp } from './helpers.ts';

const HOUR = 3600_000;
const DAY = 24 * HOUR;

interface Env {
  root: string;
  claudeDir: string;
  codexDir: string;
  proj: string;
  now: number;
  panes: PaneLive[];
  ids: Map<string, string>;
  since: Map<string, number>;
  tracker: SessionTracker;
}

const trackers: SessionTracker[] = [];
afterEach(() => {
  for (const t of trackers.splice(0)) t.stop();
});

const pane = (paneId: string, o: Partial<PaneLive> = {}): PaneLive => ({
  paneId,
  tabId: 'w1:t1',
  workspaceId: 'w1',
  name: null,
  agent: 'claude',
  status: 'working',
  cwd: '/nowhere',
  model: null,
  effort: null,
  cost: null,
  ctxPct: null,
  usage5hPct: null,
  usageWkPct: null,
  taskDir: null,
  member: null,
  ...o,
});

function setup(extra: Partial<TrackerDeps> = {}): Env {
  const root = tmp('dash-sess-');
  const proj = join(root, 'work/proj');
  mkdirSync(join(proj, '.dkbo/roles'), { recursive: true });
  const e = { root, claudeDir: join(root, 'claude'), codexDir: join(root, 'codex'), proj, now: Date.UTC(2030, 4, 10, 12), panes: [] as PaneLive[], ids: new Map<string, string>(), since: new Map<string, number>() } as Env;
  e.tracker = new SessionTracker(
    { claudeDir: e.claudeDir, codexDir: e.codexDir, off: false, now: () => e.now },
    { projects: [{ name: 'proj', path: proj }], panes: () => e.panes, sessionIds: () => e.ids, herdrUp: () => true, paneSince: () => e.since, ...extra },
  );
  trackers.push(e.tracker);
  return e;
}

const byId = (e: Env) => Object.fromEntries(e.tracker.sessions().map((s) => [s.sessionId, s]));

describe('sessionOptsFromEnv', () => {
  it('DASH_* 優先，其次 CLAUDE_CONFIG_DIR／CODEX_HOME；DASH_SESSIONS=off 關閉', () => {
    expect(sessionOptsFromEnv({ DASH_CLAUDE_DIR: '/a', CLAUDE_CONFIG_DIR: '/b', CODEX_HOME: '/c' })).toMatchObject({ claudeDir: '/a', codexDir: '/c', off: false });
    expect(sessionOptsFromEnv({ CLAUDE_CONFIG_DIR: '/b', DASH_SESSIONS: 'off' })).toMatchObject({ claudeDir: '/b', off: true });
  });
});

describe('AC1 session 探索', () => {

  it('Claude 首行讀不到 cwd（檔剛建、cwd 行還沒寫）不快取：之後寫入 cwd 行就找得到', async () => {
    const e = setup();
    const f = claudeFile(e.claudeDir, e.proj, 'c-late');
    writeJsonl(f, [{ type: 'summary', summary: 'FAKE' }], e.now - 5_000);
    await e.tracker.scan();
    expect(byId(e)['c-late']).toBeUndefined();
    appendJsonl(f, [cl.prompt('c-late', e.proj, e.now - 3_000)], e.now - 3_000);
    await e.tracker.scan();
    expect(byId(e)['c-late']).toBeDefined();
  });

  it('Claude：專案與 .worktrees 底下、24 小時內；以檔內 cwd 確認專案（/a/b 不收 /a/b-c）', async () => {
    const e = setup();
    const wt = join(e.proj, '.worktrees/feat');
    writeJsonl(claudeFile(e.claudeDir, e.proj, 'c-main'), [cl.meta('c-main', e.proj, e.now - 60_000), cl.prompt('c-main', e.proj, e.now - 50_000), cl.text('c-main', e.now - 40_000)], e.now - 40_000);
    writeJsonl(claudeFile(e.claudeDir, wt, 'c-wt'), [cl.prompt('c-wt', wt, e.now - 9_000), cl.tool('c-wt', e.now - 8_000, 't1', 'Bash', { command: 'ls' })], e.now - 8_000);
    // 編碼後同前綴的鄰居專案
    writeJsonl(claudeFile(e.claudeDir, e.proj + '-c', 'c-neighbor'), [cl.prompt('c-neighbor', e.proj + '-c', e.now - 5_000)], e.now - 5_000);
    // 同資料夾、cwd 其實不在專案底下的（Claude 編碼會撞：proj.x 與 proj-x）
    writeJsonl(join(e.claudeDir, 'projects', `${e.proj.replace(/[^A-Za-z0-9]/g, '-')}-x`, 'c-dot.jsonl'), [cl.prompt('c-dot', e.proj + '.x', e.now - 5_000)], e.now - 5_000);
    writeJsonl(claudeFile(e.claudeDir, e.proj, 'c-old'), [cl.prompt('c-old', e.proj, e.now - 2 * DAY)], e.now - 2 * DAY);
    await e.tracker.scan();
    const s = byId(e);
    expect(Object.keys(s).sort()).toEqual(['c-main', 'c-wt']);
    expect(s['c-main']).toMatchObject({ kind: 'claude', project: 'proj', cwd: e.proj, paneId: null, live: { substate: 'done' } });
    expect(s['c-wt'].live).toMatchObject({ substate: 'running', tool: { name: 'Bash', summary: 'ls' } });
  });

  it('Claude：24 小時外但被 pane 的 session id 指到也讀', async () => {
    const e = setup();
    writeJsonl(claudeFile(e.claudeDir, e.proj, 'c-old'), [cl.prompt('c-old', e.proj, e.now - 3 * DAY), cl.tool('c-old', e.now - 3 * DAY + 1000, 't1', 'Bash', { command: 'sleep' })], e.now - 3 * DAY);
    e.panes = [pane('p1', { cwd: e.proj })];
    e.ids.set('p1', 'c-old');
    e.tracker.refreshPanes();
    await e.tracker.scan();
    expect(byId(e)['c-old']).toMatchObject({ paneId: 'p1', live: { substate: 'running' } });
    expect(e.tracker.paneSession('p1')).toMatchObject({ sessionId: 'c-old', substate: 'running' });
  });

  it('Codex：以 session_meta.cwd 判專案；4 天前日期夾的 rollout 被 pane 對到仍找得到；24 小時外沒對到的不收', async () => {
    const e = setup();
    const old = e.now - 4 * DAY;
    writeJsonl(codexFile(e.codexDir, old, 'x-long'), [cx.meta('x-long', e.proj, old), cx.context(old), cx.started(e.now - 5_000), cx.call(e.now - 4_000, 'c1', 'pnpm -r test')], e.now - 4_000);
    writeJsonl(codexFile(e.codexDir, old, 'x-stale'), [cx.meta('x-stale', e.proj + '/.worktrees/w', old), cx.started(old + 1000), cx.complete(old + 2000)], old + 2000);
    writeJsonl(codexFile(e.codexDir, e.now - HOUR, 'x-other'), [cx.meta('x-other', '/elsewhere', e.now - HOUR)], e.now - HOUR);
    e.panes = [pane('p9', { agent: 'codex', cwd: e.proj })];
    e.tracker.refreshPanes();
    await e.tracker.scan();
    const s = byId(e);
    expect(Object.keys(s)).toEqual(['x-long']);
    expect(s['x-long']).toMatchObject({ kind: 'codex', paneId: 'p9', effort: 'high', live: { substate: 'running', model: 'gpt-5.5', tool: { summary: 'pnpm -r test' } } });
  });

  it('Codex：每檔的第一行只讀一次（以路徑快取）', async () => {
    const e = setup();
    writeJsonl(codexFile(e.codexDir, e.now - HOUR, 'x1'), [cx.meta('x1', e.proj, e.now - HOUR), cx.started(e.now - HOUR)], e.now - HOUR);
    await e.tracker.scan();
    // 把第一行改成別的 cwd：快取在，不重讀
    const f = codexFile(e.codexDir, e.now - HOUR, 'x1');
    writeJsonl(f, [cx.meta('x1', '/elsewhere', e.now - HOUR), cx.started(e.now - HOUR)], e.now - HOUR);
    e.now += 61_000;
    await e.tracker.scan();
    expect(byId(e).x1?.project).toBe('proj');
  });

  it('subagents：<session>/subagents/*.jsonl 最近有動且未 end_turn 的才算', async () => {
    const e = setup();
    const f = writeJsonl(claudeFile(e.claudeDir, e.proj, 'c1'), [cl.prompt('c1', e.proj, e.now - 9_000), cl.tool('c1', e.now - 8_000, 't1', 'Agent', { description: 'scan repo' })], e.now - 8_000);
    const sub = join(f.slice(0, -'.jsonl'.length), 'subagents');
    writeJsonl(join(sub, 'agent-a.jsonl'), [{ ...cl.tool('c1', e.now - 5_000, 's1', 'Grep', { pattern: 'x' }), isSidechain: true }], e.now - 5_000);
    writeJsonl(join(sub, 'agent-b.jsonl'), [{ ...cl.text('c1', e.now - 4_000, 'end_turn'), isSidechain: true }], e.now - 4_000);
    writeJsonl(join(sub, 'agent-c.jsonl'), [{ ...cl.tool('c1', e.now - HOUR, 's2', 'Grep', { pattern: 'x' }), isSidechain: true }], e.now - HOUR);
    await e.tracker.scan();
    expect(byId(e).c1.live).toMatchObject({ substate: 'running', subagents: 1, tool: { name: 'Agent', summary: 'scan repo' } });
  });

  it('不讀 config 外的 transcript 資料夾', async () => {
    const e = setup();
    writeJsonl(claudeFile(e.claudeDir, '/other/repo', 'z'), [cl.prompt('z', '/other/repo', e.now - 1000)], e.now - 1000);
    await e.tracker.scan();
    expect(e.tracker.sessions()).toEqual([]);
  });
});

describe('AC2 pane ↔ session', () => {
  it('同 cwd 兩個 Codex pane：依 pane 註冊時間與 session_meta 時間配對，不會配反', async () => {
    const e = setup();
    const wt = join(e.proj, '.worktrees/w');
    const tA = e.now - 2 * HOUR;
    const tB = e.now - HOUR;
    writeJsonl(codexFile(e.codexDir, tA + 5000, 'sa'), [cx.meta('sa', wt, tA + 5000), cx.started(tA + 6000), cx.call(e.now - 1000, 'c1', 'A-cmd')], e.now - 1000);
    writeJsonl(codexFile(e.codexDir, tB + 5000, 'sb'), [cx.meta('sb', wt, tB + 5000), cx.started(tB + 6000), cx.complete(e.now - 30_000)], e.now - 30_000);
    e.panes = [pane('pA', { agent: 'codex', cwd: wt }), pane('pB', { agent: 'codex', cwd: wt })];
    e.since.set('pA', tA).set('pB', tB);
    e.tracker.refreshPanes();
    await e.tracker.scan();
    expect(e.tracker.paneSession('pA')).toMatchObject({ sessionId: 'sa', substate: 'running' });
    expect(e.tracker.paneSession('pB')).toMatchObject({ sessionId: 'sb', substate: 'done' });
  });

  it('同 cwd 兩個 Codex pane 都在 server 啟動前就存在：不配，session 以無 pane 身分出現', async () => {
    const e = setup();
    writeJsonl(codexFile(e.codexDir, e.now - HOUR, 's1'), [cx.meta('s1', e.proj, e.now - HOUR)], e.now - 1000);
    writeJsonl(codexFile(e.codexDir, e.now - HOUR, 's2'), [cx.meta('s2', e.proj, e.now - HOUR + 10)], e.now - 2000);
    e.panes = [pane('p1', { agent: 'codex', cwd: e.proj }), pane('p2', { agent: 'codex', cwd: e.proj })];
    e.tracker.refreshPanes();
    await e.tracker.scan();
    expect(e.tracker.paneSession('p1')).toBeNull();
    expect(e.tracker.paneSession('p2')).toBeNull();
    expect(e.tracker.sessions().map((s) => s.paneId)).toEqual([null, null]);
  });

  it('server 啟動後才出現的 pane 以觀察時間當首次出現時間', async () => {
    const e = setup();
    e.panes = [pane('p1', { agent: 'codex', cwd: e.proj })];
    writeJsonl(codexFile(e.codexDir, e.now - HOUR, 's1'), [cx.meta('s1', e.proj, e.now - HOUR)], e.now - HOUR);
    e.tracker.refreshPanes();
    e.now += 10_000;
    e.panes = [...e.panes, pane('p2', { agent: 'codex', cwd: e.proj })];
    e.tracker.refreshPanes();
    writeJsonl(codexFile(e.codexDir, e.now + 1000, 's2'), [cx.meta('s2', e.proj, e.now + 1000)], e.now + 1000);
    e.now += 5000;
    await e.tracker.scan();
    expect(e.tracker.paneSession('p2')?.sessionId).toBe('s2');
    expect(e.tracker.paneSession('p1')?.sessionId).toBe('s1');
  });

  it('herdr 第一次 change 時 pane 清單還空：之後出現的 pane 仍算啟動前就在（不把舊 session 判成不屬於它）', async () => {
    const e = setup();
    writeJsonl(codexFile(e.codexDir, e.now - 3 * DAY, 'old'), [cx.meta('old', e.proj, e.now - 3 * DAY), cx.started(e.now - 9000)], e.now - 9000);
    e.tracker.refreshPanes();
    e.now += 50;
    e.panes = [pane('p1', { agent: 'codex', cwd: e.proj })];
    e.tracker.refreshPanes();
    await e.tracker.scan();
    expect(e.tracker.paneSession('p1')?.sessionId).toBe('old');
  });

  it('herdr 一開始就是零 pane（真的沒開）：之後出現的 pane 以出現時間為首次出現，配到新開的 session 而非舊的', async () => {
    const e = setup();
    // 舊 session 的檔 mtime 比新的還晚：首次出現時間若被當成「未知」，會因「最近更新」誤配到它
    writeJsonl(codexFile(e.codexDir, e.now - 3 * DAY, 'old'), [cx.meta('old', e.proj, e.now - 3 * DAY), cx.started(e.now - 9000)], e.now + 12_000);
    e.tracker.refreshPanes();
    e.now += 10_000;
    e.panes = [pane('p1', { agent: 'codex', cwd: e.proj })];
    e.tracker.refreshPanes();
    writeJsonl(codexFile(e.codexDir, e.now + 1000, 'fresh'), [cx.meta('fresh', e.proj, e.now + 1000)], e.now + 1000);
    e.now += 5000;
    await e.tracker.scan();
    expect(e.tracker.paneSession('p1')?.sessionId).toBe('fresh');
  });

  it('herdr blocked → waiting（since＝觀察時間、問句讀一次畫面）；JSONL error 優先', async () => {
    const screen = vi.fn(async () => '│ Do you want to proceed? │\n│ ❯ 1. Yes │');
    const e = setup({ screen });
    writeJsonl(claudeFile(e.claudeDir, e.proj, 'c1'), [cl.prompt('c1', e.proj, e.now - 9_000), cl.tool('c1', e.now - 8_000, 't1', 'Bash', { command: 'rm -r x' })], e.now - 8_000);
    writeJsonl(claudeFile(e.claudeDir, e.proj, 'c2'), [cl.prompt('c2', e.proj, e.now - 9_000), cl.apiError('c2', e.now - 7_000)], e.now - 7_000);
    e.panes = [pane('p1', { cwd: e.proj }), pane('p2', { cwd: e.proj })];
    e.ids.set('p1', 'c1').set('p2', 'c2');
    e.tracker.refreshPanes();
    await e.tracker.scan();
    e.now += 3000;
    e.panes = [pane('p1', { cwd: e.proj, status: 'blocked' }), pane('p2', { cwd: e.proj, status: 'blocked' })];
    e.tracker.refreshPanes();
    await vi.waitFor(() => expect(e.tracker.paneSession('p1')?.question).toBe('Do you want to proceed?'));
    expect(e.tracker.paneSession('p1')).toMatchObject({ substate: 'waiting', substateSince: e.now, tool: { name: 'Bash' } });
    expect(e.tracker.paneSession('p2')).toMatchObject({ substate: 'error', error: 'API Error: Connection lost mid-response.' });
    // 仍 blocked 的後續變動不重讀畫面
    e.tracker.refreshPanes();
    expect(screen).toHaveBeenCalledTimes(2);
    e.panes = [pane('p1', { cwd: e.proj, status: 'working' }), pane('p2', { cwd: e.proj, status: 'working' })];
    e.tracker.refreshPanes();
    expect(e.tracker.paneSession('p1')).toMatchObject({ substate: 'running', question: null });
  });
});

describe('AC4 只讀新增的位元組', () => {
  it('追加只讀新行；半行等寫完；檔案變小就重讀', async () => {
    const e = setup();
    const f = writeJsonl(claudeFile(e.claudeDir, e.proj, 'c1'), [cl.prompt('c1', e.proj, e.now - 9_000)], e.now - 9_000);
    await e.tracker.scan();
    expect(byId(e).c1.live.substate).toBe('thinking');
    const spy = vi.spyOn(e.tracker as unknown as { tail: (f: unknown) => Promise<boolean> }, 'tail');
    appendJsonl(f, [cl.tool('c1', e.now - 8_000, 't1', 'Bash', { command: 'ls' })]);
    // 半行：還不算
    writeFileSync(f, JSON.stringify(cl.result('c1', e.now - 7_000, 't1')).slice(0, 20), { flag: 'a' });
    await e.tracker.poll();
    expect(byId(e).c1.live.substate).toBe('running');
    writeFileSync(f, JSON.stringify(cl.result('c1', e.now - 7_000, 't1')).slice(20) + '\n', { flag: 'a' });
    await e.tracker.poll();
    expect(byId(e).c1.live.substate).toBe('thinking');
    expect(spy).toHaveBeenCalled();
    // 變小：從頭重讀
    truncateSync(f, 0);
    appendJsonl(f, [cl.prompt('c1', e.proj, e.now - 1000), cl.text('c1', e.now - 500)]);
    await e.tracker.poll();
    expect(byId(e).c1.live).toMatchObject({ substate: 'done', turnStartedAt: e.now - 1000 });
  });

  it('不整檔重讀：第二次 poll 讀的位元組數＝新增的位元組數', async () => {
    const e = setup();
    const f = writeJsonl(claudeFile(e.claudeDir, e.proj, 'c1'), [cl.meta('c1', e.proj, e.now - 9_500), ...Array.from({ length: 200 }, (_, i) => cl.noise('c1', e.now - 9_000 + i))], e.now - 9_000);
    await e.tracker.scan();
    const add = JSON.stringify(cl.prompt('c1', e.proj, e.now)) + '\n';
    writeFileSync(f, add, { flag: 'a' });
    utimesSync(f, (e.now + 1) / 1000, (e.now + 1) / 1000);
    const entry = (e.tracker as unknown as { files: Map<string, { offset: number }> }).files.get(f)!;
    const before = entry.offset;
    await e.tracker.poll();
    expect(entry.offset - before).toBe(Buffer.byteLength(add));
  });

  it('第一次讀超過 initialTailBytes 的檔只讀尾端', async () => {
    const root = tmp('dash-sess-');
    const proj = join(root, 'p');
    const claudeDir = join(root, 'c');
    const now = Date.UTC(2030, 0, 1);
    const t = new SessionTracker(
      { claudeDir, codexDir: join(root, 'x'), off: false, now: () => now, initialTailBytes: 2000 },
      { projects: [{ name: 'p', path: proj }], panes: () => [], sessionIds: () => new Map(), herdrUp: () => true },
    );
    trackers.push(t);
    writeJsonl(claudeFile(claudeDir, proj, 'big'), [cl.prompt('big', proj, now - 9000), ...Array.from({ length: 100 }, (_, i) => cl.noise('big', now - 8000 + i)), cl.tool('big', now - 100, 't1', 'Bash', { command: 'x' })], now - 100);
    await t.scan();
    const s = t.sessions()[0];
    // 開頭的提示不在尾端視窗：turnStartedAt 不知道，但最後的工具有讀到
    expect(s.live).toMatchObject({ substate: 'running', turnStartedAt: null });
  });

  it('DASH_SESSIONS=off：不探索、paneSession 恆 null', async () => {
    const e = setup();
    writeJsonl(claudeFile(e.claudeDir, e.proj, 'c1'), [cl.prompt('c1', e.proj, e.now - 9_000)], e.now - 9_000);
    const off = new SessionTracker({ claudeDir: e.claudeDir, codexDir: e.codexDir, off: true, now: () => e.now }, { projects: [{ name: 'proj', path: e.proj }], panes: () => [], sessionIds: () => new Map(), herdrUp: () => true });
    await off.scan();
    expect(off.sessions()).toEqual([]);
    expect(off.paneSession('p1')).toBeNull();
  });
});

describe('paneSession 索引', () => {
  it('同一份檔案狀態下，對 N 個 pane 各問一次只建一次 sessionId 索引', async () => {
    const e = setup();
    const n = 12;
    for (let i = 0; i < n; i++) {
      writeJsonl(claudeFile(e.claudeDir, e.proj, `c${i}`), [cl.prompt(`c${i}`, e.proj, e.now - 9_000), cl.text(`c${i}`, e.now - 8_000)], e.now - 8_000);
      e.ids.set(`p${i}`, `c${i}`);
    }
    e.panes = Array.from({ length: n }, (_, i) => pane(`p${i}`, { cwd: e.proj }));
    e.tracker.refreshPanes();
    await e.tracker.scan();
    const build = vi.spyOn(e.tracker as unknown as { bySession: () => unknown }, 'bySession');
    for (let i = 0; i < n; i++) expect(e.tracker.paneSession(`p${i}`)?.sessionId).toBe(`c${i}`);
    expect(build.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('檔案 mtime 變了索引要跟著換：同 sessionId 兩個檔取較新的那個', async () => {
    const e = setup();
    const wt = join(e.proj, '.worktrees/w');
    const a = claudeFile(e.claudeDir, e.proj, 'dup');
    const b = claudeFile(e.claudeDir, wt, 'dup');
    writeJsonl(a, [cl.prompt('dup', e.proj, e.now - 9_000), cl.tool('dup', e.now - 8_000, 't1', 'Bash', { command: 'from-a' })], e.now - 8_000);
    writeJsonl(b, [cl.prompt('dup', wt, e.now - 9_000), cl.tool('dup', e.now - 7_000, 't1', 'Bash', { command: 'from-b' })], e.now - 7_000);
    e.panes = [pane('p1', { cwd: e.proj })];
    e.ids.set('p1', 'dup');
    e.tracker.refreshPanes();
    await e.tracker.scan();
    expect(e.tracker.paneSession('p1')?.tool?.summary).toBe('from-b');
    appendJsonl(a, [cl.tool('dup', e.now - 1_000, 't2', 'Bash', { command: 'a-newer' })], e.now - 1_000);
    await e.tracker.poll();
    expect(e.tracker.paneSession('p1')?.tool?.summary).toBe('a-newer');
  });
});

describe('start／stop', () => {
  it('stop 後馬上 start：在途的舊迴圈不續排，掃描與輪詢各只剩一條', async () => {
    vi.useFakeTimers();
    try {
      const e = setup();
      const t = new SessionTracker({ claudeDir: e.claudeDir, codexDir: e.codexDir, off: false, now: () => e.now, scanMs: 5000, pollMs: 1000 }, { projects: [{ name: 'proj', path: e.proj }], panes: () => [], sessionIds: () => new Map(), herdrUp: () => true });
      trackers.push(t);
      const gates: Array<() => void> = [];
      const scan = vi.spyOn(t, 'scan').mockImplementation(() => (gates.length < 2 ? new Promise<void>((r) => gates.push(r)) : Promise.resolve()));
      const poll = vi.spyOn(t, 'poll').mockResolvedValue(undefined);
      t.start();
      t.stop();
      t.start();
      expect(scan).toHaveBeenCalledTimes(2);
      for (const g of gates) g();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(scan).toHaveBeenCalledTimes(4);
      expect(poll).toHaveBeenCalledTimes(10);
    } finally {
      vi.useRealTimers();
    }
  });
});
