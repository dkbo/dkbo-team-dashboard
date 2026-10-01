import { join } from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { DetailDoc, ListDoc } from '@dash/shared';
import { edgeDetail, edgeList } from '../../../packages/shared/fixtures/index.ts';
import { PREFETCH_PER_ROUND, StatusCollector } from '../src/collector.ts';
import { OverlayManager } from '../src/overlay.ts';
import { ProjectRegistry } from '../src/registry.ts';
import { calls, fakeProject, miniProject, setFake, tmp, VENDOR_DIR, waitFor } from './helpers.ts';

const list = (over: Partial<ListDoc> = {}): ListDoc => ({ ...edgeList, generated_at: '__NOW__', ...over });
const detailOf = (dir: string, over: Record<string, unknown> = {}): DetailDoc => {
  const t = list().tasks.find((x) => x.dir === dir)!;
  return { ...edgeDetail, generated_at: '__NOW__', task: { ...edgeDetail.task, ...t, ...over } };
};
const details = () => ({
  '2026-09-20-nulls': detailOf('2026-09-20-nulls'),
  '2026-09-21-edge': detailOf('2026-09-21-edge'),
  '2026-09-23-gaveup': detailOf('2026-09-23-gaveup'),
});

const overlays: OverlayManager[] = [];
afterAll(() => overlays.forEach((o) => o.cleanupSync()));

function collector(projects: { name: string; path: string }[], timeoutMs = 2000, over: { pollMs?: number; now?: () => number } = {}) {
  const o = new OverlayManager({ vendorDir: VENDOR_DIR });
  overlays.push(o);
  return new StatusCollector({ registry: new ProjectRegistry(projects, o), pollMs: 60_000, timeoutMs, ...over });
}
const view = (c: StatusCollector, name: string) => c.projects().find((p) => p.name === name)!;

describe('DK_ROOT 隔離', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.DK_ROOT = '/definitely/wrong/.dkbo';
    process.env.DK_PROJECT_ROOT = '/definitely/wrong';
    process.env.HERDR_PANE_ID = 'wZ:p1';
    process.env.DK_AGENT = 'someone-backend';
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it('父行程環境帶 DK_ROOT 時，原生與相容專案各自讀到自己的任務', async () => {
    const a = miniProject(tmp(), { native: true, version: '0.17.0', tasks: ['2026-01-01-alpha', '2026-01-02-beta'] });
    const b = miniProject(tmp(), { version: '0.16.0', tasks: ['2026-02-01-gamma'] });
    process.env.DK_ROOT = join(a, '.dkbo'); // 最容易出事的情境：指到另一個真的專案
    const c = collector([
      { name: 'a', path: a },
      { name: 'b', path: b },
    ]);
    await Promise.all([c.pollOnce('a'), c.pollOnce('b')]);
    expect(view(c, 'a')).toMatchObject({ mode: 'native', dkboVersion: '0.17.0', error: null });
    expect(view(c, 'a').list!.tasks.map((t) => t.dir)).toEqual(['2026-01-01-alpha', '2026-01-02-beta']);
    expect(view(c, 'b')).toMatchObject({ mode: 'compat', dkboVersion: '0.16.0', error: null });
    expect(view(c, 'b').list!.tasks.map((t) => t.dir)).toEqual(['2026-02-01-gamma']);
    const d = await c.detail('b', '2026-02-01-gamma');
    expect(d.ok && d.doc.task.dir).toBe('2026-02-01-gamma');
  });
});

