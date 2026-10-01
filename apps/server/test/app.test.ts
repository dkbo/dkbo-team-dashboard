import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server, type Socket } from 'node:net';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { DetailDoc, HistoryResponse, ListDoc, OverviewDoc, PaneLive, SseEvent, TaskDetailResponse } from '@dash/shared';
import { edgeDetail, edgeList } from '../../../packages/shared/fixtures/index.ts';
import { createDashServer, listen, type DashServer } from '../src/server.ts';
import { calls, fakeProject, script, setFake, tmp, VENDOR_DIR, waitFor } from './helpers.ts';

const list = (): ListDoc => ({ ...edgeList, generated_at: '__NOW__' });
const detailOf = (dir: string, over: Record<string, unknown> = {}): DetailDoc => {
  const t = list().tasks.find((x) => x.dir === dir)!;
  return { ...edgeDetail, generated_at: '__NOW__', task: { ...edgeDetail.task, ...t, ...over } };
};
const details = () => ({
  '2026-09-20-nulls': detailOf('2026-09-20-nulls'),
  '2026-09-21-edge': detailOf('2026-09-21-edge'),
  '2026-09-23-gaveup': detailOf('2026-09-23-gaveup'),
});

const herdrPane = (id: string, status: string, cwd: string, tokens: Record<string, string> = {}) => ({
  pane_id: id,
  tab_id: 'wX:t9',
  workspace_id: 'wX',
  terminal_id: 't',
  focused: false,
  revision: 1,
  agent: 'claude',
  agent_status: status,
  cwd,
  tokens,
});

interface FakeHerdr {
  bin: string;
  sock: string;
  server: Server;
  clients: Socket[];
  push(ev: unknown): void;
  close(): Promise<void>;
}

async function fakeHerdr(panes: unknown[]): Promise<FakeHerdr> {
  const dir = tmp('dash-herdr-');
  const snap = join(dir, 'snap.json');
  writeFileSync(snap, JSON.stringify({ id: 'x', result: { type: 'snapshot', snapshot: { panes, agents: [{ pane_id: 'wX:p1', name: 'edge-dev' }] } } }));
  const f: FakeHerdr = {
    bin: script(join(dir, 'herdr'), `cat ${snap}`),
    sock: join(dir, 'herdr.sock'),
    server: createServer(),
    clients: [],
    push(ev) {
      for (const c of f.clients) c.write(JSON.stringify(ev) + '\n');
    },
    close() {
      for (const c of f.clients) c.destroy();
      return new Promise((r) => f.server.close(() => r()));
    },
  };
  f.server.on('connection', (c) => {
    f.clients.push(c);
    c.on('close', () => f.clients.splice(f.clients.indexOf(c), 1));
    c.on('data', (d) => {
      const req = JSON.parse(d.toString().split('\n')[0]) as { id: string };
      c.write(JSON.stringify({ id: req.id, result: { type: 'subscription_started' } }) + '\n');
    });
  });
  await new Promise<void>((r) => f.server.listen(f.sock, () => r()));
  return f;
}

/** 讀 SSE 串流，把收到的事件累積在 events */
function sse(s: DashServer) {
  const ac = new AbortController();
  const events: SseEvent[] = [];
  const done = (async () => {
    const res = await s.app.request('/api/stream', { signal: ac.signal });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const ev = /^event: (.*)$/m.exec(frame)?.[1];
        const data = /^data: (.*)$/m.exec(frame)?.[1];
        if (ev && data) events.push({ event: ev, data: JSON.parse(data) } as SseEvent);
      }
    }
  })();
  return { events, stop: () => ac.abort(), done, of: <N extends SseEvent['event']>(n: N) => events.filter((e) => e.event === n) as Extract<SseEvent, { event: N }>[] };
}

const servers: DashServer[] = [];
const herdrs: FakeHerdr[] = [];
afterEach(async () => {
  servers.splice(0).forEach((s) => s.stop());
  await Promise.all(herdrs.splice(0).map((h) => h.close()));
});

