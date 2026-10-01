// 花費與額度趨勢：server 取樣落地的形狀、兩支 API 的回應、以及算花費／序列／預估的純函式。
// 花費規則只有這一份：server 彙總與前端、qa 驗算都用這裡的函式。
import { dispatchAt, modelMismatch, type Dispatch, type DispatchIndex, type ModelEffort } from './dispatch.ts';
import type { PaneStatus } from './types.ts';

/** `samples/YYYY-MM-DD.jsonl` 的一行；欄位取自取樣當下的 `OverviewDoc.agents` */
export interface UsageSample {
  /** 取樣時間（epoch ms）；同一輪取樣的所有 pane 共用同一個 ts */
  ts: number;
  paneId: string;
  /** herdr agent 種類（claude／codex…），即額度分組的 kind */
  agent: string | null;
  project: string | null;
  taskDir: string | null;
  member: string | null;
  status: PaneStatus;
  /** herdr 的 session 累計花費（美元） */
  cost: number | null;
  ctxPct: number | null;
  usage5hPct: number | null;
  usageWkPct: number | null;
  /** 取自 PaneLive.model／effort；舊格式樣本沒有這兩欄，一律視為 null */
  model?: string | null;
  effort?: string | null;
}

export type TrendRange = '6h' | '24h' | '7d' | '30d';
export type CostRange = TrendRange | 'all';

export const TREND_RANGES: readonly TrendRange[] = ['6h', '24h', '7d', '30d'];
export const COST_RANGES: readonly CostRange[] = [...TREND_RANGES, 'all'];

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** 範圍長度：`[to − RANGE_MS, to]` */
export const RANGE_MS: Record<TrendRange, number> = { '6h': 6 * HOUR, '24h': DAY, '7d': 7 * DAY, '30d': 30 * DAY };
/** 額度與 ctx 序列的 bucket 寬度（寫死） */
export const BUCKET_MS: Record<TrendRange, number> = { '6h': 5 * MIN, '24h': 15 * MIN, '7d': HOUR, '30d': 6 * HOUR };
/** 同一 pane 值沒變時，距上一筆滿這麼久仍寫一筆（心跳） */
export const HEARTBEAT_MS = 10 * MIN;
/** 撞額度預估取樣窗：5h 額度看最近 60 分鐘、週額度看最近 24 小時 */
export const PROJECTION_WINDOW_MS = { fiveHour: HOUR, week: DAY } as const;
/** 預估晚於 now＋這個值就回 null（額度重置會先到） */
export const PROJECTION_HORIZON_MS = { fiveHour: 5 * HOUR, week: 7 * DAY } as const;
/** agent 為 null 的樣本在 costByKind 裡歸到這個 key */
export const UNKNOWN_KIND = 'unknown';

export interface UsagePoint {
  /** bucket 起點（epoch ms） */
  t: number;
  /** bucket 內該 kind 所有 pane 的最大值；bucket 內都沒值為 null */
  fiveHourPct: number | null;
  weekPct: number | null;
}

export interface KindProjection {
  /** 預估 5h 額度達 100% 的 epoch ms；無法預估或重置會先到為 null */
  fiveHourAt: number | null;
  weekAt: number | null;
}

export interface CtxSeries {
  paneId: string;
  /** 圖例：member → herdr 註冊名 → agent → paneId */
  label: string;
  points: { t: number; ctxPct: number }[];
}

export interface DayCost {
  /** server 本地日期 YYYY-MM-DD */
  day: string;
  project: string | null;
  cost: number;
}

/** GET /api/trends?range= */
export interface TrendsResponse {
  range: TrendRange;
  from: number;
  to: number;
  bucketMs: number;
  generatedAt: number;
  /** 讀檔時略過的壞行數 */
  skipped: number;
  /** server 解析後的資料目錄絕對路徑 */
  dataDir: string;
  /** key 為 kind；只放有樣本的 bucket，依 t 升冪 */
  usage: Record<string, UsagePoint[]>;
  /** key 為 kind；以 generatedAt 為 now 計算，與 range 無關 */
  projection: Record<string, KindProjection>;
  /** 範圍內有 ctx 值的 pane，依 label 升冪 */
  ctx: CtxSeries[];
  /** 依 day、project 升冪（null 專案排最後） */
  costByDay: DayCost[];
  /** key 為 kind（agent 為 null 歸 UNKNOWN_KIND） */
  costByKind: Record<string, number>;
}

