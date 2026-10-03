// StatusCollector：每專案輪詢 dk-status --json（list），對 running／planning 任務抓 detail 放進 active，
// 已結案任務的 detail 抓一次、依 closed_at 快取。同一專案的所有 dk-status 呼叫經同一把鎖排隊，絕不重疊。
// 背景預抓每輪最多 PREFETCH_PER_ROUND 個，免得一次補幾十個把下一輪 list 卡在鎖後面；失敗的 dir 冷卻 PREFETCH_RETRY_MS 才再試。
// 內容沒變（只有 generated_at 變）不發 'changed'。
import { EventEmitter } from 'node:events';
import {
  historyRow,
  isActiveStatus,
  isClosedStatus,
  parseDispatch,
  type ActivityTask,
  type DetailDoc,
  type Dispatch,
  type DispatchIndex,
  type HistoryRow,
  type ListDoc,
  type ProjectError,
  type TaskDetail,
  type TaskRef,
  type TierConfig,
} from '@dash/shared';
import type { CollectedProject } from './aggregator.ts';
import type { ProjectConfig } from './config.ts';
import { runDkStatus, type ChildTracker } from './dkstatus.ts';
import type { Invocation, ProjectRegistry } from './registry.ts';
import { TierReader } from './tiers.ts';

export interface CollectorOpts {
  registry: ProjectRegistry;
  pollMs: number;
  timeoutMs?: number;
  now?: () => number;
  tracker?: ChildTracker;
  /** 以文字讀各專案 roles／kinds 檔（推 Dispatch 的 model／effort） */
  tiers?: TierReader;
}

interface ProjectState {
  cfg: ProjectConfig;
  mode: CollectedProject['mode'];
  dkboVersion: string | null;
  error: ProjectError | null;
  fetchedAt: number | null;
  list: ListDoc | null;
  active: Map<string, DetailDoc>;
  closed: Map<string, { closedAt: string | null; doc: DetailDoc }>;
  /** 已結案 detail 最近一次抓失敗的時間 */
  closedFailed: Map<string, number>;
  summaryKeys: Map<string, string>;
  key: string;
  lock: Promise<unknown>;
  timer: NodeJS.Timeout | null;
  /** 任務 dir → 上一次推出的 Dispatch（task 與對照表都沒換就沿用同一個陣列） */
  dispatch: Map<string, { task: TaskDetail; config: TierConfig; list: Dispatch[] }>;
}

export type DetailResult =
  | { ok: true; doc: DetailDoc }
  | { ok: false; status: 404 | 502; error: ProjectError };

/** 每輪輪詢後最多預抓幾個已結案 detail：一個約 0.1–0.5 秒，3 個讓鎖最多多占 1–2 秒，遠小於預設 pollMs 5 秒 */
export const PREFETCH_PER_ROUND = 3;
/** 已結案 detail 抓失敗後多久內不重抓 */
export const PREFETCH_RETRY_MS = 60_000;

const withoutGenerated = <T extends { generated_at?: unknown }>(d: T) => ({ ...d, generated_at: null });

export class StatusCollector extends EventEmitter {
  private readonly states: ProjectState[];
  private stopped = true;
  private readonly now: () => number;
  private readonly tiers: TierReader;

  constructor(private readonly opts: CollectorOpts) {
    super();
    this.now = opts.now ?? Date.now;
    this.tiers = opts.tiers ?? new TierReader();
    this.states = opts.registry.projects.map((cfg) => ({
      cfg,
      mode: null,
      dkboVersion: null,
      error: null,
      fetchedAt: null,
      list: null,
      active: new Map(),
      closed: new Map(),
      closedFailed: new Map(),
      summaryKeys: new Map(),
      key: '',
      lock: Promise.resolve(),
      timer: null,
      dispatch: new Map(),
    }));
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    for (const s of this.states) {
      const loop = async () => {
        s.timer = null;
        await this.pollOnce(s.cfg.name).catch(() => undefined);
        // 背景預抓已結案任務的 detail（供 /api/history）；同樣走鎖，只抓一次，每輪限量
        void this.ensureClosed(s, PREFETCH_PER_ROUND).catch(() => undefined);
        if (!this.stopped) s.timer = setTimeout(loop, this.opts.pollMs);
      };
      void loop();
    }
  }

  stop(): void {
    this.stopped = true;
    for (const s of this.states) {
      if (s.timer) clearTimeout(s.timer);
      s.timer = null;
    }
  }

  projects(): CollectedProject[] {
    return this.states.map((s) => ({
      name: s.cfg.name,
      path: s.cfg.path,
      dkboVersion: s.dkboVersion,
      mode: s.mode,
      error: s.error,
      stale: s.error !== null && s.list !== null,
      fetchedAt: s.fetchedAt,
      list: s.list,
      active: Object.fromEntries([...s.active].map(([dir, d]) => [dir, d.task])) as Record<string, TaskDetail>,
    }));
  }