async function setup(opts: { herdr?: 'off' | 'fake' } = {}) {
  const root = fakeProject(tmp(), { list: list(), details: details() });
  let h: FakeHerdr | null = null;
  if (opts.herdr !== 'off') {
    h = await fakeHerdr([
      herdrPane('wX:p1', 'working', '/elsewhere', { cost: '$1.5', usage_session_num: '30', usage_period_num: '20' }),
      herdrPane('wX:p2', 'idle', join(root, '.worktrees/edge')),
      herdrPane('wX:p3', 'idle', root),
    ]);
    herdrs.push(h);
  }
  const s = createDashServer({
    config: { projects: [{ name: 'edge', path: root }, { name: 'gone', path: '/nonexistent/dash-gone' }], pollMs: 100 },
    herdr: h ? { bin: h.bin, socket: h.sock, off: false, pollMs: 100, backoffBaseMs: 50 } : { bin: 'herdr', socket: '/nonexistent.sock', off: true },
    vendorDir: VENDOR_DIR,
    timeoutMs: 3000,
    debounceMs: 20,
  });
  servers.push(s);
  return { s, root, h };
}

const overview = async (s: DashServer) => (await (await s.app.request('/api/overview')).json()) as OverviewDoc;

describe('HTTP API', () => {
  it('GET /api/overview：各專案、錯誤態、pane 對應、usage、herdr 燈', async () => {
    const { s } = await setup();
    s.start();
    const doc = await waitFor(async () => {
      const d = await overview(s);
      return d.projects[0].list && d.herdr.state === 'subscribed' && d.projects[0].panes.length === 2 ? d : null;
    });
    expect(doc.projects.map((p) => [p.name, p.error?.kind ?? null])).toEqual([
      ['edge', null],
      ['gone', 'missing'],
    ]);
    expect(Object.keys(doc.projects[0].active).sort()).toEqual(['2026-09-20-nulls', '2026-09-21-edge']);
    expect(doc.projects[0].panes.map((p) => [p.paneId, p.member, p.name])).toEqual([
      ['wX:p1', 'dev', 'edge-dev'],
      ['wX:p2', 'qa', null],
    ]);
    expect(doc.projects[0].otherPanes.map((p) => p.paneId)).toEqual(['wX:p3']);
    expect(doc.usage).toEqual({ claude: { fiveHourPct: 30, weekPct: 20 } });
    expect(doc.kindsDown.map((k) => [k.kind, k.project])).toEqual([['codex', 'edge']]);
    expect(doc.generatedAt).toBeGreaterThan(Date.now() - 5000);
  });

  it('GET /api/projects/:name/tasks/:dir：200 帶 panes、404 找不到', async () => {
    const { s } = await setup();
    s.start();
    await waitFor(async () => (await overview(s)).projects[0].panes.length === 2);
    const res = await s.app.request('/api/projects/edge/tasks/2026-09-21-edge');
    expect(res.status).toBe(200);
    const body = (await res.json()) as TaskDetailResponse;
    expect(body.project).toBe('edge');
    expect(body.detail.task.dir).toBe('2026-09-21-edge');
    expect(body.panes.map((p) => p.member)).toEqual(['dev', 'qa']);
    expect((await s.app.request('/api/projects/edge/tasks/nope')).status).toBe(404);
    expect((await s.app.request('/api/projects/zzz/tasks/x')).status).toBe(404);
    const closed = (await (await s.app.request('/api/projects/edge/tasks/2026-09-23-gaveup')).json()) as TaskDetailResponse;
    expect(closed.detail.task.status).toBe('abandoned');
  });

  it('dir 不合格回 404 missing、不跑 dk-status；合格的照舊（debt AC4）', async () => {
    const { s, root } = await setup({ herdr: 'off' });
    const bad = ['%2E%2E', 'x%2E%2Ey', 'a%2Fb', '..%2F..%2Fetc', 'ABC', 'a%20b', '-lead', `a${'b'.repeat(64)}`, '2026-09-23-Gaveup', 'x.y'];
    for (const d of bad) {
      const res = await s.app.request(`/api/projects/edge/tasks/${d}`);
      expect(res.status, d).toBe(404);
      expect(await res.json(), d).toMatchObject({ error: { kind: 'missing' } });
    }
    expect(calls(root)).toEqual([]);
    expect((await s.app.request('/api/projects/edge/tasks/2026-09-23-gaveup')).status).toBe(200);
    expect((await s.app.request('/api/projects/edge/tasks/nope')).status).toBe(404);
    expect(calls(root).filter((l) => l.startsWith('start'))).toHaveLength(2);
  });

  it('同時開 20 條 /api/stream 不印 MaxListenersExceededWarning（debt AC3）', async () => {
    const { s } = await setup({ herdr: 'off' });
    const warnings: Error[] = [];
    const onWarning = (w: Error) => warnings.push(w);
    process.on('warning', onWarning);
    const streams = Array.from({ length: 20 }, () => sse(s));
    try {
      await waitFor(() => s.hub.listenerCount('sse') === 20);
      await new Promise((r) => setTimeout(r, 50));
      expect(warnings.filter((w) => w.name === 'MaxListenersExceededWarning')).toEqual([]);
    } finally {
      process.off('warning', onWarning);
      streams.forEach((x) => x.stop());
      await Promise.all(streams.map((x) => x.done));
    }
    await waitFor(() => s.hub.listenerCount('sse') === 0);
  });

  it('GET /api/history', async () => {
    const { s } = await setup({ herdr: 'off' });
    s.start();
    await waitFor(async () => (await overview(s)).projects[0].list !== null);
    const body = (await (await s.app.request('/api/history')).json()) as HistoryResponse;
    expect(body.tasks.map((t) => [t.project, t.dir])).toEqual([['edge', '2026-09-23-gaveup']]);
  });

  it('DASH_HERDR=off：任務資料照常、herdr 燈 down', async () => {
    const { s } = await setup({ herdr: 'off' });
    s.start();
    const doc = await waitFor(async () => {
      const d = await overview(s);
      return d.projects[0].list ? d : null;
    });
    expect(doc.herdr.state).toBe('down');
    expect(doc.projects[0].list!.tasks).toHaveLength(4);
    expect(doc.projects[0].panes).toEqual([]);
  });
});