/** 依實際（herdr 回報、寫進樣本）的 model／effort 小計 */
export interface ModelCost {
  model: string | null;
  effort: string | null;
  cost: number;
}

/** 依設定（dkbo 派工）的檔位小計；找不到派工時 kind／tier／model／effort 全為 null */
export interface TierCost {
  /** 只在 TaskCost.byConfigured 出現：roleOf(member) */
  role?: string | null;
  kind: string | null;
  tier: string | null;
  model: string | null;
  effort: string | null;
  cost: number;
}

/** 實際與設定不一致的一段花費：同 (paneId, project, taskDir, member, 實際 model／effort, 設定 model／effort) 的 SpendEntry 加總（同 pane 換任務時各任務各一列） */
export interface MismatchPane {
  paneId: string;
  project: string | null;
  taskDir: string | null;
  member: string | null;
  actual: ModelEffort;
  configured: ModelEffort;
  cost: number;
}

export interface MemberInfo {
  /** 該成員在本任務最後一次派工；沒有 spawn 行為 null */
  configured: Dispatch | null;
  /** 該成員在本任務的派工次數 */
  dispatchCount: number;
  /** 範圍內該成員最後一筆樣本的 model／effort；範圍內沒有樣本為 null */
  actual: ModelEffort | null;
  /** 範圍內該成員有任一筆花費判為不一致（⇔ mismatch.panes 有本任務本成員的列） */
  mismatch: boolean;
}

export interface TaskCost {
  project: string;
  taskDir: string;
  /** = Σ members + unmatched = Σ byConfigured.cost */
  cost: number;
  /** key 為 member（state 名） */
  members: Record<string, number>;
  /** 本任務內 member 為 null 的花費 */
  unmatched: number;
  /** 依 (role, kind, tier, model, effort) 的設定歸屬，cost 降冪 */
  byConfigured: TierCost[];
  /** key 同 members */
  memberInfo: Record<string, MemberInfo>;
}

/** GET /api/costs?range= */
export interface CostsResponse {
  range: CostRange;
  generatedAt: number;
  /** range=all 時為最早一筆樣本的 ts（沒樣本時等於 to） */
  from: number;
  to: number;
  skipped: number;
  /** 依 cost 降冪 */
  tasks: TaskCost[];
  /** key 為角色（member 第一個 `-` 之前） */
  byRole: Record<string, number>;
  /** member 為 null 的花費（含 unattributed 那部分） */
  unknownRole: number;
  /** taskDir 或 project 為 null 的花費（這部分不進 tasks） */
  unattributed: number;
  /** 依實際 model／effort，cost 降冪；Σ cost = Σ tasks.cost + unattributed */
  byActual: ModelCost[];
  /** 依設定 (kind, tier, model, effort)（不含 role），cost 降冪；Σ cost = Σ tasks.cost + unattributed */
  byConfigured: TierCost[];
  mismatch: {
    /** = Σ panes.cost */
    cost: number;
    /** cost 降冪 */
    panes: MismatchPane[];
  };
}

/** 一筆花費：某 pane 兩筆相鄰樣本之間花掉的錢，歸屬取後一筆樣本 */
export interface SpendEntry {
  ts: number;
  paneId: string;
  agent: string | null;
  project: string | null;
  taskDir: string | null;
  member: string | null;
  cost: number;
  /** 後一筆樣本的 model／effort（缺欄為 null） */
  model: string | null;
  effort: string | null;
}

