// GET /api/trends、/api/costs 的彙總：每次請求讀全部保留期樣本，花費一律先全期算差額再依範圍篩（差額逐檔快取）。
// 同時進來的請求共用同一輪讀檔（進行中的 load promise）；server 起來後 warm() 先在背景跑一輪，冷啟動第一個請求就不用等讀檔。
import {
  BUCKET_MS,
  costByDay,
  costByKind,
  COST_RANGES,
  ctxSeries,
  projections,
  RANGE_MS,
  spendDeltas,
  spendDeltasStep,
  spendInRange,
  summarizeCosts,
  TREND_RANGES,
  usageSeries,
  type CostRange,
  type CostsResponse,
  type DispatchIndex,
  type SpendEntry,
  type TaskRef,
  type TrendRange,
  type TrendsResponse,
  type UsageSample,
} from '@dash/shared';
import type { SampleFile, SampleStore } from './usage.ts';

export const isTrendRange = (s: string): s is TrendRange => (TREND_RANGES as readonly string[]).includes(s);
export const isCostRange = (s: string): s is CostRange => (COST_RANGES as readonly string[]).includes(s);

interface Slot {
  samples: UsageSample[];
  carryIn: ReadonlyMap<string, number>;
  entries: SpendEntry[];
  carry: Map<string, number>;
  minTs: number;
  maxTs: number;
}

const NO_CARRY: ReadonlyMap<string, number> = new Map();

/**
 * spendDeltas 的逐檔快取：舊日檔不再變動，只重算 samples 陣列換了（或前一檔的 carry 換了）的檔。
 * 結果與 spendDeltas(全部樣本) 相同；檔案之間時間交錯（樣本放錯日檔）時退回一次全算。
 */
export class DeltaCache {
  /** 上一次 deltas() 重算了幾個檔（測試用） */
  recomputed = 0;
  private slots: Slot[] = [];
  private all: SpendEntry[] = [];

  deltas(files: SampleFile[]): SpendEntry[] {
    this.recomputed = 0;
    const next: Slot[] = [];
    let carry = NO_CARRY;
    let prevMax = -Infinity;
    let ordered = true;
    for (const [i, f] of files.entries()) {
      let slot = this.slots[i];
      if (!slot || slot.samples !== f.samples || slot.carryIn !== carry) {
        let minTs = Infinity;
        let maxTs = -Infinity;
        for (const x of f.samples) {
          if (x.ts < minTs) minTs = x.ts;
          if (x.ts > maxTs) maxTs = x.ts;
        }
        slot = { samples: f.samples, carryIn: carry, ...spendDeltasStep(f.samples, carry), minTs, maxTs };
        this.recomputed++;
      }
      if (slot.minTs < prevMax) ordered = false;
      prevMax = Math.max(prevMax, slot.maxTs);
      carry = slot.carry;
      next.push(slot);
    }
    if (!ordered) {
      this.slots = [];
      this.all = [];
      this.recomputed = files.length;
      return spendDeltas(files.flatMap((f) => f.samples));
    }
    if (this.recomputed > 0 || next.length !== this.slots.length) {
      this.all = [];
      for (const s of next) for (const e of s.entries) this.all.push(e);
    }
    this.slots = next;
    return this.all;
  }
}

export interface TrendsServiceOpts {
  store: SampleStore;
  now: () => number;
  /** paneId → herdr 目前的註冊名（ctx 圖例在樣本沒有 member 時用） */
  names: () => Record<string, string>;
  /** 花費「設定」歸屬用的派工索引（collector.dispatchIndex）；不給時設定全為 null */
  dispatch?: (refs: TaskRef[]) => Promise<DispatchIndex>;
}

/** 花費裡出現過的任務（project、taskDir 都有值），去重 */
function taskRefs(entries: SpendEntry[]): TaskRef[] {
  const seen = new Map<string, Set<string>>();
  const out: TaskRef[] = [];
  for (const e of entries) {
    if (e.project === null || e.taskDir === null) continue;
    let dirs = seen.get(e.project);
    if (!dirs) seen.set(e.project, (dirs = new Set()));
    if (dirs.has(e.taskDir)) continue;
    dirs.add(e.taskDir);
    out.push({ project: e.project, dir: e.taskDir });
  }
  return out;
}

const samplesIn = (samples: UsageSample[], from: number, to: number) => samples.filter((x) => x.ts >= from && x.ts <= to);

interface Loaded {
  samples: UsageSample[];
  spend: SpendEntry[];
  skipped: number;
}