describe('SSE：輪詢 → 推送、去重、斷線回退', () => {
  it('連上立刻寫 `: connected` 註解（proxy 才會送出 header，EventSource 才會 open）', async () => {
    const { s } = await setup({ herdr: 'off' });
    const ac = new AbortController();
    const res = await s.app.request('/api/stream', { signal: ac.signal });
    const reader = res.body!.getReader();
    const first = await Promise.race([
      reader.read().then((r) => new TextDecoder().decode(r.value)),
      new Promise<string>((r) => setTimeout(() => r('<nothing within 1s>'), 1000)),
    ]);
    ac.abort();
    await reader.cancel().catch(() => undefined);
    expect(first).toBe(': connected\n\n');
  });

  it('輸出沒變時不推 overview.updated；變了才推，並推 task.updated', async () => {
    const { s, root } = await setup({ herdr: 'off' });
    const st = sse(s);
    s.start();
    await waitFor(() => st.of('overview.updated').some((e) => e.data.projects[0].list !== null), 5000);
    await new Promise((r) => setTimeout(r, 700)); // 約 7 輪輪詢，generated_at 每輪都變
    const n = st.of('overview.updated').length;
    await new Promise((r) => setTimeout(r, 500));
    expect(st.of('overview.updated').length).toBe(n);
    setFake(root, 'detail-2026-09-21-edge.json', JSON.stringify(detailOf('2026-09-21-edge', { current_wave: 3 })));
    await waitFor(() => st.of('task.updated').some((e) => e.data.dir === '2026-09-21-edge'), 3000);
    await waitFor(() => st.of('overview.updated').length > n, 3000);
    expect(st.of('overview.updated').at(-1)!.data.projects[0].active['2026-09-21-edge'].current_wave).toBe(3);
    st.stop();
  });

  it('herdr 狀態改變 2 秒內推 pane.updated（帶成員對應），不另推 overview', async () => {
    const { s, h, root } = await setup();
    const st = sse(s);
    s.start();
    await waitFor(async () => {
      const d = await overview(s);
      return d.herdr.state === 'subscribed' && d.projects[0].panes.length === 2;
    }, 5000);
    await new Promise((r) => setTimeout(r, 300));
    const n = st.of('overview.updated').length;
    const t0 = Date.now();
    h!.push({ event: 'pane_updated', data: { type: 'pane_updated', pane: { ...herdrPane('wX:p2', 'blocked', join(root, '.worktrees/edge')), revision: 2 } } });
    const ev = await waitFor(() => st.of('pane.updated').find((e) => e.data.paneId === 'wX:p2' && e.data.status === 'blocked'), 2000);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(ev.data).toMatchObject<Partial<PaneLive>>({ taskDir: '2026-09-21-edge', member: 'qa' });
    expect(st.of('overview.updated').length).toBe(n);
    expect((await overview(s)).projects[0].panes.find((p) => p.paneId === 'wX:p2')!.status).toBe('blocked');
    st.stop();
  });

  it('不屬於任何專案的 agent 也推 pane.updated，並列在 overview.agents', async () => {
    const { s, h } = await setup();
    const st = sse(s);
    s.start();
    await waitFor(async () => (await overview(s)).herdr.state === 'subscribed', 5000);
    expect((await overview(s)).agents.find((a) => a.paneId === 'wX:p1')).toMatchObject({ project: null, status: 'working' });
    await new Promise((r) => setTimeout(r, 300));
    h!.push({ event: 'pane_updated', data: { type: 'pane_updated', pane: { ...herdrPane('wX:p1', 'blocked', '/elsewhere', { cost: '$1.5', usage_session_num: '30', usage_period_num: '20' }), revision: 2 } } });
    await waitFor(() => st.of('pane.updated').find((e) => e.data.paneId === 'wX:p1' && e.data.status === 'blocked'), 2000);
    st.stop();
  });

  it('herdr 訂閱斷線：推 overview.updated，herdr.state 轉 polling', async () => {
    const { s, h } = await setup();
    const st = sse(s);
    s.start();
    await waitFor(() => st.of('overview.updated').some((e) => e.data.herdr.state === 'subscribed'), 5000);
    await h!.close();
    herdrs.splice(herdrs.indexOf(h!), 1);
    await waitFor(() => st.of('overview.updated').at(-1)?.data.herdr.state === 'polling', 3000);
    st.stop();
  });
});

