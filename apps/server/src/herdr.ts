// HerdrBridge：herdr 的即時 pane 狀態。唯讀 —— 只呼叫 `herdr api snapshot` 與 socket 的 `events.subscribe`。
// 啟動抓 snapshot 取全量，再訂閱 pane 事件；訂閱中每 refreshMs 補抓一次 snapshot（cost／ctx／額度）。
// 送出 events.subscribe 後 subscribeTimeoutMs 內沒收到回應 → 當成斷線（socket 活著但 herdr 卡住時不會永遠停在半路）。
// socket 不在或斷線 → 'polling'：每 pollMs 輪詢 snapshot，並以指數退避重試訂閱；snapshot 也失敗 → 'down'。
import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createConnection, type Socket } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { HerdrState, PaneLive } from '@dash/shared';
import { parseSnapshot, toPaneLive, type HerdrPane } from './herdr-parse.ts';

export interface HerdrOpts {
  bin: string;
  socket: string;
  off: boolean;
  pollMs?: number;
  refreshMs?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  snapshotTimeoutMs?: number;
  subscribeTimeoutMs?: number;
  now?: () => number;
}

export function herdrOptsFromEnv(env: NodeJS.ProcessEnv): HerdrOpts {
  const cfg = env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return {
    bin: env.DASH_HERDR_BIN || 'herdr',
    socket: env.DASH_HERDR_SOCKET || env.HERDR_SOCKET_PATH || join(cfg, 'herdr/herdr.sock'),
    off: env.DASH_HERDR === 'off',
  };
}

const SUBSCRIPTIONS = ['pane.created', 'pane.updated', 'pane.closed', 'pane.exited', 'pane.moved', 'pane.agent_detected'];
const SUBSCRIBE_ID = 'dash-subscribe';

interface EventData {
  type?: string;
  pane?: HerdrPane;
  pane_id?: string;
  previous_pane_id?: string;
  agent_status?: string;
  agent?: string | null;
}

export class HerdrBridge extends EventEmitter {
  private readonly o: Required<HerdrOpts>;
  private state: HerdrState = 'down';
  private lastAt: number | null = null;
  private readonly raw = new Map<string, HerdrPane>();
  private readonly names = new Map<string, string | null>();
  private live: PaneLive[] = [];
  private liveKey = '[]';
  private sock: Socket | null = null;
  private subscribed = false;
  private stopped = true;
  private backoff: number;
  private pollTimer: NodeJS.Timeout | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private snapshotting: Promise<void> | null = null;
  /** 事件序號：snapshot 只覆寫「它開始之後沒被事件動過」的 pane，免得舊快照蓋掉新事件 */
  private seq = 0;
  private readonly touched = new Map<string, number>();

  constructor(opts: HerdrOpts) {
    super();
    this.o = {
      pollMs: 5000,
      refreshMs: 30_000,
      backoffBaseMs: 1000,
      backoffMaxMs: 60_000,
      snapshotTimeoutMs: 10_000,
      subscribeTimeoutMs: 5000,
      now: Date.now,
      ...opts,
    };
    this.backoff = this.o.backoffBaseMs;
  }

  status(): { state: HerdrState; lastAt: number | null } {
    return { state: this.state, lastAt: this.lastAt };
  }

  panes(): PaneLive[] {
    return this.live;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    if (this.o.off) return this.setState('down');
    void this.snapshot().then(() => this.connect());
  }

  stop(): void {
    this.stopped = true;
    for (const t of [this.pollTimer, this.refreshTimer, this.retryTimer]) if (t) clearTimeout(t);
    this.pollTimer = this.refreshTimer = this.retryTimer = null;
    this.sock?.destroy();
    this.sock = null;
  }

  private setState(s: HerdrState): void {
    if (s === this.state) return;
    this.state = s;
    this.emit('change');
  }

  /** raw → PaneLive；內容真的變了才發 change */
  private rebuild(): void {
    this.live = [...this.raw.values()].map((p) => toPaneLive(p, this.names.get(p.pane_id) ?? null));
    const key = JSON.stringify(this.live);
    if (key === this.liveKey) return;
    this.liveKey = key;
    this.emit('change');
  }