describe('錯誤態', () => {
  it('六種錯誤各自進錯誤態，其他專案照常', async () => {
    const good = fakeProject(tmp(), { list: list(), details: details() });
    const exit = fakeProject(tmp(), { list: list() });
    const json = fakeProject(tmp(), { list: list() });
    const schema = fakeProject(tmp(), { list: list() });
    const hang = fakeProject(tmp(), { list: list() });
    setFake(exit, 'mode', 'exit');
    setFake(json, 'mode', 'json');
    setFake(schema, 'mode', 'schema');
    setFake(hang, 'mode', 'hang');
    const c = collector(
      [
        { name: 'good', path: good },
        { name: 'missing', path: '/nonexistent/dash-missing' },
        { name: 'nodkbo', path: tmp() },
        { name: 'exit', path: exit },
        { name: 'json', path: json },
        { name: 'schema', path: schema },
        { name: 'hang', path: hang },
      ],
      400,
    );
    await Promise.all(c.projects().map((p) => c.pollOnce(p.name)));
    const errs = Object.fromEntries(c.projects().map((p) => [p.name, p.error]));
    expect(errs).toEqual({
      good: null,
      missing: { kind: 'missing', message: 'missing' },
      nodkbo: { kind: 'no-dkbo', message: 'no-dkbo' },
      exit: { kind: 'exit', message: 'dk: boom happened' },
      json: { kind: 'json', message: 'json' },
      schema: { kind: 'schema', message: 'schema' },
      hang: { kind: 'timeout', message: 'timeout' },
    });
    expect(view(c, 'good').list!.tasks).toHaveLength(4);
    expect(view(c, 'missing')).toMatchObject({ list: null, stale: false, fetchedAt: null, mode: null });
    expect(view(c, 'exit')).toMatchObject({ mode: 'native', dkboVersion: '0.17.0' });
  });

  it('有舊資料時保留並標 stale，fetchedAt 不動；恢復後清掉', async () => {
    const p = fakeProject(tmp(), { list: list(), details: details() });
    const c = collector([{ name: 'p', path: p }]);
    await c.pollOnce('p');
    const before = view(c, 'p');
    expect(before.fetchedAt).toBeTypeOf('number');
    setFake(p, 'mode', 'exit');
    await c.pollOnce('p');
    expect(view(c, 'p')).toMatchObject({ stale: true, error: { kind: 'exit' }, fetchedAt: before.fetchedAt });
    expect(view(c, 'p').list!.tasks).toHaveLength(4);
    expect(Object.keys(view(c, 'p').active)).toHaveLength(2);
    setFake(p, 'mode', null);
    await c.pollOnce('p');
    expect(view(c, 'p')).toMatchObject({ stale: false, error: null });
  });

  it('相容模式出錯時 mode 仍是 compat', async () => {
    const p = miniProject(tmp(), { version: '0.16.0', tasks: ['2026-01-01-a'] });
    // 用 1ms 逾時製造錯誤
    const c = collector([{ name: 'p', path: p }], 1);
    await c.pollOnce('p');
    expect(view(c, 'p')).toMatchObject({ mode: 'compat', dkboVersion: '0.16.0', error: { kind: 'timeout' } });
  });
});

