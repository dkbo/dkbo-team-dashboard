import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server, type Socket } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { HerdrBridge, herdrOptsFromEnv, type HerdrOpts } from '../src/herdr.ts';
import { script, tmp, waitFor } from './helpers.ts';

interface Fake {
  dir: string;
  bin: string;
  sock: string;
  setSnapshot(panes: unknown[], agents?: unknown[]): void;
  failSnapshot(): void;
  snapshotCalls(): number;
}

function fakeHerdr(): Fake {
  const dir = tmp('dash-herdr-');
  const snap = join(dir, 'snap.json');
  const log = join(dir, 'calls.log');
  const bin = script(join(dir, 'herdr'), `echo "$*" >> ${log}\n[ -f ${snap} ] || { echo "herdr: server not running" >&2; exit 1; }\ncat ${snap}`);
  return {
    dir,
    bin,
    sock: join(dir, 'herdr.sock'),
    setSnapshot(panes, agents = []) {
      writeFileSync(snap, JSON.stringify({ id: 'x', result: { type: 'snapshot', snapshot: { version: '0.9.0', protocol: 22, panes, agents, workspaces: [], tabs: [], layouts: [] } } }));
    },
    failSnapshot() {
      rmSync(snap, { force: true });
    },
    snapshotCalls() {
      return existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter((l) => l === 'api snapshot').length : 0;
    },
  };
}

const pane = (id: string, status = 'idle', tokens: Record<string, string> = {}) => ({
  pane_id: id,
  tab_id: 'w1:t1',
  workspace_id: 'w1',
  terminal_id: 't',
  focused: false,
  revision: 1,
  agent: 'claude',
  agent_status: status,
  cwd: '/p',
  tokens,
});

interface SockServer {
  server: Server;
  clients: Socket[];
  requests: unknown[];
  connects: number[];
  push(ev: unknown): void;
  close(): Promise<void>;
}

function sockServer(path: string, mode: 'ok' | 'drop' | 'silent' = 'ok'): Promise<SockServer> {
  const s: SockServer = {
    server: createServer(),
    clients: [],
    requests: [],
    connects: [],
    push(ev) {
      for (const c of s.clients) c.write(JSON.stringify(ev) + '\n');
    },
    close() {
      for (const c of s.clients) c.destroy();
      return new Promise((r) => s.server.close(() => r()));
    },
  };
  s.server.on('connection', (c) => {
    s.connects.push(Date.now());
    if (mode === 'drop') return void c.destroy();
    s.clients.push(c);
    c.on('close', () => s.clients.splice(s.clients.indexOf(c), 1));
    let buf = '';
    c.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const req = JSON.parse(buf.slice(0, i)) as { id: string };
        buf = buf.slice(i + 1);
        s.requests.push(req);
        if (mode !== 'silent') c.write(JSON.stringify({ id: req.id, result: { type: 'subscription_started' } }) + '\n');
      }
    });
  });
  return new Promise((r) => s.server.listen(path, () => r(s)));
}

