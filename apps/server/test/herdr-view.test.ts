import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Socket } from 'node:net';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { HerdrScreen, HerdrSearchResponse, HerdrView } from '@dash/shared';
import { herdrArgs, HerdrReader, searchLines, STRUCTURE_EVENTS, stripAnsi, toHerdrView } from '../src/herdr-view.ts';
import { createDashServer } from '../src/server.ts';
import { script, tmp, waitFor } from './helpers.ts';

const pane = (id: string, tab: string, ws: string, status: string, extra: Record<string, unknown> = {}) => ({
  pane_id: id,
  tab_id: tab,
  workspace_id: ws,
  agent: 'claude',
  agent_status: status,
  cwd: '/p',
  terminal_title_stripped: `title ${id}`,
  tokens: { model: 'opus 5.5', ctx_num: '22', cost: '$1.50' },
  ...extra,
});

const snapshot = {
  focused_workspace_id: 'wB',
  focused_tab_id: 'wB:t2',
  focused_pane_id: 'wB:p3',
  workspaces: [
    { workspace_id: 'wB', label: 'beta', number: 2, agent_status: 'working', active_tab_id: 'wB:t2' },
    { workspace_id: 'wA', label: 'alpha', number: 1, agent_status: 'idle', active_tab_id: 'wA:t1' },
  ],
  tabs: [
    { tab_id: 'wA:t1', workspace_id: 'wA', label: '1', number: 1, agent_status: 'idle' },
    { tab_id: 'wB:t1', workspace_id: 'wB', label: 'main', number: 1, agent_status: 'idle' },
    { tab_id: 'wB:t2', workspace_id: 'wB', label: 'split', number: 2, agent_status: 'working' },
  ],
  layouts: [
    { tab_id: 'wA:t1', area: { x: 0, y: 1, width: 100, height: 40 }, focused_pane_id: 'wA:p1', zoomed: false, panes: [{ pane_id: 'wA:p1', rect: { x: 0, y: 1, width: 100, height: 40 } }] },
    {
      tab_id: 'wB:t2',
      area: { x: 0, y: 1, width: 100, height: 40 },
      focused_pane_id: 'wB:p3',
      zoomed: true,
      panes: [
        { pane_id: 'wB:p2', rect: { x: 0, y: 1, width: 50, height: 40 } },
        { pane_id: 'wB:p3', rect: { x: 50, y: 1, width: 50, height: 40 } },
      ],
    },
  ],
  panes: [
    pane('wA:p1', 'wA:t1', 'wA', 'idle'),
    pane('wB:p2', 'wB:t2', 'wB', 'working', { scroll: { max_offset_from_bottom: 120, offset_from_bottom: 0, viewport_rows: 40 } }),
    pane('wB:p3', 'wB:t2', 'wB', 'blocked', { agent: null }),
  ],
  agents: [{ pane_id: 'wB:p2', name: 'dash-dev' }],
};
const stdout = JSON.stringify({ id: 'x', result: { type: 'snapshot', snapshot } });

describe('herdrArgs 唯讀白名單', () => {
  it('只組得出 snapshot 與 pane read', () => {
    expect(herdrArgs({ op: 'snapshot' })).toEqual(['api', 'snapshot']);
    expect(herdrArgs({ op: 'screen', paneId: 'wB:p3' })).toEqual(['pane', 'read', 'wB:p3', '--source', 'visible', '--format', 'ansi']);
  });

  it('recent 帶 lines（1..5000 整數），其他 source 不行', () => {
    expect(herdrArgs({ op: 'screen', paneId: 'wB:p3', source: 'recent', lines: 200 })).toEqual(['pane', 'read', 'wB:p3', '--source', 'recent', '--lines', '200', '--format', 'ansi']);
    for (const lines of [0, -1, 1.5, 5001]) expect(() => herdrArgs({ op: 'screen', paneId: 'wB:p3', source: 'recent', lines })).toThrow();
    expect(() => herdrArgs({ op: 'screen', paneId: 'wB:p3', source: 'detection' as never })).toThrow();
  });

  it('擋掉看起來像旗標或含怪字元的 pane id', () => {
    for (const id of ['--help', '-x', 'a b', 'a;rm', '', 'x'.repeat(80)]) expect(() => herdrArgs({ op: 'screen', paneId: id })).toThrow();
    expect(() => herdrArgs({ op: 'send-text' } as never)).toThrow();
  });
});

