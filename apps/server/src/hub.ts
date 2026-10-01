// Hub：collector 或 herdr 有變動 → 重算 OverviewDoc，決定推哪種 SSE。
// 結構（專案、任務、錯誤、pane 的歸屬、usage、herdr 燈）變了推 overview.updated；
// 只有個別 pane 的內容變了推 pane.updated（一顆一則）；collector 的任務變動推 task.updated。
import { EventEmitter } from 'node:events';
import type { OverviewDoc, PaneLive, SseEvent, TaskRef } from '@dash/shared';
import { aggregate } from './aggregator.ts';
import type { StatusCollector } from './collector.ts';
import type { HerdrBridge } from './herdr.ts';

export interface HubOpts {
  collector: StatusCollector;
  herdr: HerdrBridge;
  /** 合併短時間內的多個變動（herdr 事件常一次來一串） */
  debounceMs?: number;
  now?: () => number;
}

/** 專案 pane 與全部 agent pane（同一顆只取一次，專案版帶任務對應優先） */
const allPanes = (d: OverviewDoc): PaneLive[] => {
  const m = new Map<string, PaneLive>();
  for (const a of d.agents) m.set(a.paneId, a);
  for (const p of d.projects) for (const x of [...p.panes, ...p.otherPanes]) m.set(x.paneId, x);
  return [...m.values()];
};

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

  constructor(private readonly o: HubOpts) {
    super();
    // 每條 /api/stream 掛一個 'sse' 監聽，開的分頁多了會超過預設的 10；監聽都會在斷線時拿掉，不是洩漏
    this.setMaxListeners(0);
    this.now = o.now ?? Date.now;
    o.collector.on('changed', () => this.schedule());
    o.herdr.on('change', () => this.schedule());
    o.collector.on('task', (t: TaskRef) => this.send({ event: 'task.updated', data: t }));
  }

  overview(): OverviewDoc {
    return aggregate(this.o.collector.projects(), this.o.herdr.panes(), this.o.herdr.status(), this.now());
  }

  /** 某任務的 pane（成員 pane 在前，其次是同 task_tab 的其他 session） */
  taskPanes(project: string, dir: string): PaneLive[] {
    const p = this.overview().projects.find((x) => x.name === project);
    if (!p) return [];
    return [...p.panes, ...p.otherPanes].filter((x) => x.taskDir === dir);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
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
    const key = structKey(doc);
    const panes = allPanes(doc);
    const next = new Map(panes.map((p) => [p.paneId, JSON.stringify(p)]));
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
}