describe('唯讀可驗證（AC10）', () => {
  it('server 只 listen 127.0.0.1', async () => {
    const { s } = await setup({ herdr: 'off' });
    const srv = await listen(s.app, 0);
    try {
      const addr = srv.address();
      expect(typeof addr === 'object' && addr?.address).toBe('127.0.0.1');
    } finally {
      await new Promise((r) => srv.close(r));
    }
  });

  it('程式碼對 herdr 的呼叫只有 api snapshot、pane read（herdrArgs 白名單）與 events.subscribe', () => {
    const dir = join(import.meta.dirname, '../src');
    const src = readdirSync(dir)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => readFileSync(join(dir, f), 'utf8'))
      .join('\n');
    expect(new Set([...src.matchAll(/method:\s*'([^']+)'/g)].map((m) => m[1]))).toEqual(new Set(['events.subscribe']));
    const execs = [...src.matchAll(/execFile\(\s*this\.o\.bin,\s*(\[[^\]]*\]|\w+)/g)].map((m) => m[1]).sort();
    expect(execs).toEqual(["['api', 'snapshot']", 'args']);
    // 唯一用變數當參數的是 HerdrReader.run，參數只來自 herdrArgs
    expect(src).toMatch(/const args = herdrArgs\(r\);\s*return new Promise\(\(resolve, reject\) => \{\s*execFile\(this\.o\.bin, args,/);
    expect([...src.matchAll(/return \['([a-z]+)', '([a-z]+)'/g)].map((m) => `${m[1]} ${m[2]}`).sort()).toEqual(['api snapshot', 'pane read', 'pane read']);
    expect(src).not.toMatch(/agent\.prompt|send_keys|sendKeys|pane\.focus(?!ed)|agent focus/); // pane.focused 是事件
  });
});