/** server 本地時區的日期 YYYY-MM-DD */
export function localDay(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 測試與 e2e 用的樣本：以 nowMs 當天與前一天的本地中午為錨點，每 10 分鐘一輪、共 12 輪（錨點起 110 分鐘）。
 * 每天四顆 pane（paneId 帶日別，跨日不相連）：
 * - `p1` claude／frontend-shell／teamflow 2026-09-24-bklog：第 6 輪 session 重開（cost 3.5 → 0.25）；每天花費 4.0
 * - `p2` claude／backend：前 6 輪在 2026-09-24-bklog、第 6 輪起換到 2026-09-23-ops；bklog 2.5、ops 3.0
 * - `p3` codex／member null／teamflow 2026-09-23-ops：unmatched 2.75
 * - `p4` codex／member、project、taskDir 全 null：unattributed 5.5
 * 每天合計 17.75（teamflow 12.25、未歸屬 5.5）；所有金額都是 0.25 的倍數，浮點加總無誤差。
 * model／effort（實際）：p1 `sonnet 5`，前 6 輪 effort `medium`、第 6 輪起 `high`；p2 `opus 5.5`／`high`；
 * p3 沒有這兩欄（模擬舊樣本）；p4 `gpt-5.5`／`medium`。
 * 搭配 fixtures 的 teamflowTierConfig 與 bklog／ops 的 spawn 事件（p1 設定 frontend M＝sonnet/medium、p2 設定 L＝opus/high），
 * 每天 p1 後 6 輪（1.5）實際 effort high 對設定 medium → 每天一列 mismatch.panes。
 */
export function makeSampleFixture(nowMs: number): Record<string, UsageSample[]> {
  const now = new Date(nowMs);
  const out: Record<string, UsageSample[]> = {};
  for (const back of [1, 0]) {
    const anchor = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back, 12).getTime();
    const w = `wF${back}`;
    const rows: UsageSample[] = [];
    for (let k = 0; k < 12; k++) {
      const ts = anchor + k * 10 * MIN;
      const status: PaneStatus = k === 11 ? 'idle' : 'working';
      const claude = { usage5hPct: 10 + 2 * k, usageWkPct: 40 + 0.5 * k };
      const codex = { usage5hPct: 20 + 3 * k, usageWkPct: 30 + k };
      const base = { ts, status };
      rows.push(
        {
          ...base,
          paneId: `${w}:p1`,
          agent: 'claude',
          project: 'teamflow',
          taskDir: '2026-09-24-bklog',
          member: 'frontend-shell',
          cost: k < 6 ? 1 + 0.5 * k : 0.25 * (k - 5),
          ctxPct: k < 6 ? 10 + 10 * k : 5 + 5 * (k - 6),
          ...claude,
          model: 'sonnet 5',
          effort: k < 6 ? 'medium' : 'high',
        },
        {
          ...base,
          paneId: `${w}:p2`,
          agent: 'claude',
          project: 'teamflow',
          taskDir: k < 6 ? '2026-09-24-bklog' : '2026-09-23-ops',
          member: 'backend',
          cost: 0.5 + 0.5 * k,
          ctxPct: 8 + 4 * k,
          ...claude,
          model: 'opus 5.5',
          effort: 'high',
        },
        {
          ...base,
          paneId: `${w}:p3`,
          agent: 'codex',
          project: 'teamflow',
          taskDir: '2026-09-23-ops',
          member: null,
          cost: 0.25 + 0.25 * k,
          ctxPct: 15 + 3 * k,
          ...codex,
        },
        {
          ...base,
          paneId: `${w}:p4`,
          agent: 'codex',
          project: null,
          taskDir: null,
          member: null,
          cost: 1 + 0.5 * k,
          ctxPct: 20 + 2 * k,
          ...codex,
          model: 'gpt-5.5',
          effort: 'medium',
        },
      );
    }
    out[localDay(anchor)] = rows;
  }
  return out;
}

/** 角色＝member 第一個 `-` 之前（`frontend-shell` → `frontend`） */
export function roleOf(member: string | null): string | null {
  if (member === null) return null;
  const i = member.indexOf('-');
  return i < 0 ? member : member.slice(0, i);
}

const byPane = (samples: UsageSample[]): Map<string, UsageSample[]> => {
  const m = new Map<string, UsageSample[]>();
  for (const x of samples) {
    const a = m.get(x.paneId);
    if (a) a.push(x);
    else m.set(x.paneId, [x]);
  }
  for (const a of m.values()) a.sort((p, q) => p.ts - q.ts);
  return m;
};