  /** 排進該專案的鎖：前一個 dk-status 跑完才開始下一個 */
  private exclusive<T>(s: ProjectState, fn: () => Promise<T>): Promise<T> {
    const run = s.lock.then(fn, fn);
    s.lock = run.catch(() => undefined);
    return run;
  }

  private state(name: string): ProjectState | undefined {
    return this.states.find((s) => s.cfg.name === name);
  }

  private run(inv: Extract<Invocation, { ok: true }>, args: string[]) {
    return runDkStatus({ bin: inv.bin, dkRoot: inv.dkRoot, projectRoot: inv.projectRoot, args, timeoutMs: this.opts.timeoutMs, tracker: this.opts.tracker });
  }

  pollOnce(name: string): Promise<void> {
    const s = this.state(name);
    if (!s) return Promise.resolve();
    return this.exclusive(s, () => this.poll(s));
  }

  private async poll(s: ProjectState): Promise<void> {
    const touched = new Set<string>();
    const inv = await this.opts.registry.invocation(s.cfg);
    // 相容模式出錯（連路徑都讀不到）時仍保留 compat 標籤
    s.mode = inv.mode ?? (s.mode === 'compat' ? 'compat' : null);
    s.dkboVersion = inv.dkboVersion;
    if (!inv.ok) {
      s.error = inv.error;
      return this.publish(s, touched);
    }
    const r = await this.run(inv, ['--json']);
    if (!r.ok) {
      s.error = r.error;
      return this.publish(s, touched);
    }
    const list = r.doc as ListDoc;
    s.list = list;
    s.error = null;
    s.fetchedAt = this.now();

    const summaryKeys = new Map<string, string>();
    for (const t of list.tasks) {
      const k = JSON.stringify(t);
      summaryKeys.set(t.dir, k);
      const prev = s.summaryKeys.get(t.dir);
      if (prev !== undefined && prev !== k) touched.add(t.dir);
    }
    s.summaryKeys = summaryKeys;

    const activeDirs = list.tasks.filter((t) => isActiveStatus(t.status)).map((t) => t.dir);
    for (const dir of [...s.active.keys()]) if (!activeDirs.includes(dir)) s.active.delete(dir);
    for (const dir of activeDirs) {
      const d = await this.run(inv, ['--json', dir]);
      if (!d.ok) continue; // 保留上一次的 detail
      const doc = d.doc as DetailDoc;
      const prev = s.active.get(dir);
      if (prev && JSON.stringify(prev.task) !== JSON.stringify(doc.task)) touched.add(dir);
      s.active.set(dir, doc);
    }
    this.publish(s, touched);
  }

  private publish(s: ProjectState, touched: Set<string>): void {
    const key = JSON.stringify({
      mode: s.mode,
      v: s.dkboVersion,
      e: s.error,
      l: s.list && withoutGenerated(s.list),
      a: [...s.active].map(([dir, d]) => [dir, d.task]),
    });
    const changed = key !== s.key;
    s.key = key;
    if (changed) this.emit('changed', s.cfg.name);
    for (const dir of touched) this.emit('task', { project: s.cfg.name, dir } satisfies TaskRef);
  }

  /** 單一任務 detail：進行中用 active、已結案用快取，否則按需跑一次 */
  async detail(name: string, dir: string): Promise<DetailResult> {
    const s = this.state(name);
    if (!s) return { ok: false, status: 404, error: { kind: 'missing', message: `no project '${name}'` } };
    const active = s.active.get(dir);
    if (active) return { ok: true, doc: active };
    const cached = this.closedCached(s, dir);
    if (cached) return { ok: true, doc: cached };
    return this.exclusive(s, async (): Promise<DetailResult> => {
      const again = s.active.get(dir) ?? this.closedCached(s, dir);
      if (again) return { ok: true, doc: again };
      const inv = await this.opts.registry.invocation(s.cfg);
      if (!inv.ok) return { ok: false, status: 502, error: inv.error };
      const r = await this.run(inv, ['--json', dir]);
      if (!r.ok) return { ok: false, status: r.code === 1 ? 404 : 502, error: r.error };
      const doc = r.doc as DetailDoc;
      if (isClosedStatus(doc.task.status)) s.closed.set(doc.task.dir, { closedAt: doc.task.closed_at, doc });
      return { ok: true, doc };
    });
  }

