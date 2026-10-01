// HerdrReader：herdr 鏡像頁用的唯讀讀取層。
// 只准兩種 herdr 呼叫：`api snapshot` 與 `pane read <id> --source visible|recent [--lines N] --format ansi`；
// 另開一條 socket 只訂結構類事件（workspace／tab／layout／pane 增減與狀態），有變就重抓 snapshot 發 'view'。
// 其他（send-text／send-keys／run／prompt／focus／close…）一律在 herdrArgs 擋掉，不給 HTTP 層任何能動 herdr 的路。
import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createConnection, type Socket } from 'node:net';
import { toPaneStatus, type HerdrScreen, type HerdrSearchHit, type HerdrSearchResponse, type HerdrView, type HerdrViewPane, type HerdrViewTab, type HerdrViewWorkspace } from '@dash/shared';
import { parseSnapshot, toPaneLive, type HerdrPane } from './herdr-parse.ts';

export type ScreenSource = 'visible' | 'recent';
export type HerdrRead = { op: 'snapshot' } | { op: 'screen'; paneId: string; source?: ScreenSource; lines?: number };

export const MAX_LINES = 5000;

const PANE_ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{0,63}$/;

/** 呼叫不在白名單內 */
export class BadRead extends Error {}

export const isPaneId = (id: string): boolean => PANE_ID.test(id);

/** 唯讀白名單：只有這裡組得出 herdr 的參數 */
export function herdrArgs(r: HerdrRead): string[] {
  if (r.op === 'snapshot') return ['api', 'snapshot'];
  if (r.op === 'screen' && isPaneId(r.paneId)) {
    const source = r.source ?? 'visible';
    if (source !== 'visible' && source !== 'recent') throw new BadRead('herdr: 不允許的 source');
    if (source === 'visible') return ['pane', 'read', r.paneId, '--source', 'visible', '--format', 'ansi'];
    const lines = r.lines ?? 1000;
    if (!Number.isInteger(lines) || lines < 1 || lines > MAX_LINES) throw new BadRead('herdr: 不允許的 lines');
    return ['pane', 'read', r.paneId, '--source', 'recent', '--lines', String(lines), '--format', 'ansi'];
  }
  throw new BadRead('herdr: 不允許的呼叫');
}

interface RawRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RawSnapshot {
  focused_workspace_id?: string | null;
  focused_tab_id?: string | null;
  focused_pane_id?: string | null;
  workspaces?: { workspace_id: string; label?: string; number?: number; agent_status?: string; active_tab_id?: string | null }[];
  tabs?: { tab_id: string; workspace_id: string; label?: string; number?: number; agent_status?: string }[];
  layouts?: {
    tab_id: string;
    area?: RawRect;
    focused_pane_id?: string | null;
    zoomed?: boolean;
    panes?: { pane_id: string; rect: RawRect }[];
  }[];
  panes: (HerdrPane & { terminal_title_stripped?: string | null; scroll?: { max_offset_from_bottom?: number } })[];
  agents?: { pane_id: string; name?: string | null }[];
}

/** `herdr api snapshot` 的原始輸出 → HerdrView */
export function toHerdrView(stdout: string, now: number): HerdrView {
  const s = parseSnapshot(stdout) as unknown as RawSnapshot;
  const names = new Map((s.agents ?? []).map((a) => [a.pane_id, a.name ?? null]));
  const panes = new Map(s.panes.map((p) => [p.pane_id, p]));
  const layouts = new Map((s.layouts ?? []).map((l) => [l.tab_id, l]));

  const tabOf = (t: NonNullable<RawSnapshot['tabs']>[number]): HerdrViewTab => {
    const l = layouts.get(t.tab_id);
    const inTab = s.panes.filter((p) => p.tab_id === t.tab_id);
    const rects = new Map((l?.panes ?? []).map((p) => [p.pane_id, p.rect]));
    const area = l?.area ?? { x: 0, y: 0, width: 1, height: 1 };
    const viewPanes: HerdrViewPane[] = inTab.map((p) => {
      const r = rects.get(p.pane_id) ?? area;
      return {
        ...toPaneLive(p, names.get(p.pane_id) ?? null),
        rect: { x: r.x - area.x, y: r.y - area.y, width: r.width, height: r.height },
        title: panes.get(p.pane_id)?.terminal_title_stripped || null,
        scrollback: p.scroll?.max_offset_from_bottom ?? 0,
      };
    });
    return {
      id: t.tab_id,
      label: t.label ?? '',
      number: t.number ?? 0,
      status: toPaneStatus(t.agent_status),
      focusedPaneId: l?.focused_pane_id ?? null,
      zoomed: l?.zoomed ?? false,
      area: { width: area.width, height: area.height },
      panes: viewPanes,
    };
  };

  const workspaces: HerdrViewWorkspace[] = (s.workspaces ?? [])
    .map((w) => ({
      id: w.workspace_id,
      label: w.label ?? '',
      number: w.number ?? 0,
      status: toPaneStatus(w.agent_status),
      activeTabId: w.active_tab_id ?? null,
      tabs: (s.tabs ?? []).filter((t) => t.workspace_id === w.workspace_id).map(tabOf),
    }))
    .sort((a, b) => a.number - b.number);

  return {
    generatedAt: now,
    live: false,
    focused: { workspaceId: s.focused_workspace_id ?? null, tabId: s.focused_tab_id ?? null, paneId: s.focused_pane_id ?? null },
    workspaces,
  };
}