/**
 * 花費差額：每個 pane 依時間排序，相鄰兩筆 cost 差 > 0 算差額；差 < 0 視為 session 重開，算後一筆的 cost 本身；
 * 每個 pane 的第一筆不算；cost 為 null 的樣本跳過、也不當基準。歸屬取後一筆。輸出依 ts 升冪。
 * 範圍內花費要拿整個保留期的樣本算完再用 spendInRange 篩，否則窗內每個 pane 的第一筆會被丟掉。
 */
export function spendDeltas(samples: UsageSample[]): SpendEntry[] {
  return spendDeltasStep(samples, new Map()).entries;
}

/**
 * 分段版的 spendDeltas：carry 為上一段每個 pane 最後一個非 null 的 cost，回傳本段的花費與新的 carry（不改傳入的）。
 * 各段依時間先後餵進來時，串起來等於一次算完；server 用它讓舊日檔不必每次重算。
 */
export function spendDeltasStep(samples: UsageSample[], carry: ReadonlyMap<string, number>): { entries: SpendEntry[]; carry: Map<string, number> } {
  const out: SpendEntry[] = [];
  const next = new Map(carry);
  for (const [paneId, rows] of byPane(samples)) {
    let prev = carry.get(paneId) ?? null;
    for (const x of rows) {
      if (x.cost === null) continue;
      if (prev !== null) {
        const d = x.cost - prev;
        const cost = d < 0 ? x.cost : d;
        if (cost > 0)
          out.push({ ts: x.ts, paneId: x.paneId, agent: x.agent, project: x.project, taskDir: x.taskDir, member: x.member, cost, model: x.model ?? null, effort: x.effort ?? null });
      }
      prev = x.cost;
    }
    if (prev !== null) next.set(paneId, prev);
  }
  return { entries: out.sort((p, q) => p.ts - q.ts), carry: next };
}

/** 依花費的 ts（即後一筆樣本的 ts）篩進 [from, to] */
export function spendInRange(entries: SpendEntry[], from: number, to: number): SpendEntry[] {
  return entries.filter((e) => e.ts >= from && e.ts <= to);
}

const add = (m: Record<string, number>, k: string, v: number) => {
  m[k] = (m[k] ?? 0) + v;
};

export type CostSummary = Pick<CostsResponse, 'tasks' | 'byRole' | 'unknownRole' | 'unattributed' | 'byActual' | 'byConfigured' | 'mismatch'>;

export interface SummarizeOpts {
  /** 設定歸屬用的派工索引；不給時設定全為 null */
  dispatch?: DispatchIndex;
  /** 範圍內的樣本（已篩好 [from, to]），給 memberInfo.actual 取最後一筆；不給時取該成員最後一筆花費 */
  samples?: UsageSample[];
}

const NUL = '\u0000';
/** 分組鍵：null 編成 \uffff，字典序比較時排在任何字串之後 */
const keyOf = (...xs: (string | null)[]) => xs.map((x) => (x === null ? '\uffff' : x)).join(NUL);
const byCostDesc = <T extends { cost: number }>(xs: T[]) => [...xs].sort((p, q) => q.cost - p.cost);

/** 以 key 分組加總；輸出依 cost 降冪，同額依 key 升冪（null 排後），與 entries 的順序無關 */
class Grouped<T extends { cost: number }> {
  private readonly m = new Map<string, T>();
  add(key: string, cost: number, make: () => T): T {
    let g = this.m.get(key);
    if (!g) this.m.set(key, (g = make()));
    g.cost += cost;
    return g;
  }
  sorted(): T[] {
    return [...this.m].sort((p, q) => q[1].cost - p[1].cost || (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : 0)).map(([, g]) => g);
  }
}

interface TaskAcc {
  t: TaskCost;
  byConfigured: Grouped<TierCost>;
  lastEntry: Map<string, SpendEntry>;
  mismatched: Set<string>;
}

/**
 * 依任務（project＋taskDir）、成員、角色彙總；tasks 依 cost 降冪。
 * 實際＝每筆花費的 model／effort；設定＝dispatchAt(該任務的派工, member, entry.ts)；每筆以 modelMismatch 判定不一致。
 */