  private closedCached(s: ProjectState, dir: string): DetailDoc | null {
    const c = s.closed.get(dir);
    const t = s.list?.tasks.find((x) => x.dir === dir);
    return c && t && isClosedStatus(t.status) && t.closed_at === c.closedAt ? c.doc : null;
  }

  /** 補已結案任務的 detail 快取（一次排進鎖，最多 limit 個；冷卻中的失敗 dir 跳過；給 only 時只補其中的 dir） */
  private ensureClosed(s: ProjectState, limit = Infinity, only?: ReadonlySet<string>): Promise<void> {
    const cooling = (dir: string) => {
      const at = s.closedFailed.get(dir);
      return at !== undefined && this.now() - at < PREFETCH_RETRY_MS;
    };
    const missing = () =>
      (s.list?.tasks ?? [])
        .filter((t) => (!only || only.has(t.dir)) && isClosedStatus(t.status) && !this.closedCached(s, t.dir) && !cooling(t.dir))
        .slice(0, limit);
    if (missing().length === 0) return Promise.resolve();
    return this.exclusive(s, async () => {
      const todo = missing();
      if (todo.length === 0) return;
      const inv = await this.opts.registry.invocation(s.cfg);
      if (!inv.ok) return;
      for (const t of todo) {
        const r = await this.run(inv, ['--json', t.dir]);
        if (r.ok) {
          const doc = r.doc as DetailDoc;
          s.closed.set(t.dir, { closedAt: t.closed_at, doc });
          s.closedFailed.delete(t.dir);
        } else {
          s.closedFailed.set(t.dir, this.now());
        }
      }
    });
  }

  /** 專案現在的派工對照表（只以文字讀 roles／kinds 檔，不 source 不執行） */
  private tierConfig(s: ProjectState): Promise<TierConfig> {
    return this.tiers.read(s.cfg.path);
  }

  private dispatchWith(s: ProjectState, task: TaskDetail, config: TierConfig): Dispatch[] {
    const c = s.dispatch.get(task.dir);
    if (c && c.task === task && c.config === config) return c.list;
    const list = parseDispatch(task.events, task.short, config);
    s.dispatch.set(task.dir, { task, config, list });
    return list;
  }

  /** 某專案某任務的派工紀錄（依 at 升冪）；找不到專案回空陣列 */
  async dispatchOf(name: string, task: TaskDetail): Promise<Dispatch[]> {
    const s = this.state(name);
    return s ? this.dispatchWith(s, task, await this.tierConfig(s)) : [];
  }

  /**
   * 花費歸屬用的派工索引：只用手上已有的 detail（進行中的 active、已結案的快取；缺的已結案 detail 先補抓一次），
   * 不為其他狀態的任務另跑 dk-status。對不到的任務不放進索引（歸屬為 null）。
   */
  async dispatchIndex(refs: TaskRef[]): Promise<DispatchIndex> {
    const out: DispatchIndex = {};
    const wanted = new Map<string, Set<string>>();
    for (const r of refs) {
      const set = wanted.get(r.project);
      if (set) set.add(r.dir);
      else wanted.set(r.project, new Set([r.dir]));
    }
    await Promise.all(
      [...wanted].map(async ([name, dirs]) => {
        const s = this.state(name);
        if (!s) return;
        await this.ensureClosed(s, Infinity, dirs);
        const config = await this.tierConfig(s);
        const byDir: Record<string, Dispatch[]> = {};
        for (const dir of dirs) {
          const doc = s.active.get(dir) ?? this.closedCached(s, dir);
          if (doc) byDir[dir] = this.dispatchWith(s, doc.task, config);
        }
        out[name] = byDir;
      }),
    );
    return out;
  }

  /** 活動欄的來源：只取手上已有的 detail（進行中的 active、已結案的快取），不跑 dk-status；24h 過濾交給 activityFeed */
  activityTasks(): ActivityTask[] {
    const out: ActivityTask[] = [];
    for (const s of this.states) {
      for (const t of s.list?.tasks ?? []) {
        const doc = s.active.get(t.dir) ?? (isClosedStatus(t.status) ? this.closedCached(s, t.dir) : null);
        if (doc) out.push({ project: s.cfg.name, detail: doc.task });
      }
    }
    return out;
  }

  async history(): Promise<HistoryRow[]> {
    await Promise.all(this.states.map((s) => this.ensureClosed(s)));
    const rows: HistoryRow[] = [];
    for (const s of this.states) {
      const config = await this.tierConfig(s);
      for (const t of s.list?.tasks ?? []) {
        const doc = isClosedStatus(t.status) ? this.closedCached(s, t.dir) : null;
        if (doc) rows.push(historyRow(s.cfg.name, doc.task, config));
      }
    }
    return rows.sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? '') || a.project.localeCompare(b.project));
  }
}