export class TrendsService {
  private readonly deltaCache = new DeltaCache();
  private loading: Promise<Loaded> | null = null;
  /**
   * range=all 的彙總快取。結果只跟差額陣列（DeltaCache 在檔案沒變時回同一個陣列，檔案一變自然失效）、
   * 派工索引的內容（dispatchKey），與「哪些差額／樣本 ts <= now」有關：[lo, hi) 是算進去的集合不變的 now 區間
   * （lo＝已算進去的最大 ts，hi＝下一筆的 ts；樣本也算，memberInfo.actual 取範圍內最後一筆樣本）。
   */
  private allCosts: { spend: SpendEntry[]; minTs: number; lo: number; hi: number; dispatchKey: string; summary: ReturnType<typeof summarizeCosts> } | null = null;
  /** range=all 用的任務清單，跟著差額陣列的身分快取 */
  private allRefs: { spend: SpendEntry[]; refs: TaskRef[] } | null = null;

  constructor(private readonly o: TrendsServiceOpts) {}

  private load(): Promise<Loaded> {
    this.loading ??= this.readAll().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }

  private async readAll(): Promise<Loaded> {
    const { files, skipped } = await this.o.store.files();
    const samples: UsageSample[] = [];
    for (const f of files) for (const x of f.samples) samples.push(x);
    return { samples, spend: this.deltaCache.deltas(files), skipped };
  }

  /** 冷啟動預熱：讀一輪樣本檔、算好差額快取，並各算一次 trends 24h 與 costs all（填 allCosts、讓 JIT 先熱起來） */
  async warm(): Promise<void> {
    await this.trends('24h');
    await this.costs('all');
  }

  async trends(range: TrendRange): Promise<TrendsResponse> {
    const now = this.o.now();
    const { samples, spend: all, skipped } = await this.load();
    const from = now - RANGE_MS[range];
    const bucketMs = BUCKET_MS[range];
    const spend = spendInRange(all, from, now);
    return {
      range,
      from,
      to: now,
      bucketMs,
      generatedAt: now,
      skipped,
      dataDir: this.o.store.dataDir,
      usage: usageSeries(samples, from, now, bucketMs),
      projection: projections(samples, now),
      ctx: ctxSeries(samples, from, now, bucketMs, this.o.names()),
      costByDay: costByDay(spend),
      costByKind: costByKind(spend),
    };
  }

  private async dispatchFor(refs: TaskRef[]): Promise<DispatchIndex> {
    if (!this.o.dispatch || refs.length === 0) return {};
    try {
      return await this.o.dispatch(refs);
    } catch (e) {
      console.error(`costs: 取派工紀錄失敗：${String(e)}`);
      return {};
    }
  }

  async costs(range: CostRange): Promise<CostsResponse> {
    const now = this.o.now();
    const { samples, spend, skipped } = await this.load();
    if (range !== 'all' || samples.length === 0) {
      const from = range === 'all' ? now : now - RANGE_MS[range];
      const entries = spendInRange(spend, from, now);
      const dispatch = await this.dispatchFor(taskRefs(entries));
      return { range, generatedAt: now, from, to: now, skipped, ...summarizeCosts(entries, { dispatch, samples: samplesIn(samples, from, now) }) };
    }
    if (this.allRefs?.spend !== spend) this.allRefs = { spend, refs: taskRefs(spend) };
    const dispatch = await this.dispatchFor(this.allRefs.refs);
    const dispatchKey = JSON.stringify(dispatch);
    let c = this.allCosts;
    if (c?.spend !== spend || c.dispatchKey !== dispatchKey || now < c.lo || now >= c.hi) {
      const minTs = c?.spend === spend ? c.minTs : samples.reduce((m, x) => Math.min(m, x.ts), Infinity);
      let lo = -Infinity;
      let hi = Infinity;
      for (const x of [spend, samples])
        for (const e of x) {
          if (e.ts <= now) lo = Math.max(lo, e.ts);
          else hi = Math.min(hi, e.ts);
        }
      const from = Math.min(minTs, now);
      c = this.allCosts = {
        spend,
        minTs,
        lo,
        hi,
        dispatchKey,
        summary: summarizeCosts(spendInRange(spend, from, now), { dispatch, samples: samplesIn(samples, from, now) }),
      };
    }
    return { range, generatedAt: now, from: Math.min(c.minTs, now), to: now, skipped, ...c.summary };
  }
}