export function summarizeCosts(entries: SpendEntry[], opts: SummarizeOpts = {}): CostSummary {
  const tasks: TaskAcc[] = [];
  const index = new Map<string, Map<string, TaskAcc>>();
  const roles = new Map<string, string | null>();
  const byRole: Record<string, number> = {};
  const byActual = new Grouped<ModelCost>();
  const byConfigured = new Grouped<TierCost>();
  const mismatch = new Grouped<MismatchPane>();
  let unknownRole = 0;
  let unattributed = 0;
  for (const e of entries) {
    let role = e.member === null ? null : roles.get(e.member);
    if (role === undefined) roles.set(e.member!, (role = roleOf(e.member)));
    if (role === null) unknownRole += e.cost;
    else add(byRole, role, e.cost);
    byActual.add(keyOf(e.model, e.effort), e.cost, () => ({ model: e.model, effort: e.effort, cost: 0 }));
    const d = e.project === null || e.taskDir === null ? null : dispatchAt(opts.dispatch?.[e.project]?.[e.taskDir], e.member, e.ts);
    const kind = d?.kind ?? null;
    const tier = d?.tier ?? null;
    const model = d?.model ?? null;
    const effort = d?.effort ?? null;
    byConfigured.add(keyOf(kind, tier, model, effort), e.cost, () => ({ kind, tier, model, effort, cost: 0 }));
    const bad = d !== null && modelMismatch(e, d);
    if (bad) {
      mismatch.add(keyOf(e.paneId, e.project, e.taskDir, e.member, e.model, e.effort, model, effort), e.cost, () => ({
        paneId: e.paneId,
        project: e.project,
        taskDir: e.taskDir,
        member: e.member,
        actual: { model: e.model, effort: e.effort },
        configured: { model, effort },
        cost: 0,
      }));
    }
    // aggregator 只在對到專案時才帶 taskDir；project 為 null 一併視為未歸屬，恆等式才閉合
    if (e.taskDir === null || e.project === null) {
      unattributed += e.cost;
      continue;
    }
    let byDir = index.get(e.project);
    if (!byDir) index.set(e.project, (byDir = new Map()));
    let a = byDir.get(e.taskDir);
    if (!a) {
      a = {
        t: { project: e.project, taskDir: e.taskDir, cost: 0, members: {}, unmatched: 0, byConfigured: [], memberInfo: {} },
        byConfigured: new Grouped(),
        lastEntry: new Map(),
        mismatched: new Set(),
      };
      byDir.set(e.taskDir, a);
      tasks.push(a);
    }
    a.t.cost += e.cost;
    a.byConfigured.add(keyOf(role, kind, tier, model, effort), e.cost, () => ({ role, kind, tier, model, effort, cost: 0 }));
    if (e.member === null) {
      a.t.unmatched += e.cost;
      continue;
    }
    add(a.t.members, e.member, e.cost);
    const prev = a.lastEntry.get(e.member);
    if (!prev || e.ts >= prev.ts) a.lastEntry.set(e.member, e);
    if (bad) a.mismatched.add(e.member);
  }
  const lastSample = new Map<string, UsageSample>();
  for (const x of opts.samples ?? []) {
    if (x.project === null || x.taskDir === null || x.member === null) continue;
    const k = keyOf(x.project, x.taskDir, x.member);
    const p = lastSample.get(k);
    if (!p || x.ts >= p.ts) lastSample.set(k, x);
  }
  for (const a of tasks) {
    a.t.byConfigured = a.byConfigured.sorted();
    const dispatch = opts.dispatch?.[a.t.project]?.[a.t.taskDir] ?? [];
    for (const m of Object.keys(a.t.members)) {
      const mine = dispatch.filter((d) => d.member === m);
      const src = opts.samples ? lastSample.get(keyOf(a.t.project, a.t.taskDir, m)) : a.lastEntry.get(m);
      a.t.memberInfo[m] = {
        configured: mine.at(-1) ?? null,
        dispatchCount: mine.length,
        actual: src ? { model: src.model ?? null, effort: src.effort ?? null } : null,
        mismatch: a.mismatched.has(m),
      };
    }
  }
  const panes = mismatch.sorted();
  return {
    tasks: byCostDesc(tasks.map((a) => a.t)),
    byRole,
    unknownRole,
    unattributed,
    byActual: byActual.sorted(),
    byConfigured: byConfigured.sorted(),
    mismatch: { cost: panes.reduce((x, p) => x + p.cost, 0), panes },
  };
}