describe('輪詢行為', () => {
  it('同一專案的 dk-status 不重疊執行（輪詢、detail、history 同時觸發）', async () => {
    const p = fakeProject(tmp(), { list: list(), details: details() });
    setFake(p, 'sleep', '0.05');
    const c = collector([{ name: 'p', path: p }]);
    await Promise.all([c.pollOnce('p'), c.pollOnce('p'), c.detail('p', '2026-09-23-gaveup'), c.history(), c.pollOnce('p')]);
    const log = calls(p);
    expect(log.length).toBeGreaterThan(4);
    let open = 0;
    for (const line of log) {
      open += line.startsWith('start') ? 1 : -1;
      expect(open).toBeLessThanOrEqual(1);
      expect(open).toBeGreaterThanOrEqual(0);
    }
  });

  it('只對 running／planning 抓 detail 放進 active', async () => {
    const p = fakeProject(tmp(), { list: list(), details: details() });
    const c = collector([{ name: 'p', path: p }]);
    await c.pollOnce('p');
    expect(Object.keys(view(c, 'p').active).sort()).toEqual(['2026-09-20-nulls', '2026-09-21-edge']);
    expect(view(c, 'p').active['2026-09-21-edge'].skipped_lines).toEqual({ process: 3, messages: 2 });
  });

  it('輸出沒變（只有 generated_at 變）不發 changed；變了才發，並對變動任務發 task', async () => {
    const p = fakeProject(tmp(), { list: list(), details: details() });
    const c = collector([{ name: 'p', path: p }]);
    const changed: string[] = [];
    const tasks: string[] = [];
    c.on('changed', (n: string) => changed.push(n));
    c.on('task', (t: { project: string; dir: string }) => tasks.push(`${t.project}/${t.dir}`));
    await c.pollOnce('p');
    await c.pollOnce('p');
    await c.pollOnce('p');
    expect(changed).toEqual(['p']);
    expect(tasks).toEqual([]);
    setFake(p, 'detail-2026-09-21-edge.json', JSON.stringify(detailOf('2026-09-21-edge', { current_wave: 3 })));
    await c.pollOnce('p');
    expect(changed).toEqual(['p', 'p']);
    expect(tasks).toEqual(['p/2026-09-21-edge']);
    const l = list();
    l.tasks = l.tasks.map((t) => (t.dir === '2026-09-22-mystery' ? { ...t, updated_at: '2026-09-22T12:00' } : t));
    setFake(p, 'list.json', JSON.stringify(l));
    await c.pollOnce('p');
    expect(changed).toEqual(['p', 'p', 'p']);
    expect(tasks).toEqual(['p/2026-09-21-edge', 'p/2026-09-22-mystery']);
  });

  it('start() 依 pollMs 自動輪詢，stop() 後不再跑', async () => {
    const p = fakeProject(tmp(), { list: list(), details: details() });
    setFake(p, 'sleep', '0.1'); // 模擬慢機器（WSL 負載高時每輪 spawn 很慢）：不得依賴固定時窗
    const o = new OverlayManager({ vendorDir: VENDOR_DIR });
    overlays.push(o);
    const c = new StatusCollector({ registry: new ProjectRegistry([{ name: 'p', path: p }], o), pollMs: 50, timeoutMs: 2000 });
    const listCalls = () => calls(p).filter((l) => l.startsWith('start') && l.includes(' list ')).length;
    c.start();
    await waitFor(() => listCalls() >= 3, 10_000);
    c.stop();
    const n = listCalls();
    await new Promise((r) => setTimeout(r, 300));
    expect(listCalls()).toBeLessThanOrEqual(n + 1);
  });
});

describe('已結案 detail 預抓（debt AC2）', () => {
  const gaveup = list().tasks.find((t) => t.dir === '2026-09-23-gaveup')!;
  const closedTasks = (n: number) => Array.from({ length: n }, (_, i) => ({ ...gaveup, dir: `2026-09-01-c${i}`, short: `c${i}` }));
  const running: StatusCollector[] = [];
  afterEach(() => running.splice(0).forEach((c) => c.stop()));

  it('list 壞掉時錯誤態在一個 pollMs 週期內出現，不被排隊中的預抓拖延', async () => {
    const tasks = closedTasks(30);
    const p = fakeProject(tmp(), {
      list: list({ tasks }),
      details: Object.fromEntries(tasks.map((t) => [t.dir, { ...edgeDetail, task: { ...edgeDetail.task, ...t } }])),
    });
    setFake(p, 'sleep-detail', '0.1'); // 全部預抓一輪要 3 秒
    const pollMs = 800;
    const c = collector([{ name: 'p', path: p }], 2000, { pollMs });
    running.push(c);
    c.start();
    await waitFor(() => view(c, 'p').list);
    setFake(p, 'list.json', '{broken');
    await waitFor(() => view(c, 'p').error, 10_000);
    expect(view(c, 'p').error).toMatchObject({ kind: 'json' });
    // 以呼叫數判定而非絕對時間（機器忙時 fork 變慢）：下一輪 list 只排在這一輪的限量預抓之後，
    // 修正前會等 30 個預抓全跑完才輪到它
    const detailStarts = calls(p).filter((l) => /^start \d+ 2026-09-01-c/.test(l)).length;
    expect(detailStarts).toBeLessThanOrEqual(2 * PREFETCH_PER_ROUND);
  });

  it('預抓失敗的 dir 60 秒內不重抓，過了才再試', async () => {
    const tasks = closedTasks(1);
    const p = fakeProject(tmp(), { list: list({ tasks }) }); // 沒有 detail 檔 → exit 1
    let now = 1_000_000;
    const c = collector([{ name: 'p', path: p }], 2000, { pollMs: 50, now: () => now });
    running.push(c);
    const detailCalls = () => calls(p).filter((l) => l.includes(' 2026-09-01-c0 ')).length;
    c.start();
    await waitFor(() => detailCalls() === 1);
    await new Promise((r) => setTimeout(r, 500)); // 約 10 輪
    await c.history();
    expect(detailCalls()).toBe(1);
    now += 60_001;
    await waitFor(() => detailCalls() === 2, 2000);
  });
});