const bridges: HerdrBridge[] = [];
const servers: SockServer[] = [];
afterEach(async () => {
  bridges.splice(0).forEach((b) => b.stop());
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

function bridge(f: Fake, over: Partial<HerdrOpts> = {}) {
  const b = new HerdrBridge({ bin: f.bin, socket: f.sock, off: false, pollMs: 50, refreshMs: 60_000, backoffBaseMs: 40, backoffMaxMs: 400, ...over });
  bridges.push(b);
  return b;
}

describe('herdrOptsFromEnv', () => {
  it('DASH_HERDR_* 覆寫；socket 預設取 HERDR_SOCKET_PATH，再退到 ~/.config/herdr/herdr.sock', () => {
    expect(herdrOptsFromEnv({ DASH_HERDR_BIN: '/x/herdr', DASH_HERDR_SOCKET: '/x/s.sock', DASH_HERDR: 'off' })).toMatchObject({
      bin: '/x/herdr',
      socket: '/x/s.sock',
      off: true,
    });
    expect(herdrOptsFromEnv({ HERDR_SOCKET_PATH: '/h/s.sock' })).toMatchObject({ bin: 'herdr', socket: '/h/s.sock', off: false });
    expect(herdrOptsFromEnv({}).socket).toBe(join(homedir(), '.config/herdr/herdr.sock'));
    expect(herdrOptsFromEnv({ XDG_CONFIG_HOME: '/cfg' }).socket).toBe('/cfg/herdr/herdr.sock');
  });
});

describe('HerdrBridge', () => {
  it('訂閱送出後逾時沒回應 → 視同斷線：退回輪詢並重連（debt AC1）', async () => {
    const f = fakeHerdr();
    f.setSnapshot([pane('a')]);
    const srv = await sockServer(f.sock, 'silent');
    servers.push(srv);
    const b = bridge(f, { subscribeTimeoutMs: 150 });
    b.start();
    await waitFor(() => srv.requests.length === 1);
    const before = f.snapshotCalls();
    await waitFor(() => srv.connects.length >= 2, 3000);
    expect(b.status().state).toBe('polling');
    await waitFor(() => f.snapshotCalls() > before + 1, 3000);
  });

  it('DASH_HERDR=off：狀態 down、不呼叫 herdr', async () => {
    const f = fakeHerdr();
    f.setSnapshot([pane('a')]);
    const b = bridge(f, { off: true });
    b.start();
    await new Promise((r) => setTimeout(r, 150));
    expect(b.status()).toEqual({ state: 'down', lastAt: null });
    expect(b.panes()).toEqual([]);
    expect(f.snapshotCalls()).toBe(0);
  });

  it('啟動抓 snapshot、以 events.subscribe 訂閱 pane 事件；名字取 snapshot.agents', async () => {
    const f = fakeHerdr();
    f.setSnapshot([pane('a', 'working', { cost: '$0.5', ctx_num: '7' }), pane('b')], [{ pane_id: 'a', name: 'demo-dev' }]);
    const srv = await sockServer(f.sock);
    servers.push(srv);
    const b = bridge(f);
    b.start();
    await waitFor(() => b.status().state === 'subscribed');
    expect(b.panes().map((p) => [p.paneId, p.name, p.status, p.cost, p.ctxPct])).toEqual([
      ['a', 'demo-dev', 'working', 0.5, 7],
      ['b', null, 'idle', null, null],
    ]);
    expect(srv.requests).toHaveLength(1);
    const req = srv.requests[0] as { method: string; params: { subscriptions: { type: string }[] } };
    expect(req.method).toBe('events.subscribe');
    expect(req.params.subscriptions.map((s) => s.type)).toEqual(expect.arrayContaining(['pane.created', 'pane.updated', 'pane.closed']));
    expect(b.status().lastAt).toBeTypeOf('number');
  });

  it('事件：updated 改狀態、created 新增、closed 移除、agent_status_changed 改狀態，皆發 change', async () => {
    const f = fakeHerdr();
    f.setSnapshot([pane('a'), pane('b')], [{ pane_id: 'a', name: 'demo-dev' }]);
    const srv = await sockServer(f.sock);
    servers.push(srv);
    const b = bridge(f);
    let changes = 0;
    b.on('change', () => changes++);
    b.start();
    await waitFor(() => b.status().state === 'subscribed');
    const before = changes;
    srv.push({ event: 'pane_updated', data: { type: 'pane_updated', pane: pane('a', 'blocked') } });
    await waitFor(() => b.panes().find((p) => p.paneId === 'a')?.status === 'blocked', 2000);
    expect(b.panes().find((p) => p.paneId === 'a')!.name).toBe('demo-dev');
    srv.push({ event: 'pane_created', data: { type: 'pane_created', pane: pane('c', 'working') } });
    srv.push({ event: 'pane_closed', data: { type: 'pane_closed', pane_id: 'b', workspace_id: 'w1' } });
    srv.push({ event: 'pane_agent_status_changed', data: { type: 'pane_agent_status_changed', pane_id: 'a', workspace_id: 'w1', agent_status: 'done' } });
    await waitFor(() => b.panes().map((p) => `${p.paneId}:${p.status}`).join() === 'a:done,c:working', 2000);
    expect(changes).toBeGreaterThan(before);
  });

  it('同樣內容的事件不發 change（去重）', async () => {
    const f = fakeHerdr();
    f.setSnapshot([pane('a')]);
    const srv = await sockServer(f.sock);
    servers.push(srv);
    const b = bridge(f);
    b.start();
    await waitFor(() => b.status().state === 'subscribed');
    let changes = 0;
    b.on('change', () => changes++);
    srv.push({ event: 'pane_updated', data: { type: 'pane_updated', pane: { ...pane('a'), revision: 99 } } });
    srv.push({ event: 'pane_updated', data: { type: 'pane_updated', pane: pane('a', 'working') } });
    await waitFor(() => b.panes()[0].status === 'working');
    expect(changes).toBe(1);
  });

  it('訂閱中每 refreshMs 補抓 snapshot（cost／ctx／額度）', async () => {
    const f = fakeHerdr();
    f.setSnapshot([pane('a', 'idle', { cost: '$1' })]);
    const srv = await sockServer(f.sock);
    servers.push(srv);
    const b = bridge(f, { refreshMs: 100 });
    b.start();
    await waitFor(() => b.status().state === 'subscribed');
    f.setSnapshot([pane('a', 'idle', { cost: '$2', usage_session_num: '50' })]);
    await waitFor(() => b.panes()[0].cost === 2, 2000);
    expect(b.panes()[0].usage5hPct).toBe(50);
    expect(b.status().state).toBe('subscribed');
  });

  it('socket 不在：退回輪詢 snapshot（polling），socket 出現後訂閱成功並停止輪詢', async () => {
    const f = fakeHerdr();
    f.setSnapshot([pane('a')]);
    const b = bridge(f);
    b.start();
    await waitFor(() => b.status().state === 'polling');
    const n0 = f.snapshotCalls();
    await waitFor(() => f.snapshotCalls() >= n0 + 3, 2000);
    f.setSnapshot([pane('a', 'working')]);
    await waitFor(() => b.panes()[0]?.status === 'working', 2000);
    const srv = await sockServer(f.sock);
    servers.push(srv);
    await waitFor(() => b.status().state === 'subscribed', 3000);
    const n1 = f.snapshotCalls();
    await new Promise((r) => setTimeout(r, 300));
    expect(f.snapshotCalls()).toBeLessThanOrEqual(n1 + 1);
  });

  it('訂閱斷線：燈號轉 polling 並以指數退避重試', async () => {
    const f = fakeHerdr();
    f.setSnapshot([pane('a')]);
    let srv = await sockServer(f.sock);
    // 基準拉大到 150ms：負載高時每次重連的固定開銷才不會吃掉倍數關係
    const b = bridge(f, { backoffBaseMs: 150, backoffMaxMs: 5000 });
    b.start();
    await waitFor(() => b.status().state === 'subscribed');
    await srv.close();
    rmSync(f.sock, { force: true });
    srv = await sockServer(f.sock, 'drop');
    servers.push(srv);
    await waitFor(() => b.status().state === 'polling', 2000);
    await waitFor(() => srv.connects.length >= 4, 10_000);
    const gaps = srv.connects.slice(1).map((t, i) => t - srv.connects[i]);
    expect(gaps[2]).toBeGreaterThan(gaps[0] * 2);
  });

  it('snapshot 也失敗（沒有 herdr）：狀態 down、panes 清空；herdr 回來後恢復', async () => {
    const f = fakeHerdr();
    const b = bridge(f);
    b.start();
    await waitFor(() => b.status().state === 'down');
    expect(b.panes()).toEqual([]);
    f.setSnapshot([pane('a')]);
    await waitFor(() => b.status().state === 'polling' && b.panes().length === 1, 2000);
  });
});