/** 每日（本地日期）× 專案的花費；依 day、project 升冪，null 專案排在當天最後 */
export function costByDay(entries: SpendEntry[]): DayCost[] {
  const out: DayCost[] = [];
  const index = new Map<string, Map<string | null, DayCost>>();
  // entries 多半依 ts 排好：記住上一個本地日的 [lo, hi)，同一天就不必再格式化日期
  let lo = Infinity;
  let hi = -Infinity;
  let day = '';
  for (const e of entries) {
    if (e.ts < lo || e.ts >= hi) {
      const d = new Date(e.ts);
      lo = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      hi = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
      day = localDay(e.ts);
    }
    let byProject = index.get(day);
    if (!byProject) index.set(day, (byProject = new Map()));
    const c = byProject.get(e.project);
    if (c) c.cost += e.cost;
    else {
      const n = { day, project: e.project, cost: e.cost };
      byProject.set(e.project, n);
      out.push(n);
    }
  }
  return out.sort((p, q) =>
    p.day !== q.day ? (p.day < q.day ? -1 : 1) : p.project === q.project ? 0 : p.project === null ? 1 : q.project === null ? -1 : p.project < q.project ? -1 : 1,
  );
}

/** 依 kind 的花費小計；agent 為 null 歸 UNKNOWN_KIND */
export function costByKind(entries: SpendEntry[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const e of entries) add(m, e.agent ?? UNKNOWN_KIND, e.cost);
  return m;
}

const maxOrNull = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.max(a, b));
const bucketOf = (ts: number, bucketMs: number) => Math.floor(ts / bucketMs) * bucketMs;

/** 額度序列：[from, to] 內每個 kind 依 bucket 取最大值；只放有樣本的 bucket；agent 為 null 的樣本不算 */
export function usageSeries(samples: UsageSample[], from: number, to: number, bucketMs: number): Record<string, UsagePoint[]> {
  const kinds = new Map<string, Map<number, UsagePoint>>();
  for (const x of samples) {
    if (x.agent === null || x.ts < from || x.ts > to) continue;
    let m = kinds.get(x.agent);
    if (!m) kinds.set(x.agent, (m = new Map()));
    const t = bucketOf(x.ts, bucketMs);
    const p = m.get(t);
    if (p) {
      p.fiveHourPct = maxOrNull(p.fiveHourPct, x.usage5hPct);
      p.weekPct = maxOrNull(p.weekPct, x.usageWkPct);
    } else m.set(t, { t, fiveHourPct: x.usage5hPct, weekPct: x.usageWkPct });
  }
  const out: Record<string, UsagePoint[]> = {};
  for (const [k, m] of kinds) out[k] = [...m.values()].sort((p, q) => p.t - q.t);
  return out;
}

/**
 * ctx 序列：[from, to] 內每個 pane 一條，bucket 取最大值，ctxPct 為 null 不出點；沒有點的 pane 不列。
 * label 取範圍內最後一筆的 member，其次 names[paneId]（herdr 註冊名，樣本不存），再其次 agent、paneId。依 label 升冪。
 */
export function ctxSeries(samples: UsageSample[], from: number, to: number, bucketMs: number, names: Record<string, string> = {}): CtxSeries[] {
  const panes = new Map<string, { last: UsageSample; m: Map<number, number> }>();
  for (const x of samples) {
    if (x.ts < from || x.ts > to) continue;
    let p = panes.get(x.paneId);
    if (!p) panes.set(x.paneId, (p = { last: x, m: new Map() }));
    else if (x.ts >= p.last.ts) p.last = x; // 同 ts 取輸入順序較後者，同穩定排序後的最後一筆
    if (x.ctxPct === null) continue;
    const t = bucketOf(x.ts, bucketMs);
    const v = p.m.get(t);
    if (v === undefined || x.ctxPct > v) p.m.set(t, x.ctxPct);
  }
  const out: CtxSeries[] = [];
  for (const [paneId, { last, m }] of panes) {
    if (m.size === 0) continue;
    out.push({
      paneId,
      label: last.member ?? names[paneId] ?? last.agent ?? paneId,
      points: [...m].sort((p, q) => p[0] - q[0]).map(([t, ctxPct]) => ({ t, ctxPct })),
    });
  }
  return out.sort((p, q) => (p.label < q.label ? -1 : p.label > q.label ? 1 : 0));
}