describe('detail 與 history', () => {
  it('找不到任務或專案 → 404；其他失敗 → 502', async () => {
    const p = fakeProject(tmp(), { list: list(), details: details() });
    const c = collector([
      { name: 'p', path: p },
      { name: 'gone', path: '/nonexistent/dash-gone' },
    ]);
    await c.pollOnce('p');
    expect(await c.detail('p', 'nope')).toMatchObject({ ok: false, status: 404 });
    expect(await c.detail('zzz', 'x')).toMatchObject({ ok: false, status: 404 });
    expect(await c.detail('gone', 'x')).toMatchObject({ ok: false, status: 502, error: { kind: 'missing' } });
  });

  it('進行中任務直接用 active 的 detail，不另跑 dk-status', async () => {
    const p = fakeProject(tmp(), { list: list(), details: details() });
    const c = collector([{ name: 'p', path: p }]);
    await c.pollOnce('p');
    const n = calls(p).length;
    const d = await c.detail('p', '2026-09-21-edge');
    expect(d.ok && d.doc.task.dir).toBe('2026-09-21-edge');
    expect(calls(p).length).toBe(n);
  });

  it('已結案 detail 抓一次並依 closed_at 快取；closed_at 變才重抓', async () => {
    const p = fakeProject(tmp(), { list: list(), details: details() });
    const c = collector([{ name: 'p', path: p }]);
    await c.pollOnce('p');
    const gaveupCalls = () => calls(p).filter((l) => l.startsWith('start') && l.includes('2026-09-23-gaveup')).length;
    const h1 = await c.history();
    await c.history();
    await c.detail('p', '2026-09-23-gaveup');
    expect(gaveupCalls()).toBe(1);
    expect(h1.map((r) => [r.project, r.dir, r.status])).toEqual([['p', '2026-09-23-gaveup', 'abandoned']]);
    const l = list();
    l.tasks = l.tasks.map((t) => (t.dir === '2026-09-23-gaveup' ? { ...t, closed_at: '2026-09-24T09:00' } : t));
    setFake(p, 'list.json', JSON.stringify(l));
    await c.pollOnce('p');
    await c.history();
    expect(gaveupCalls()).toBe(2);
  });

  it('history 依 closedAt 降冪合併各專案', async () => {
    const mk = (closed: string) => {
      const l = list();
      l.tasks = l.tasks.map((t) => (t.dir === '2026-09-23-gaveup' ? { ...t, closed_at: closed } : t));
      const d = details();
      d['2026-09-23-gaveup'] = { ...d['2026-09-23-gaveup'], task: { ...d['2026-09-23-gaveup'].task, closed_at: closed } };
      return fakeProject(tmp(), { list: l, details: d });
    };
    const c = collector([
      { name: 'old', path: mk('2026-09-01T10:00') },
      { name: 'new', path: mk('2026-09-10T10:00') },
    ]);
    await Promise.all([c.pollOnce('old'), c.pollOnce('new')]);
    expect((await c.history()).map((r) => r.project)).toEqual(['new', 'old']);
  });
});