describe('toHerdrView', () => {
  const v = toHerdrView(stdout, 123);

  it('workspace 依 number 排序、tab 掛在自己的 workspace 下', () => {
    expect(v.generatedAt).toBe(123);
    expect(v.focused).toEqual({ workspaceId: 'wB', tabId: 'wB:t2', paneId: 'wB:p3' });
    expect(v.workspaces.map((w) => w.id)).toEqual(['wA', 'wB']);
    expect(v.workspaces[1].tabs.map((t) => t.id)).toEqual(['wB:t1', 'wB:t2']);
    expect(v.workspaces[1].status).toBe('working');
  });

  it('pane 帶相對於 area 的 rect、標題與 PaneLive 欄位', () => {
    const t = v.workspaces[1].tabs[1];
    expect(t).toMatchObject({ zoomed: true, focusedPaneId: 'wB:p3', area: { width: 100, height: 40 } });
    expect(t.panes.map((p) => [p.paneId, p.rect.x, p.rect.y, p.rect.width])).toEqual([
      ['wB:p2', 0, 0, 50],
      ['wB:p3', 50, 0, 50],
    ]);
    expect(t.panes[0]).toMatchObject({ name: 'dash-dev', status: 'working', title: 'title wB:p2', model: 'opus 5.5', ctxPct: 22, cost: 1.5 });
    expect(t.panes[1]).toMatchObject({ name: null, agent: null, status: 'blocked', scrollback: 0 });
    expect(t.panes[0].scrollback).toBe(120);
    expect(v.live).toBe(false);
  });

  it('沒有 layout 的 tab 仍列出，panes 為空', () => {
    expect(v.workspaces[1].tabs[0]).toMatchObject({ id: 'wB:t1', panes: [], focusedPaneId: null });
  });
});

/** 假 herdr：把每次呼叫的參數記進 calls.log */
function fakeBin() {
  const dir = tmp('dash-herdr-view-');
  const snap = join(dir, 'snap.json');
  const log = join(dir, 'calls.log');
  writeFileSync(snap, stdout);
  const bin = script(
    join(dir, 'herdr'),
    `echo "$*" >> ${log}
case "$1 $2" in
  "api snapshot") cat ${snap} ;;
  "pane read") printf '\\033[1mhi\\033[0m %s %s\\r\\n' "$3" "$5" ;;
  *) exit 9 ;;
esac`,
  );
  return { bin, calls: () => readFileSync(log, 'utf8').trim().split('\n') };
}

describe('HerdrReader', () => {
  it('ttl 內共用 snapshot，讀畫面前先確認 pane 存在', async () => {
    const f = fakeBin();
    let now = 0;
    const r = new HerdrReader({ bin: f.bin, off: false, now: () => now });
    await Promise.all([r.getView(), r.getView()]);
    expect((await r.getScreen('wB:p3')).ansi).toBe('\u001b[1mhi\u001b[0m wB:p3 visible\r\n');
    await expect(r.getScreen('wZ:p9')).rejects.toThrow();
    now = 5000;
    await r.getView();
    expect(f.calls()).toEqual(['api snapshot', 'pane read wB:p3 --source visible --format ansi', 'api snapshot']);
    expect((await r.getScreen('wB:p2', 'recent', 300)).ansi).toContain('wB:p2 recent');
    expect(f.calls().at(-1)).toBe('pane read wB:p2 --source recent --lines 300 --format ansi');
  });

  it('off 時直接失敗、不呼叫 herdr', async () => {
    const f = fakeBin();
    await expect(new HerdrReader({ bin: f.bin, off: true }).getView()).rejects.toThrow();
    expect(() => f.calls()).toThrow();
  });
});

