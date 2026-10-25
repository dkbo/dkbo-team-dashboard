// AC4／AC5：session 資料經 API 與 SSE 推出（fixture 目錄＋假 herdr，不碰真實 home）
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer, type Server, type Socket } from 'node:net';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { DetailDoc, HerdrView, ListDoc, OverviewDoc, SessionsDoc, SseEvent, TaskDetailResponse } from '@dash/shared';
import { edgeDetail, edgeList } from '../../../packages/shared/fixtures/index.ts';
import { createDashServer, type DashServer } from '../src/server.ts';
import { appendJsonl, cl, claudeFile, codexFile, cx, writeJsonl } from './session-fixtures.ts';
import { fakeProject, script, tmp, VENDOR_DIR, waitFor } from './helpers.ts';

const list = (): ListDoc => ({ ...edgeList, generated_at: '__NOW__' });
const detailOf = (dir: string): DetailDoc => {
  const t = list().tasks.find((x) => x.dir === dir)!;
  return { ...edgeDetail, generated_at: '__NOW__', task: { ...edgeDetail.task, ...t } };
};

interface FakeHerdr {
  bin: string;
  sock: string;
  server: Server;
  clients: Socket[];
  close(): Promise<void>;
}

async function fakeHerdr(snapshot: unknown): Promise<FakeHerdr> {
  const dir = tmp('dash-herdr-');
  const snap = join(dir, 'snap.json');
  writeFileSync(snap, JSON.stringify({ id: 'x', result: { type: 'snapshot', snapshot } }));
  // 只回 snapshot 與 pane read（畫面）；其他呼叫一律失敗
  const bin = script(join(dir, 'herdr'), `case "$1 $2" in\n  "api snapshot") cat ${snap};;\n  "pane read") printf '│ Do you want to proceed? │';;\n  *) exit 9;;\nesac`);
  const f: FakeHerdr = {
    bin,
    sock: join(dir, 'herdr.sock'),
    server: createServer(),
    clients: [],
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

function sse(s: DashServer) {
  const ac = new AbortController();
  const events: (SseEvent & { at: number })[] = [];
  const done = (async () => {
    const res = await s.app.request('/api/stream', { signal: ac.signal });
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
        if (ev && data) events.push({ event: ev, data: JSON.parse(data), at: Date.now() } as SseEvent & { at: number });
      }
    }
  })();
  return { events, stop: () => ac.abort(), done, of: <N extends SseEvent['event']>(n: N) => events.filter((e) => e.event === n) as (Extract<SseEvent, { event: N }> & { at: number })[] };
}

const servers: DashServer[] = [];
const herdrs: FakeHerdr[] = [];
const streams: ReturnType<typeof sse>[] = [];
afterEach(async () => {
  streams.splice(0).forEach((x) => x.stop());
  servers.splice(0).forEach((s) => s.stop());
  await Promise.all(herdrs.splice(0).map((h) => h.close()));
});

const hp = (id: string, agent: string, status: string, cwd: string, sessionId: string | null, tokens: Record<string, string> = {}, tab = 'wX:t1') => ({
  pane_id: id,
  tab_id: tab,
  workspace_id: 'wX',
  terminal_id: 't',
  focused: false,
  revision: 1,
  agent,
  agent_status: status,
  cwd,
  tokens,
  ...(sessionId ? { agent_session: { agent, kind: 'id', source: `herdr:${agent}`, value: sessionId } } : {}),
});

