// /history 的純計算：篩選與每週結案數。closedAt 是 dk-status 的本地時間 `YYYY-MM-DDTHH:MM`。

export interface HistoryFilter {
  project?: string
  from?: string // YYYY-MM-DD，含
  to?: string // YYYY-MM-DD，含
}

export const ALL_PROJECTS = 'all'

function localDate(ts: string): Date {
  const [y, m, d] = ts.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 該時間所屬那一週的週一（YYYY-MM-DD）。 */
export function weekStart(ts: string): string {
  const d = localDate(ts)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return fmtDate(d)
}

export function filterHistory<T extends { project: string; closedAt: string | null }>(
  rows: T[],
  f: HistoryFilter,
): T[] {
  return rows.filter((r) => {
    if (f.project && f.project !== ALL_PROJECTS && r.project !== f.project) return false
    if (f.from || f.to) {
      if (!r.closedAt) return false
      const day = r.closedAt.slice(0, 10)
      if (f.from && day < f.from) return false
      if (f.to && day > f.to) return false
    }
    return true
  })
}

/** 每週（週一起算）結案數，最早到最晚之間的空週補 0。 */
export function weeklyClosed(rows: { closedAt: string | null }[]): { week: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const r of rows) {
    if (!r.closedAt) continue
    const w = weekStart(r.closedAt)
    counts.set(w, (counts.get(w) ?? 0) + 1)
  }
  if (counts.size === 0) return []
  const weeks = [...counts.keys()].sort()
  const out: { week: string; count: number }[] = []
  const cur = localDate(weeks[0])
  const last = weeks[weeks.length - 1]
  for (let w = fmtDate(cur); w <= last; cur.setDate(cur.getDate() + 7), w = fmtDate(cur)) {
    out.push({ week: w, count: counts.get(w) ?? 0 })
  }
  return out
}

export interface DevReviewPoint {
  key: string
  label: string
  project: string
  dev: number
  review: number
}

/** 每任務的 dev／審查耗時（各波加總，缺值當 0），給分解長條圖。 */
export function devReviewData(
  rows: {
    project: string
    dir: string
    display: string | null
    perWave: { devMin: number | null; reviewMin: number | null }[]
  }[],
): DevReviewPoint[] {
  return rows.map((r) => ({
    key: `${r.project}/${r.dir}`,
    label: r.display ?? r.dir,
    project: r.project,
    dev: r.perWave.reduce((s, w) => s + (w.devMin ?? 0), 0),
    review: r.perWave.reduce((s, w) => s + (w.reviewMin ?? 0), 0),
  }))
}