describe('HTTP /api/herdr/*', () => {
  const make = (off = false) => {
    const f = fakeBin();
    const s = createDashServer({ config: { projects: [], pollMs: 60_000 }, herdr: { bin: f.bin, socket: '/nonexistent', off } });
    return { f, s };
  };

  it('view 與 screen 回 JSON', async () => {
    const { s } = make();
    const v = (await (await s.app.request('/api/herdr/view')).json()) as HerdrView;
    expect(v.workspaces).toHaveLength(2);
    const res = await s.app.request('/api/herdr/panes/wA:p1/screen');
    expect(res.status).toBe(200);
    expect(((await res.json()) as HerdrScreen).paneId).toBe('wA:p1');
  });

  it('不存在的 pane 404，herdr off 503，寫入方法一律 404', async () => {
    const { s, f } = make();
    expect((await s.app.request('/api/herdr/panes/nope/screen')).status).toBe(404);
    expect((await s.app.request('/api/herdr/panes/--help/screen')).status).toBe(404);
    for (const method of ['POST', 'PUT', 'DELETE']) expect((await s.app.request('/api/herdr/panes/wA:p1/screen', { method })).status).toBe(404);
    expect(f.calls().every((c) => c === 'api snapshot')).toBe(true);
    expect((await make(true).s.app.request('/api/herdr/view')).status).toBe(503);
  });

  it('source／lines 不合法回 400；recent 讀得到', async () => {
    const { s, f } = make();
    expect((await s.app.request('/api/herdr/panes/wA:p1/screen?source=detection')).status).toBe(400);
    expect((await s.app.request('/api/herdr/panes/wA:p1/screen?source=recent&lines=abc')).status).toBe(400);
    expect((await s.app.request('/api/herdr/panes/wA:p1/screen?source=recent&lines=99999')).status).toBe(400);
    const res = await s.app.request('/api/herdr/panes/wA:p1/screen?source=recent&lines=50');
    expect(res.status).toBe(200);
    expect(f.calls().at(-1)).toBe('pane read wA:p1 --source recent --lines 50 --format ansi');
  });
});

describe('HerdrReader 結構事件訂閱', () => {
  it('訂閱結構事件；事件來了（合併後）重抓 snapshot 發 view，內容沒變不重發；斷線後 live 轉 false', async () => {
    const f = fakeBin();
    const sockPath = join(tmp('dash-watch-'), 'h.sock');
    const clients: Socket[] = [];
    let req: { method: string; params: { subscriptions: { type: string }[] } } | null = null;
    const srv = createServer((c) => {
      clients.push(c);
      c.on('data', (d) => {
        req = JSON.parse(d.toString().split('\n')[0]);
        c.write(JSON.stringify({ id: 'dash-view-watch', result: { type: 'subscription_started' } }) + '\n');
      });
    });
    await new Promise<void>((r) => srv.listen(sockPath, () => r()));
    const r = new HerdrReader({ bin: f.bin, off: false, socket: sockPath, debounceMs: 20, backoffBaseMs: 10_000 });
    const views: HerdrView[] = [];
    r.on('view', (v: HerdrView) => views.push(v));
    try {
      r.start();
      await waitFor(() => views.length === 1);
      expect(req!.method).toBe('events.subscribe');
      expect(req!.params.subscriptions.map((x) => x.type)).toEqual(STRUCTURE_EVENTS);
      expect(views[0].live).toBe(true);
      expect(r.live).toBe(true);

      // 一串事件合併成一次 snapshot；snapshot 沒變不發
      const before = f.calls().length;
      for (let i = 0; i < 5; i++) clients[0].write(JSON.stringify({ event: 'tab.focused', data: { type: 'tab_focused' } }) + '\n');
      await new Promise((res) => setTimeout(res, 150));
      expect(f.calls().length).toBe(before + 1);
      expect(views).toHaveLength(1);

      // snapshot 變了才發
      writeFileSync(join(f.bin, '../snap.json'), JSON.stringify({ id: 'x', result: { type: 'snapshot', snapshot: { ...snapshot, workspaces: snapshot.workspaces.slice(0, 1) } } }));
      clients[0].write(JSON.stringify({ event: 'workspace.closed', data: { type: 'workspace_closed' } }) + '\n');
      await waitFor(() => views.length === 2);
      expect(views[1].workspaces.map((w) => w.id)).toEqual(['wB']);

      // 斷線：live=false 也發一次
      clients[0].destroy();
      await waitFor(() => views.length === 3);
      expect(views[2].live).toBe(false);
    } finally {
      r.stop();
      for (const c of clients) c.destroy();
      await new Promise((res) => srv.close(() => res(undefined)));
    }
  });

  it('訂閱送出後逾時沒回應 → 視同斷線並重連（debt AC20）', async () => {
    const f = fakeBin();
    const sockPath = join(tmp('dash-watch-'), 'h.sock');
    const clients: Socket[] = [];
    let requests = 0;
    const srv = createServer((c) => {
      clients.push(c);
      c.on('data', () => requests++); // 接受連線、收下請求，但永遠不回
    });
    await new Promise<void>((r) => srv.listen(sockPath, () => r()));
    const r = new HerdrReader({ bin: f.bin, off: false, socket: sockPath, debounceMs: 20, backoffBaseMs: 50, subscribeTimeoutMs: 150 });
    try {
      r.start();
      await waitFor(() => requests === 1);
      await waitFor(() => clients.length >= 2 && requests >= 2, 3000);
      expect(clients[0].destroyed || clients[0].readableEnded).toBe(true);
      expect(r.live).toBe(false);
    } finally {
      r.stop();
      for (const c of clients) c.destroy();
      await new Promise((res) => srv.close(() => res(undefined)));
    }
  });
});