async function setup(opts: { sessions?: boolean } = {}) {
  const root = fakeProject(tmp(), { list: list(), details: { '2026-09-21-edge': detailOf('2026-09-21-edge'), '2026-09-20-nulls': detailOf('2026-09-20-nulls') } });
  for (const r of ['dev', 'qa']) {
    mkdirSync(join(root, '.dkbo/roles'), { recursive: true });
    writeFileSync(join(root, '.dkbo/roles', `${r}.md`), '---\nname: x\n---\n');
  }
  const home = tmp('dash-home-');
  const claudeDir = join(home, 'claude');
  const codexDir = join(home, 'codex');
  const wt = join(root, '.worktrees/edge');
  const now = Date.now();
  const files = {
    dev: writeJsonl(claudeFile(claudeDir, wt, 'c-dev'), [cl.meta('c-dev', wt, now - 60_000), cl.prompt('c-dev', wt, now - 50_000), cl.apiError('c-dev', now - 40_000)], now - 40_000),
    lead: writeJsonl(claudeFile(claudeDir, root, 'c-lead'), [cl.prompt('c-lead', root, now - 30_000), cl.thinking('c-lead', now - 20_000)], now - 20_000),
    free: writeJsonl(claudeFile(claudeDir, root, 'c-free'), [cl.agentName('c-free', 'edge-writer'), cl.prompt('c-free', root, now - 30_000), cl.text('c-free', now - 25_000)], now - 25_000),
    qa: writeJsonl(codexFile(codexDir, now - 3 * 86400_000, 'x-qa'), [cx.meta('x-qa', wt, now - 3 * 86400_000), cx.context(now - 60_000), cx.started(now - 50_000), cx.call(now - 40_000, 'c1', 'pnpm test')], now - 40_000),
  };
  const panes = [
    hp('wX:p1', 'claude', 'blocked', wt, 'c-dev', { cost: '$1.5', ctx_num: '40', effort: 'high', model: 'opus' }),
    hp('wX:p2', 'codex', 'working', wt, null),
    hp('wX:p4', 'claude', 'working', root, 'c-lead'),
    hp('wX:p5', 'claude', 'idle', '/elsewhere', null),
  ];
  const h = await fakeHerdr({
    panes,
    agents: [
      { pane_id: 'wX:p1', name: 'edge-dev' },
      { pane_id: 'wX:p4', name: 'leader-edge' },
    ],
    workspaces: [{ workspace_id: 'wX', label: 'x', number: 1, agent_status: 'working', active_tab_id: 'wX:t1' }],
    tabs: [{ tab_id: 'wX:t1', workspace_id: 'wX', label: 't', number: 1, agent_status: 'working' }],
    layouts: [],
  });
  herdrs.push(h);
  const s = createDashServer({
    config: { projects: [{ name: 'edge', path: root }], pollMs: 100 },
    herdr: { bin: h.bin, socket: h.sock, off: false, pollMs: 100, backoffBaseMs: 50 },
    vendorDir: VENDOR_DIR,
    timeoutMs: 3000,
    debounceMs: 20,
    ...(opts.sessions === false ? {} : { sessions: { claudeDir, codexDir, off: false } }),
  });
  servers.push(s);
  return { s, root, wt, files, now };
}

const get = async <T>(s: DashServer, path: string) => (await (await s.app.request(path)).json()) as T;
const ready = (s: DashServer) =>
  waitFor(async () => {
    const d = await get<SessionsDoc>(s, '/api/sessions');
    const o = await get<OverviewDoc>(s, '/api/overview');
    return d.sessions.length === 4 && o.projects[0].panes.length === 2 && o.projects[0].panes.every((p) => p.session) ? { d, o } : null;
  }, 8000);