  private runSnapshot(): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(this.o.bin, ['api', 'snapshot'], { timeout: this.o.snapshotTimeoutMs, maxBuffer: 64 * 1024 * 1024 }, (err, stdout) =>
        err ? reject(err) : resolve(stdout),
      );
    });
  }

  private snapshot(): Promise<void> {
    const startSeq = this.seq;
    this.snapshotting ??= this.runSnapshot()
      .then((out) => {
        if (this.stopped) return;
        const snap = parseSnapshot(out);
        const newer = (id: string) => (this.touched.get(id) ?? -1) > startSeq;
        const prev = new Map(this.raw);
        this.raw.clear();
        for (const p of snap.panes) {
          if (!newer(p.pane_id)) this.raw.set(p.pane_id, p);
          else if (prev.has(p.pane_id)) this.raw.set(p.pane_id, prev.get(p.pane_id)!);
        }
        for (const [id, p] of prev) if (newer(id) && !this.raw.has(id)) this.raw.set(id, p);
        this.touched.clear();
        this.names.clear();
        for (const a of snap.agents ?? []) this.names.set(a.pane_id, a.name ?? null);
        this.lastAt = this.o.now();
        if (!this.subscribed) this.setState('polling');
        this.rebuild();
      })
      .catch(() => {
        if (this.stopped || this.subscribed) return;
        this.raw.clear();
        this.names.clear();
        this.setState('down');
        this.rebuild();
      })
      .finally(() => {
        this.snapshotting = null;
      });
    return this.snapshotting;
  }

  private connect(): void {
    if (this.stopped) return;
    const sock = createConnection(this.o.socket);
    this.sock = sock;
    let buf = '';
    let ackTimer: NodeJS.Timeout | null = null;
    const clearAck = () => {
      if (ackTimer) clearTimeout(ackTimer);
      ackTimer = null;
    };
    sock.setEncoding('utf8');
    sock.on('connect', () => {
      sock.write(
        JSON.stringify({ id: SUBSCRIBE_ID, method: 'events.subscribe', params: { subscriptions: SUBSCRIPTIONS.map((type) => ({ type })) } }) + '\n',
      );
      ackTimer = setTimeout(() => sock.destroy(), this.o.subscribeTimeoutMs);
    });
    sock.on('data', (chunk: string) => {
      buf += chunk;
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) this.onLine(line, sock, clearAck);
      }
    });
    sock.on('error', () => undefined);
    sock.on('close', () => {
      clearAck();
      this.onDisconnect(sock);
    });
  }

  private onLine(line: string, sock: Socket, gotAck: () => void): void {
    let msg: { id?: string; result?: { type?: string }; error?: unknown; event?: string; data?: EventData };
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg.id === SUBSCRIBE_ID) {
      gotAck();
      if (msg.result?.type === 'subscription_started') this.onSubscribed();
      else sock.destroy();
      return;
    }
    if (msg.data) this.onEvent(msg.data);
  }

  private onSubscribed(): void {
    this.subscribed = true;
    this.backoff = this.o.backoffBaseMs;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
    this.setState('subscribed');
    // 訂閱前的空窗可能漏事件：補抓一次
    void this.snapshot();
    this.scheduleRefresh();
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(async () => {
      this.refreshTimer = null;
      if (this.stopped || !this.subscribed) return;
      await this.snapshot();
      this.scheduleRefresh();
    }, this.o.refreshMs);
  }

  private onEvent(d: EventData): void {
    const mark = (id: string | undefined) => id && this.touched.set(id, ++this.seq);
    mark(d.pane?.pane_id);
    mark(d.pane_id);
    mark(d.previous_pane_id);
    switch (d.type) {
      case 'pane_created':
      case 'pane_updated':
        if (d.pane) this.raw.set(d.pane.pane_id, d.pane);
        break;
      case 'pane_moved':
        if (d.previous_pane_id) this.raw.delete(d.previous_pane_id);
        if (d.pane) this.raw.set(d.pane.pane_id, d.pane);
        break;
      case 'pane_closed':
      case 'pane_exited':
        if (d.pane_id) this.raw.delete(d.pane_id);
        break;
      case 'pane_agent_status_changed':
      case 'pane_agent_detected': {
        const p = d.pane_id ? this.raw.get(d.pane_id) : undefined;
        if (!p) return;
        this.raw.set(p.pane_id, {
          ...p,
          ...(d.agent_status ? { agent_status: d.agent_status } : {}),
          ...(d.agent !== undefined ? { agent: d.agent } : {}),
        });
        break;
      }
      default:
        return;
    }
    this.lastAt = this.o.now();
    this.rebuild();
  }

  private onDisconnect(sock: Socket): void {
    if (this.sock === sock) this.sock = null;
    if (this.stopped) return;
    const wasSubscribed = this.subscribed;
    this.subscribed = false;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
    if (wasSubscribed) this.setState(this.raw.size > 0 || this.lastAt !== null ? 'polling' : 'down');
    this.startPolling();
    const wait = this.backoff;
    this.backoff = Math.min(this.backoff * 2, this.o.backoffMaxMs);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, wait);
  }

  private startPolling(): void {
    if (this.pollTimer || this.stopped) return;
    const tick = async () => {
      await this.snapshot();
      if (this.stopped || this.subscribed) {
        this.pollTimer = null;
        return;
      }
      this.pollTimer = setTimeout(tick, this.o.pollMs);
    };
    this.pollTimer = setTimeout(tick, 0);
  }
}