it('可選參數給 undefined 時用預設值', () => {
  const r = new HerdrReader({ bin: 'x', off: false, backoffBaseMs: undefined, debounceMs: undefined });
  expect((r as unknown as { backoff: number }).backoff).toBe(1000);
});

it('notify()（HerdrBridge 的 pane 變動）也會重抓並發 view；stop 後不理', async () => {
  const f = fakeBin();
  const r = new HerdrReader({ bin: f.bin, off: false, socket: join(tmp('dash-nosock-'), 'none.sock'), debounceMs: 10, backoffBaseMs: 60_000 });
  const views: HerdrView[] = [];
  r.on('view', (v: HerdrView) => views.push(v));
  r.notify();
  await new Promise((res) => setTimeout(res, 50));
  expect(views).toHaveLength(0);
  r.start();
  r.notify();
  await waitFor(() => views.length === 1);
  expect(views[0].live).toBe(false);
  r.stop();
});

describe('搜尋', () => {
  it('stripAnsi 去掉 SGR／OSC／控制字元並切行；searchLines 不分大小寫、特殊字元照字面比', () => {
    expect(stripAnsi('\u001b[1;31mError\u001b[0m: x\r\n\u001b]0;t\u0007ok\u0007\r\n')).toEqual(['Error: x', 'ok', '']);
    expect(searchLines(['a.b', 'axb', 'A.B (x)'], '.b')).toEqual([0, 2]);
    expect(searchLines(['(x)+'], '(x)+')).toEqual([0]);
  });

  it('GET /api/herdr/search：每個 pane 讀一次，有歷史的讀 recent，回傳命中行', async () => {
    const f = fakeBin();
    const s = createDashServer({ config: { projects: [], pollMs: 60_000 }, herdr: { bin: f.bin, socket: '/nonexistent', off: false } });
    const res = await s.app.request('/api/herdr/search?q=HI%20wB');
    expect(res.status).toBe(200);
    const body = (await res.json()) as HerdrSearchResponse;
    expect(body.hits.map((h) => [h.paneId, h.line, h.text, h.history])).toEqual([
      ['wB:p2', 0, 'hi wB:p2 recent', true],
      ['wB:p3', 0, 'hi wB:p3 visible', false],
    ]);
    expect(body).toMatchObject({ q: 'HI wB', truncated: false, failed: [] });
    expect(f.calls().filter((c) => c.startsWith('pane read')).sort()).toEqual([
      'pane read wA:p1 --source visible --format ansi',
      'pane read wB:p2 --source recent --lines 160 --format ansi',
      'pane read wB:p3 --source visible --format ansi',
    ]);
  });

  it('空字串或太長回 400', async () => {
    const f = fakeBin();
    const s = createDashServer({ config: { projects: [], pollMs: 60_000 }, herdr: { bin: f.bin, socket: '/nonexistent', off: false } });
    expect((await s.app.request('/api/herdr/search?q=')).status).toBe(400);
    expect((await s.app.request('/api/herdr/search?q=%20%20')).status).toBe(400);
    expect((await s.app.request(`/api/herdr/search?q=${'x'.repeat(201)}`)).status).toBe(400);
  });
});

describe('pane 狀態清單單一來源（debt AC8）', () => {
  it('server 原始碼沒有手抄的狀態清單，都用 @dash/shared 的 PANE_STATUSES', () => {
    const src = join(import.meta.dirname, '../src');
    for (const f of readdirSync(src).filter((n) => n.endsWith('.ts'))) {
      expect(readFileSync(join(src, f), 'utf8'), f).not.toContain("'idle', 'working'");
    }
  });
});