describe('AC5 API', () => {
  it('GET /api/sessions：project／taskDir／member／role／leader 對應正確', async () => {
    const { s, root, wt } = await setup();
    s.start();
    const { d } = await ready(s);
    const by = Object.fromEntries(d.sessions.map((x) => [x.id, x]));
    expect(Object.keys(by).sort()).toEqual(['s:c-free', 'wX:p1', 'wX:p2', 'wX:p4']);
    expect(by['wX:p1']).toMatchObject({
      kind: 'claude',
      sessionId: 'c-dev',
      paneId: 'wX:p1',
      project: 'edge',
      cwd: wt,
      taskDir: '2026-09-21-edge',
      member: 'dev',
      role: 'dev',
      leader: false,
      agentName: 'edge-dev',
      effort: 'high',
      cost: 1.5,
      ctxPct: 40,
      substate: 'error',
      error: 'API Error: Connection lost mid-response.',
    });
    expect(by['wX:p2']).toMatchObject({ kind: 'codex', sessionId: 'x-qa', taskDir: '2026-09-21-edge', member: 'qa', role: 'qa', substate: 'running', tool: { name: 'exec_command', summary: 'pnpm test' } });
    expect(by['wX:p4']).toMatchObject({ sessionId: 'c-lead', leader: true, role: 'leader', taskDir: '2026-09-21-edge', member: null, agentName: 'leader-edge', cwd: root, substate: 'thinking' });
    expect(by['s:c-free']).toMatchObject({ paneId: null, agentName: 'edge-writer', member: 'writer', taskDir: '2026-09-21-edge', role: null, substate: 'done' });
    expect(d.generatedAt).toBeGreaterThan(Date.now() - 10_000);
  });

  it('PaneLive.session 帶在 overview（panes／otherPanes／agents）、任務詳情與 herdr view；error 的 pane status 回 blocked', async () => {
    const { s } = await setup();
    s.start();
    const { o } = await ready(s);
    const p1 = o.projects[0].panes.find((p) => p.paneId === 'wX:p1')!;
    expect(p1).toMatchObject({ status: 'blocked', session: { substate: 'error', sessionId: 'c-dev' } });
    expect(o.projects[0].otherPanes.find((p) => p.paneId === 'wX:p4')?.session).toMatchObject({ sessionId: 'c-lead' });
    expect(o.agents.find((a) => a.paneId === 'wX:p2')?.session).toMatchObject({ sessionId: 'x-qa', substate: 'running' });
    expect(o.agents.find((a) => a.paneId === 'wX:p5')?.session).toBeNull();
    const t = await get<TaskDetailResponse>(s, '/api/projects/edge/tasks/2026-09-21-edge');
    expect(t.panes.find((p) => p.paneId === 'wX:p1')).toMatchObject({ status: 'blocked', session: { substate: 'error' } });
    const v = await get<HerdrView>(s, '/api/herdr/view');
    const vp = v.workspaces[0].tabs[0].panes;
    expect(vp.find((p) => p.paneId === 'wX:p1')).toMatchObject({ status: 'blocked', session: { substate: 'error' } });
    expect(vp.find((p) => p.paneId === 'wX:p2')?.session).toMatchObject({ substate: 'running' });
  });

  it('JSONL 最後是 API error 且 herdr 回 blocked → 細狀態 error、pane status blocked（不被覆寫成 waiting）', async () => {
    const { s } = await setup();
    s.start();
    const { o } = await ready(s);
    const p1 = o.projects[0].panes.find((p) => p.paneId === 'wX:p1')!;
    expect([p1.session?.substate, p1.status, p1.session?.question]).toEqual(['error', 'blocked', null]);
  });

  it('提示詞、回覆、工具輸出原文不出現在 API 輸出', async () => {
    const { s } = await setup();
    s.start();
    await ready(s);
    const all = [
      JSON.stringify(await get(s, '/api/sessions')),
      JSON.stringify(await get(s, '/api/overview')),
      JSON.stringify(await get(s, '/api/herdr/view')),
      JSON.stringify(await get(s, '/api/projects/edge/tasks/2026-09-21-edge')),
    ].join('\n');
    for (const secret of ['FAKE-PROMPT', 'FAKE-REPLY', 'FAKE-OUTPUT', 'FAKE-THOUGHT', 'FAKE-INSTRUCTIONS']) expect(all).not.toContain(secret);
  });

  it('沒給 sessions 設定（DASH_SESSIONS=off）：/api/sessions 回空、PaneLive.session 恆 null', async () => {
    const { s } = await setup({ sessions: false });
    s.start();
    const o = await waitFor(async () => {
      const x = await get<OverviewDoc>(s, '/api/overview');
      return x.projects[0].panes.length === 2 ? x : null;
    });
    expect(o.agents.map((a) => a.session)).toEqual([null, null, null, null]);
    expect(o.projects[0].panes.find((p) => p.paneId === 'wX:p1')?.status).toBe('blocked');
    const d = await get<SessionsDoc>(s, '/api/sessions');
    expect(d.sessions).toEqual([]);
    expect(typeof d.generatedAt).toBe('number');
  });
});

