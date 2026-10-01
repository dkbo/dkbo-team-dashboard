import { TREND_RANGES, type CostsResponse, type MismatchPane, type ProjectView, type TaskCost, type TrendRange, type TrendsResponse } from '@dash/shared'
import { MAX_SERIES } from './palette'

export const DEFAULT_RANGE: TrendRange = '24h'

export const RANGE_LABEL: Record<TrendRange, string> = { '6h': '6 小時', '24h': '24 小時', '7d': '7 天', '30d': '30 天' }

export function parseRange(raw: string | null | undefined): TrendRange | null {
  return TREND_RANGES.find((r) => r === raw) ?? null
}

const pad = (n: number) => String(n).padStart(2, '0')

const md = (d: Date) => `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/** 圖表 x 軸刻度：短範圍看時分，長範圍看日期 */
export function formatTick(t: number, range: TrendRange): string {
  const d = new Date(t)
  return range === '6h' || range === '24h' ? hm(d) : md(d)
}

const TICK_STEP: Record<TrendRange, { hours: number } | { days: number }> = {
  '6h': { hours: 1 },
  '24h': { hours: 3 },
  '7d': { days: 1 },
  '30d': { days: 5 },
}

/** x 軸刻度：對齊本地整點（小時步距整除）或本地午夜，只取落在 [from, to] 內的 */
export function timeTicks(from: number, to: number, range: TrendRange): number[] {
  const step = TICK_STEP[range]
  const d = new Date(from)
  d.setMinutes(0, 0, 0)
  if ('days' in step) d.setHours(0)
  const out: number[] = []
  while (d.getTime() <= to) {
    const t = d.getTime()
    if (t >= from && ('days' in step || d.getHours() % step.hours === 0)) out.push(t)
    if ('days' in step) d.setDate(d.getDate() + (out.length > 0 ? step.days : 1))
    else d.setHours(d.getHours() + 1)
  }
  return out
}

export function formatStamp(t: number): string {
  const d = new Date(t)
  return `${md(d)} ${hm(d)}`
}

/** 預估達 100% 的時間；跟 now 不同天時加上月-日 */
export function formatProjection(at: number | null, now: number): string {
  if (at == null) return '—'
  const d = new Date(at)
  const n = new Date(now)
  const sameDay = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
  return `預估 ${sameDay ? hm(d) : formatStamp(at)} 達 100%`
}

export const UNATTRIBUTED_LABEL = '未歸屬'

export interface Series {
  key: string
  label: string
}

export const OTHER_PROJECTS_LABEL = '其他專案'

/**
 * 每日花費 → 堆疊長條的列；專案名可能含空白等字元，所以 key 另外編號。
 * 系列依總額大到小（未歸屬排最後）；超過 maxSeries 時保留前 maxSeries−1 名，其餘併成「其他專案」。
 */
export function costByDayRows(
  items: TrendsResponse['costByDay'],
  maxSeries: number = MAX_SERIES,
): { rows: Record<string, string | number>[]; series: Series[] } {
  const totals = new Map<string | null, number>()
  for (const it of items) totals.set(it.project, (totals.get(it.project) ?? 0) + it.cost)
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p)
  const fold = ranked.length > maxSeries
  const kept = fold ? ranked.slice(0, maxSeries - 1) : ranked
  kept.sort((a, b) => Number(a == null) - Number(b == null))

  const keyOf = new Map<string | null, string>(kept.map((p, i) => [p, `p${i}`]))
  const series: Series[] = kept.map((p, i) => ({ key: `p${i}`, label: p ?? UNATTRIBUTED_LABEL }))
  if (fold) series.push({ key: 'other', label: OTHER_PROJECTS_LABEL })

  const byDay = new Map<string, Record<string, string | number>>()
  for (const it of items) {
    const key = keyOf.get(it.project) ?? 'other'
    const row = byDay.get(it.day) ?? { day: it.day }
    row[key] = ((row[key] as number | undefined) ?? 0) + it.cost
    byDay.set(it.day, row)
  }
  const rows = [...byDay.values()].sort((a, b) => String(a.day).localeCompare(String(b.day)))
  return { rows, series }
}

const lastCtx = (c: TrendsResponse['ctx'][number]) => c.points.at(-1)?.ctxPct ?? -1

/** ctx 線最多畫 n 條：依最後一點由高到低（最需要注意的在前） */
export function topCtx(ctx: TrendsResponse['ctx'], n: number = MAX_SERIES): { shown: TrendsResponse['ctx']; hidden: number } {
  const sorted = [...ctx].sort((a, b) => lastCtx(b) - lastCtx(a))
  return { shown: sorted.slice(0, n), hidden: Math.max(0, sorted.length - n) }
}

export function isEmptyData(
  trends: Pick<TrendsResponse, 'usage' | 'ctx' | 'costByDay'>,
  costs: Pick<CostsResponse, 'tasks' | 'byRole' | 'unknownRole' | 'unattributed'>,
): boolean {
  return (
    Object.keys(trends.usage).length === 0 &&
    trends.ctx.length === 0 &&
    trends.costByDay.length === 0 &&
    costs.tasks.length === 0 &&
    Object.keys(costs.byRole).length === 0 &&
    costs.unknownRole === 0 &&
    costs.unattributed === 0
  )
}

/** ctx 各 pane 的點合併成一列一時點；缺點的 pane 在該列沒有欄位，畫線用 connectNulls */
export function ctxRows(ctx: TrendsResponse['ctx']): { rows: Record<string, number>[]; series: (Series & { paneId: string })[] } {
  const count = new Map<string, number>()
  for (const c of ctx) count.set(c.label, (count.get(c.label) ?? 0) + 1)
  const series = ctx.map((c, i) => ({
    key: `c${i}`,
    paneId: c.paneId,
    label: (count.get(c.label) ?? 0) > 1 ? `${c.label}（${c.paneId}）` : c.label,
  }))
  const byT = new Map<number, Record<string, number>>()
  ctx.forEach((c, i) => {
    for (const p of c.points) {
      const row = byT.get(p.t) ?? { t: p.t }
      row[`c${i}`] = p.ctxPct
      byT.set(p.t, row)
    }
  })
  return { rows: [...byT.values()].sort((a, b) => a.t - b.t), series }
}

export function sortedCosts(rec: Record<string, number>): [string, number][] {
  return Object.entries(rec).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

export interface TaskCostRow {
  project: string
  taskDir: string
  display: string
  linkable: boolean
  cost: number
  members: [string, number][]
  unmatched: number
  memberInfo: TaskCost['memberInfo'] | undefined
  /** 本任務的 mismatch.panes 列（成員不一致 tooltip 用） */
  mismatchPanes: MismatchPane[]
}

export type ProjectLike = Pick<ProjectView, 'name'> & { list: { tasks: { dir: string; display: string | null }[] } | null }

/** 任務 dir → 顯示名；找不到的任務（不在目前清單）顯示 dir、不可點 */
export function taskDisplay(projects: ProjectLike[] | undefined): (project: string, dir: string) => { display: string; linkable: boolean } {
  const known = new Map<string, string | null>()
  for (const p of projects ?? []) for (const t of p.list?.tasks ?? []) known.set(`${p.name}/${t.dir}`, t.display)
  return (project, dir) => {
    const key = `${project}/${dir}`
    return { display: known.get(key) ?? dir, linkable: known.has(key) }
  }
}

/** mismatch.panes 中屬於某任務的列 */
export function taskMismatchPanes(panes: MismatchPane[] | undefined, project: string, dir: string): MismatchPane[] {
  return (panes ?? []).filter((p) => p.project === project && p.taskDir === dir)
}

export function taskCostRows(tasks: TaskCost[], projects: ProjectLike[] | undefined, mismatchPanes?: MismatchPane[]): TaskCostRow[] {
  const lookup = taskDisplay(projects)
  return tasks
    .map((t) => ({
      project: t.project,
      taskDir: t.taskDir,
      ...lookup(t.project, t.taskDir),
      cost: t.cost,
      members: sortedCosts(t.members),
      unmatched: t.unmatched,
      memberInfo: t.memberInfo,
      mismatchPanes: taskMismatchPanes(mismatchPanes, t.project, t.taskDir),
    }))
    .sort((a, b) => b.cost - a.cost)
}

export function taskCostFor(costs: Pick<CostsResponse, 'tasks'> | null | undefined, project: string, dir: string): TaskCost | null {
  return costs?.tasks.find((t) => t.project === project && t.taskDir === dir) ?? null
}