/**
 * 撞額度預估：只用最後一次下降（後一點 < 前一點，視為額度重置）之後的點。
 * 最新值 ≥ 100 回最新點的 t；剩下點數 ≥ 3 且最小平方斜率 > 0 時回直線達 100 的時間；
 * 預估早於 nowMs（樣本都舊了，外推點落在過去）或晚於 nowMs＋horizonMs（重置會先到）回 null，其他情況也回 null。
 */
export function projectHit(points: { t: number; pct: number }[], nowMs: number, horizonMs: number): number | null {
  const all = [...points].sort((p, q) => p.t - q.t);
  let start = 0;
  for (let i = 1; i < all.length; i++) if (all[i].pct < all[i - 1].pct) start = i;
  const p = all.slice(start);
  if (p.length === 0) return null;
  const last = p[p.length - 1];
  if (last.pct >= 100) return last.t;
  if (p.length < 3) return null;
  const n = p.length;
  const mt = p.reduce((a, x) => a + x.t, 0) / n;
  const mv = p.reduce((a, x) => a + x.pct, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const x of p) {
    sxy += (x.t - mt) * (x.pct - mv);
    sxx += (x.t - mt) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  if (!(slope > 0)) return null;
  const at = Math.round(mt + (100 - mv) / slope);
  return at < nowMs || at > nowMs + horizonMs ? null : at;
}

/**
 * 某 kind 在 [from, to] 的額度點：每個取樣時點取同 kind 各 pane 的最大值。
 * 去重會讓值沒變的 pane 在某些時點沒寫，所以每個 pane 沿用它上一筆的值（最多 2×心跳），
 * 否則舊值較低的 pane 單獨寫入的時點會被誤當成額度重置。
 */
function kindPoints(rows: UsageSample[], field: 'usage5hPct' | 'usageWkPct', from: number, to: number): { t: number; pct: number }[] {
  const xs = rows.filter((x) => x.ts >= from && x.ts <= to && x[field] !== null).sort((p, q) => p.ts - q.ts);
  const latest = new Map<string, { t: number; v: number }>();
  const out: { t: number; pct: number }[] = [];
  for (let i = 0; i < xs.length; i++) {
    latest.set(xs[i].paneId, { t: xs[i].ts, v: xs[i][field]! });
    if (i + 1 < xs.length && xs[i + 1].ts === xs[i].ts) continue;
    const t = xs[i].ts;
    let pct = -Infinity;
    for (const l of latest.values()) if (t - l.t <= 2 * HEARTBEAT_MS) pct = Math.max(pct, l.v);
    out.push({ t, pct });
  }
  return out;
}

/** 每個 kind 的撞額度預估（5h 看最近 60 分鐘、週看最近 24 小時） */
export function projections(samples: UsageSample[], nowMs: number): Record<string, KindProjection> {
  const kinds = new Map<string, UsageSample[]>();
  for (const x of samples) {
    if (x.agent === null) continue;
    const a = kinds.get(x.agent);
    if (a) a.push(x);
    else kinds.set(x.agent, [x]);
  }
  const out: Record<string, KindProjection> = {};
  for (const [k, rows] of kinds) {
    out[k] = {
      fiveHourAt: projectHit(kindPoints(rows, 'usage5hPct', nowMs - PROJECTION_WINDOW_MS.fiveHour, nowMs), nowMs, PROJECTION_HORIZON_MS.fiveHour),
      weekAt: projectHit(kindPoints(rows, 'usageWkPct', nowMs - PROJECTION_WINDOW_MS.week, nowMs), nowMs, PROJECTION_HORIZON_MS.week),
    };
  }
  return out;
}
