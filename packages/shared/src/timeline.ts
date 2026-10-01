// 波次耗時與分析計算，演算法逐條對照 .dkbo/bin/dk-timeline 與 lib/common.sh：
// dk_ts_pick＝第 2／3／4 欄逐欄相等的「最後一筆」；dk_span 缺端點印「—」（這裡給 null），不是 0。
import type { TaskDetail, TaskEvent, Ts } from './dkstatus.ts';
import { EMPTY_TIER_CONFIG, parseDispatch, repairWaveCount, type TierConfig } from './dispatch.ts';
import type { HistoryRow } from './types.ts';

const TS_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** `YYYY-MM-DDTHH:MM` → 自 epoch 起的分鐘數（同 dk_ts_minutes 的 days_from_civil）；格式壞回 null */
export function tsMinutes(ts: string | null | undefined): number | null {
  const m = ts ? TS_RE.exec(ts) : null;
  if (!m) return null;
  const [y, mo, d, hh, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mi > 59) return null;
  const yy = mo <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (mo + (mo > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  const days = era * 146097 + doe - 719468;
  return days * 1440 + hh * 60 + mi;
}

/** 兩個時間戳相差的分鐘數；任一端缺或壞就 null（同 dk_span 的「—」） */
export function spanMin(a: Ts | null | undefined, b: Ts | null | undefined): number | null {
  const x = tsMinutes(a);
  const y = tsMinutes(b);
  return x === null || y === null ? null : y - x;
}

const fields = (e: TaskEvent) => e.text.split(/\s+/);

/** dk_ts_pick：最後一筆第 2／3／4 欄依序相等的事件時間；undefined／'' 表示該欄不限 */
export function tsPick(events: TaskEvent[], a?: string, b?: string, c?: string): Ts | null {
  let t: Ts | null = null;
  for (const e of events) {
    const f = fields(e);
    if ((!a || f[0] === a) && (!b || f[1] === b) && (!c || f[2] === c)) t = e.ts;
  }
  return t;
}

export interface WaveTimingDetail {
  wave: number;
  openedAt: Ts | null;
  closedAt: Ts | null;
  /** wave-open → wave-close（最後一筆 `wave-close N tests`） */
  totalMin: number | null;
  /** wave-open → dev-done wave N */
  devMin: number | null;
  /** review N spawned → 最後 verdict；skipped 算 0 */
  reviewMin: number | null;
  /** 沒有 verdict 而有 `review N skipped:` */
  reviewSkipped: boolean;
}

/** 波號取 process 的 `wave-open N`（同 dk-timeline，不看 brief），升冪 */
export function waveNumbers(events: TaskEvent[]): number[] {
  const set = new Set<number>();
  for (const e of events) {
    const f = fields(e);
    if (f[0] === 'wave-open' && /^[0-9]+$/.test(f[1] ?? '')) set.add(Number(f[1]));
  }
  return [...set].sort((x, y) => x - y);
}

export function waveTimings(events: TaskEvent[]): WaveTimingDetail[] {
  return waveNumbers(events).map((n) => {
    const w = String(n);
    const openedAt = tsPick(events, 'wave-open', w);
    const closedAt = tsPick(events, 'wave-close', w, 'tests');
    const devDone = tsPick(events, 'dev-done', 'wave', w);
    const spawned = tsPick(events, 'review', w, 'spawned');
    const verdict = tsPick(events, 'review', w, 'verdict');
    const skipped = tsPick(events, 'review', w, 'skipped:');
    const reviewSkipped = verdict === null && skipped !== null;
    return {
      wave: n,
      openedAt,
      closedAt,
      totalMin: spanMin(openedAt, closedAt),
      devMin: spanMin(openedAt, devDone),
      reviewMin: reviewSkipped ? 0 : spanMin(spawned, verdict),
      reviewSkipped,
    };
  });
}

/** 首筆 task-new → 最後一筆 task-close（同 dk-timeline 的「任務」列；未結案為 null） */
export function taskTotalMin(events: TaskEvent[]): number | null {
  const start = events.find((e) => fields(e)[0] === 'task-new')?.ts ?? null;
  return spanMin(start, tsPick(events, 'task-close'));
}

/** 審查複看次數：每波 `review N verdict` 事件數減 1（下限 0）加總；`review task …` 不算 */
export function reReviewCount(events: TaskEvent[]): number {
  const perWave = new Map<string, number>();
  for (const e of events) {
    const f = fields(e);
    if (f[0] === 'review' && /^[0-9]+$/.test(f[1] ?? '') && f[2] === 'verdict') {
      perWave.set(f[1], (perWave.get(f[1]) ?? 0) + 1);
    }
  }
  let total = 0;
  for (const n of perWave.values()) total += Math.max(0, n - 1);
  return total;
}

/** config＝該專案現在的 roles／kinds 對照（推 Dispatch 的 model／effort）；不給時兩者為 null */
export function historyRow(project: string, task: TaskDetail, config: TierConfig = EMPTY_TIER_CONFIG): HistoryRow {
  const waves = waveTimings(task.events);
  return {
    project,
    dir: task.dir,
    display: task.display,
    status: task.status,
    closedAt: task.closed_at,
    totalMin: taskTotalMin(task.events),
    waves: waves.length,
    rulings: task.counts.rulings,
    autonomousRulings: task.counts.autonomous_rulings,
    minors: task.counts.minors,
    reReviews: reReviewCount(task.events),
    perWave: waves.map(({ wave, devMin, reviewMin }) => ({ wave, devMin, reviewMin })),
    dispatch: parseDispatch(task.events, task.short, config),
    repairWaves: repairWaveCount(task.brief),
  };
}