describe('AC4 即時性與合併', () => {
  it('檔案追加到 SSE sessions.updated ≤ 2 秒', async () => {
    const { s, files, root } = await setup();
    s.start();
    await ready(s);
    const st = sse(s);
    streams.push(st);
    await new Promise((r) => setTimeout(r, 700));
    const t0 = Date.now();
    appendJsonl(files.free, [cl.prompt('c-free', root, t0), cl.tool('c-free', t0 + 1, 't7', 'Grep', { pattern: 'needle' })]);
    const ev = await waitFor(() => st.of('sessions.updated').find((e) => e.data.sessions.find((x) => x.id === 's:c-free')?.substate === 'running'), 3000);
    expect(ev.at - t0).toBeLessThanOrEqual(2000);
    expect(ev.data.sessions.find((x) => x.id === 's:c-free')?.tool).toEqual({ name: 'Grep', summary: 'needle' });
  });

  it('連續 20 行追加只推 ≤ 2 則 sessions.updated 與該 pane 的 pane.updated；lastEventAt 單獨變動不推', async () => {
    const { s, files } = await setup();
    s.start();
    await ready(s);
    const st = sse(s);
    streams.push(st);
    await new Promise((r) => setTimeout(r, 1200));
    st.events.length = 0;
    const t0 = Date.now();
    for (let i = 0; i < 20; i++) {
      const at = t0 + i;
      appendJsonl(files.qa, [i % 2 ? cx.output(at, `k${i - 1}`) : cx.call(at, `k${i}`, `step ${i}`)]);
      await new Promise((r) => setTimeout(r, 15));
    }
    await new Promise((r) => setTimeout(r, 2500));
    const n1 = st.of('sessions.updated').length;
    const n2 = st.of('pane.updated').filter((e) => e.data.paneId === 'wX:p2').length;
    expect(n1).toBeGreaterThanOrEqual(1);
    expect(n1).toBeLessThanOrEqual(2);
    expect(n2).toBeLessThanOrEqual(2);
    // 只有 lastEventAt 會變的事件（token_count）：不推
    st.events.length = 0;
    appendJsonl(files.qa, [cx.tokens(Date.now()), cx.tokens(Date.now() + 1)]);
    await new Promise((r) => setTimeout(r, 2000));
    expect(st.of('sessions.updated')).toHaveLength(0);
    expect(st.of('pane.updated').filter((e) => e.data.paneId === 'wX:p2')).toHaveLength(0);
    expect((await get<SessionsDoc>(s, '/api/sessions')).sessions.find((x) => x.id === 'wX:p2')?.lastEventAt).toBeGreaterThanOrEqual(t0 + 19);
  });

  it('第一份 sessions 內容照常推送（早開的頁不會停在空清單）', async () => {
    // 掃描比 hub 第一次 flush 早完成（例：DASH_HERDR=off、collector 第一輪慢）：第一份就有內容，不能被當基準吞掉
    const { s } = await setup();
    await s.sessions.scan();
    const st = sse(s);
    streams.push(st);
    await waitFor(() => s.hub.listenerCount('sse') > 0);
    s.hub.flush();
    await waitFor(() => st.of('sessions.updated').find((e) => e.data.sessions.length === 4), 3000);
  });

  it('stop 停掉 tracker 的 timer', async () => {
    const { s } = await setup();
    s.start();
    await ready(s);
    s.stop();
    const t = s.sessions as unknown as { pollTimer: unknown; scanTimer: unknown; stopped: boolean };
    expect([t.stopped, t.pollTimer, t.scanTimer]).toEqual([true, null, null]);
  });
});
