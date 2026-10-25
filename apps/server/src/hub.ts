// Hub：collector 或 herdr 有變動 → 重算 OverviewDoc，決定推哪種 SSE。
// 結構（專案、任務、錯誤、pane 的歸屬、usage、herdr 燈）變了推 overview.updated；
// 只有個別 pane 的內容變了推 pane.updated（一顆一則）；collector 的任務變動推 task.updated。
// session 細狀態：tracker 有變 → 同一條 flush；sessions.updated 每 sessionsMinMs 最多一則，且只在 lastEventAt 以外的欄位變了才推；
// pane.updated 比對時同樣不看 session.lastEventAt（串流中的 assistant 每秒寫好幾行，不合併會讓場景持續 render）。
import { EventEmitter } from 'node:events';
import type { HerdrView, OverviewDoc, PaneLive, SessionsDoc, SseEvent, TaskRef } from '@dash/shared';
import { aggregate } from './aggregator.ts';
import type { StatusCollector } from './collector.ts';
import type { HerdrBridge } from './herdr.ts';
import { buildSessionsDoc, sessionsKey } from './session-doc.ts';
import type { SessionTracker } from './sessions.ts';

export interface HubOpts {
  collector: StatusCollector;
  herdr: HerdrBridge;
  /** 不給或 off：/api/sessions 回空、PaneLive.session 恆 null */
  sessions?: SessionTracker;
  /** 合併短時間內的多個變動（herdr 事件常一次來一串） */
  debounceMs?: number;
  /** sessions.updated 的最短間隔 */
  sessionsMinMs?: number;
  now?: () => number;
}

/** 專案 pane 與全部 agent pane（同一顆只取一次，專案版帶任務對應優先） */
const allPanes = (d: OverviewDoc): PaneLive[] => {
  const m = new Map<string, PaneLive>();
  for (const a of d.agents) m.set(a.paneId, a);
  for (const p of d.projects) for (const x of [...p.panes, ...p.otherPanes]) m.set(x.paneId, x);
  return [...m.values()];
};

/** pane.updated 去重用：session.lastEventAt 單獨變動不推 */
const paneKey = (p: PaneLive) => JSON.stringify(p.session ? { ...p, session: { ...p.session, lastEventAt: null } } : p);

/** 去掉每輪都會變、但不值得推送的欄位，並把 pane 內容換成歸屬 */
function structKey(d: OverviewDoc): string {
  return JSON.stringify({
    ...d,
    generatedAt: 0,
    herdr: { state: d.herdr.state },
    agents: d.agents.map((x) => [x.paneId, x.project, x.taskDir, x.member]),
    projects: d.projects.map((p) => ({
      ...p,
      fetchedAt: p.stale ? p.fetchedAt : null,
      list: p.list && { ...p.list, generated_at: null },
      panes: p.panes.map((x) => [x.paneId, x.taskDir, x.member]),
      otherPanes: p.otherPanes.map((x) => [x.paneId, x.taskDir]),
    })),
  });
}

export class Hub extends EventEmitter {
  private lastKey = '';
  private lastPanes = new Map<string, string>();
  private timer: NodeJS.Timeout | null = null;
  private readonly now: () => number;
  private lastSessKey: string | null = null;
  private lastSessAt = -Infinity;
  private sessTimer: NodeJS.Timeout | null = null;

  constructor(private readonly o: HubOpts) {
    super();
    // 每條 /api/stream 掛一個 'sse' 監聽，開的分頁多了會超過預設的 10；監聽都會在斷線時拿掉，不是洩漏
    this.setMaxListeners(0);
    this.now = o.now ?? Date.now;
    o.collector.on('changed', () => this.schedule());
    o.herdr.on('change', () => this.schedule());
    o.collector.on('task', (t: TaskRef) => this.send({ event: 'task.updated', data: t }));
    o.sessions?.on('change', () => this.schedule());
  }

  private get tracker(): SessionTracker | null {
    return this.o.sessions?.enabled ? this.o.sessions : null;
  }

  overview(): OverviewDoc {
    const t = this.tracker;
    return aggregate(this.o.collector.projects(), this.o.herdr.panes(), this.o.herdr.status(), this.now(), (id) => t?.paneSession(id) ?? null);
  }

  sessions(doc: OverviewDoc = this.overview()): SessionsDoc {
    const t = this.tracker;
    if (!t) return { generatedAt: this.now(), sessions: [] };
    return buildSessionsDoc(doc, t.sessions(), (p) => t.roles(p), this.now());
  }

  /** herdr 鏡像的每個 pane 補上 session（error 的 status 改 blocked），與 overview 同一套 */
  decorateView(v: HerdrView): HerdrView {
    const t = this.tracker;
    return {
      ...v,
      workspaces: v.workspaces.map((w) => ({
        ...w,
        tabs: w.tabs.map((tab) => ({
          ...tab,
          panes: tab.panes.map((p) => {
            const session = t?.paneSession(p.paneId) ?? null;
            return { ...p, status: session?.substate === 'error' ? 'blocked' : p.status, session };
          }),
        })),
      })),
    };
  }

  /** 某任務的 pane（成員 pane 在前，其次是同 task_tab 的其他 session） */
  taskPanes(project: string, dir: string): PaneLive[] {
    const p = this.overview().projects.find((x) => x.name === project);
    if (!p) return [];
    return [...p.panes, ...p.otherPanes].filter((x) => x.taskDir === dir);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.sessTimer) clearTimeout(this.sessTimer);
    this.timer = this.sessTimer = null;
  }

  private send(e: SseEvent): void {
    this.emit('sse', e);
  }

  /** 其他來源（HerdrReader 的 herdr.view）直接推 */
  broadcast(e: SseEvent): void {
    this.send(e);
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, this.o.debounceMs ?? 100);
  }

  flush(): void {
    const doc = this.overview();
    this.flushSessions(doc);
    const key = structKey(doc);
    const panes = allPanes(doc);
    const next = new Map(panes.map((p) => [p.paneId, paneKey(p)]));
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.lastPanes = next;
      this.send({ event: 'overview.updated', data: doc });
      return;
    }
    for (const p of panes) {
      if (this.lastPanes.get(p.paneId) !== next.get(p.paneId)) this.send({ event: 'pane.updated', data: p });
    }
    this.lastPanes = next;
  }

  /** sessions.updated：內容（lastEventAt 以外）變了才推；距上次不足 sessionsMinMs 就延到那時再算一次 */
  private flushSessions(doc?: OverviewDoc): void {
    if (!this.tracker) return;
    const wait = this.lastSessAt + (this.o.sessionsMinMs ?? 500) - this.now();
    if (wait > 0) {
      this.sessTimer ??= setTimeout(() => {
        this.sessTimer = null;
        this.flushSessions();
      }, wait);
      return;
    }
    const d = this.sessions(doc);
    const key = sessionsKey(d);
    if (key === this.lastSessKey) return;
    // 第一份也照推：掃描可能早於第一次 flush 完成，吞掉會讓早開的頁停在空清單（review1 I3）
    this.lastSessKey = key;
    this.lastSessAt = this.now();
    this.send({ event: 'sessions.updated', data: d });
  }
}