export interface HerdrReaderOpts {
  bin: string;
  off: boolean;
  /** 結構事件訂閱用的 socket；不給就只能靠網頁輪詢 */
  socket?: string;
  /** 事件常一次來一串：合併後才重抓 */
  debounceMs?: number;
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  /** 送出 events.subscribe 後這麼久沒收到回應 → 當成斷線（比照 HerdrBridge） */
  subscribeTimeoutMs?: number;
  timeoutMs?: number;
  /** 同一份結果在這段時間內重複請求直接共用，免得多個分頁把 herdr 打爆 */
  viewTtlMs?: number;
  screenTtlMs?: number;
  now?: () => number;
}

interface Cached<T> {
  at: number;
  p: Promise<T>;
}

// CSI／OSC／其他 ESC 序列與剩下的控制字元
const ANSI = /\u001b\[[0-9;:?]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g;
// eslint-disable-next-line no-control-regex
const CTRL = /[\u0000-\u0008\u000b-\u001f\u007f]/g;

export function stripAnsi(s: string): string[] {
  return s
    .replace(ANSI, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(CTRL, ''));
}

export const SEARCH_MAX_QUERY = 200;
export const SEARCH_MAX_HITS = 500;
export const SEARCH_MAX_PER_PANE = 100;

/** 不分大小寫的純文字比對（不用 regex，免得查詢字串拖垮 server） */
export function searchLines(lines: string[], q: string): number[] {
  const needle = q.toLowerCase();
  const out: number[] = [];
  lines.forEach((l, i) => {
    if (l.toLowerCase().includes(needle)) out.push(i);
  });
  return out;
}

export class HerdrUnavailable extends Error {}
export class UnknownPane extends Error {}

/** 會影響 spaces／tabs／版面的事件（herdr 要求 pane_id 的 pane.agent_status_changed／scroll_changed 不能全域訂；
 * pane 狀態改由 server.ts 把 HerdrBridge 的 change 接到 notify()） */
export const STRUCTURE_EVENTS = [
  'workspace.created',
  'workspace.updated',
  'workspace.renamed',
  'workspace.moved',
  'workspace.reordered',
  'workspace.closed',
  'workspace.focused',
  'tab.created',
  'tab.closed',
  'tab.focused',
  'tab.renamed',
  'tab.moved',
  'pane.created',
  'pane.closed',
  'pane.focused',
  'pane.moved',
  'pane.exited',
  'pane.agent_detected',
  'layout.updated',
];
const WATCH_ID = 'dash-view-watch';

export class HerdrReader extends EventEmitter {
  private readonly o: Required<HerdrReaderOpts>;
  private view: Cached<HerdrView> | null = null;
  private readonly screens = new Map<string, Cached<HerdrScreen>>();
  private sock: Socket | null = null;
  private watching = false;
  private stopped = true;
  private backoff: number;
  private debounce: NodeJS.Timeout | null = null;
  private retry: NodeJS.Timeout | null = null;
  private lastKey = '';

  constructor(opts: HerdrReaderOpts) {
    super();
    this.o = {
      timeoutMs: 5000,
      viewTtlMs: 1000,
      screenTtlMs: 500,
      now: Date.now,
      socket: '',
      debounceMs: 250,
      backoffBaseMs: 1000,
      backoffMaxMs: 60_000,
      subscribeTimeoutMs: 5000,
      // undefined 不蓋預設（server.ts 會原樣轉傳可選欄位）
      ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)),
    } as Required<HerdrReaderOpts>;
    this.backoff = this.o.backoffBaseMs;
  }

  /** 事件訂閱中：網頁可以不用密集輪詢 */
  get live(): boolean {
    return this.watching;
  }

  start(): void {
    if (!this.stopped || this.o.off || !this.o.socket) return;
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    for (const t of [this.debounce, this.retry]) if (t) clearTimeout(t);
    this.debounce = this.retry = null;
    this.sock?.destroy();
    this.sock = null;
    this.watching = false;
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
      sock.write(JSON.stringify({ id: WATCH_ID, method: 'events.subscribe', params: { subscriptions: STRUCTURE_EVENTS.map((type) => ({ type })) } }) + '\n');
      ackTimer = setTimeout(() => sock.destroy(), this.o.subscribeTimeoutMs);
    });
    sock.on('data', (chunk: string) => {
      buf += chunk;
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        let msg: { id?: string; result?: { type?: string }; error?: unknown; data?: unknown };
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        // herdr 拒絕請求時回的 id 是空字串，也要當訂閱失敗
        if (msg.id === WATCH_ID || (msg.error && !this.watching)) {
          clearAck();
          if (msg.result?.type === 'subscription_started') {
            this.watching = true;
            this.backoff = this.o.backoffBaseMs;
            this.changed(); // 訂閱前的空窗
          } else sock.destroy();
        } else if (msg.data) this.changed();
      }
    });
    sock.on('error', () => undefined);
    sock.on('close', () => {
      clearAck();
      if (this.sock === sock) this.sock = null;
      const was = this.watching;
      this.watching = false;
      if (was) this.changed(); // 讓網頁知道 live 變 false
      if (this.stopped) return;
      const wait = this.backoff;
      this.backoff = Math.min(this.backoff * 2, this.o.backoffMaxMs);
      this.retry = setTimeout(() => {
        this.retry = null;
        this.connect();
      }, wait);
    });
  }

  /** 外部得知 herdr 有變（HerdrBridge 的 pane 事件） */
  notify(): void {
    if (!this.stopped) this.changed();
  }

  private changed(): void {
    this.view = null;
    if (this.debounce) return;
    this.debounce = setTimeout(() => {
      this.debounce = null;
      this.getView().then(
        (v) => {
          const key = JSON.stringify({ ...v, generatedAt: 0 });
          if (key === this.lastKey) return;
          this.lastKey = key;
          this.emit('view', v);
        },
        () => undefined,
      );
    }, this.o.debounceMs);
  }

  private run(r: HerdrRead): Promise<string> {
    const args = herdrArgs(r);
    return new Promise((resolve, reject) => {
      execFile(this.o.bin, args, { timeout: this.o.timeoutMs, maxBuffer: 64 * 1024 * 1024 }, (err, stdout) =>
        err ? reject(new HerdrUnavailable(err.message)) : resolve(stdout),
      );
    });
  }

  private fresh<T>(c: Cached<T> | null | undefined, ttl: number): c is Cached<T> {
    return !!c && this.o.now() - c.at < ttl;
  }

  getView(): Promise<HerdrView> {
    if (this.o.off) return Promise.reject(new HerdrUnavailable('herdr off'));
    if (this.fresh(this.view, this.o.viewTtlMs)) return this.view.p;
    const p = this.run({ op: 'snapshot' }).then((out) => ({ ...toHerdrView(out, this.o.now()), live: this.watching }));
    const entry = { at: this.o.now(), p };
    this.view = entry;
    p.catch(() => {
      if (this.view === entry) this.view = null;
    });
    return p;
  }

  /** 只讀 snapshot 裡存在的 pane */
  async getScreen(paneId: string, source: ScreenSource = 'visible', lines?: number): Promise<HerdrScreen> {
    if (!isPaneId(paneId)) throw new UnknownPane(paneId);
    herdrArgs({ op: 'screen', paneId, source, lines }); // 參數不合法就在這裡丟
    const key = `${paneId} ${source} ${lines ?? ''}`;
    const cached = this.screens.get(key);
    if (this.fresh(cached, this.o.screenTtlMs)) return cached.p;
    const view = await this.getView();
    if (!view.workspaces.some((w) => w.tabs.some((t) => t.panes.some((p) => p.paneId === paneId)))) throw new UnknownPane(paneId);
    const p = this.run({ op: 'screen', paneId, source, lines }).then((ansi) => ({ paneId, generatedAt: this.o.now(), ansi }));
    const entry = { at: this.o.now(), p };
    this.screens.set(key, entry);
    p.catch(() => {
      if (this.screens.get(key) === entry) this.screens.delete(key);
    });
    for (const [id, c] of this.screens) if (this.o.now() - c.at > 60_000) this.screens.delete(id);
    return p;
  }

  /** 搜尋全部 pane 的畫面；有捲動歷史的讀歷史 */
  async search(q: string): Promise<HerdrSearchResponse> {
    if (q.trim() === '' || q.length > SEARCH_MAX_QUERY) throw new BadRead('herdr: 查詢字串長度要在 1..200');
    const view = await this.getView();
    const panes = view.workspaces.flatMap((w) => w.tabs.flatMap((t) => t.panes.map((p) => ({ p, rows: t.area.height }))));
    const failed: string[] = [];
    const perPane = await Promise.all(
      panes.map(async ({ p, rows }) => {
        const history = p.scrollback > 0;
        try {
          const s = await this.getScreen(p.paneId, history ? 'recent' : 'visible', history ? Math.min(MAX_LINES, p.scrollback + rows) : undefined);
          const lines = stripAnsi(s.ansi);
          return searchLines(lines, q)
            .slice(0, SEARCH_MAX_PER_PANE)
            .map((line): HerdrSearchHit => ({ paneId: p.paneId, workspaceId: p.workspaceId, tabId: p.tabId, line, text: lines[line], history }));
        } catch {
          failed.push(p.paneId);
          return [];
        }
      }),
    );
    const all = perPane.flat();
    return { q, generatedAt: this.o.now(), hits: all.slice(0, SEARCH_MAX_HITS), truncated: all.length > SEARCH_MAX_HITS, failed };
  }
}
