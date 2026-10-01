import { describe, expect, it } from 'vitest'
import {
  costByDayRows,
  ctxRows,
  formatProjection,
  formatStamp,
  formatTick,
  isEmptyData,
  parseRange,
  timeTicks,
  topCtx,
  sortedCosts,
  taskCostFor,
  taskCostRows,
} from '@/features/trends/model'

describe('parseRange', () => {
  it('只收 6h／24h／7d／30d', () => {
    expect(parseRange('6h')).toBe('6h')
    expect(parseRange('30d')).toBe('30d')
    expect(parseRange('all')).toBeNull()
    expect(parseRange('1y')).toBeNull()
    expect(parseRange(null)).toBeNull()
  })
})

describe('formatProjection', () => {
  const now = new Date(2026, 8, 26, 10, 0).getTime()
  it('同一天只顯示 HH:MM，跨日加日期，null 為「—」', () => {
    expect(formatProjection(new Date(2026, 8, 26, 14, 5).getTime(), now)).toBe('預估 14:05 達 100%')
    expect(formatProjection(new Date(2026, 8, 28, 9, 3).getTime(), now)).toBe('預估 09-28 09:03 達 100%')
    expect(formatProjection(null, now)).toBe('—')
  })
})

describe('costByDayRows', () => {
  it('依日期轉成堆疊列，null 專案標「未歸屬」', () => {
    const { rows, series } = costByDayRows([
      { day: '2026-09-25', project: 'teamflow', cost: 1.5 },
      { day: '2026-09-25', project: null, cost: 0.5 },
      { day: '2026-09-26', project: 'teamflow', cost: 2 },
      { day: '2026-09-26', project: 'dash board', cost: 1 },
    ])
    expect(series.map((s) => s.label)).toEqual(['teamflow', 'dash board', '未歸屬'])
    // key 只用安全字元，給 CSS 變數用
    for (const s of series) expect(s.key).toMatch(/^[a-z0-9]+$/)
    const k = Object.fromEntries(series.map((s) => [s.label, s.key]))
    expect(rows).toEqual([
      { day: '2026-09-25', [k.teamflow]: 1.5, [k['未歸屬']]: 0.5 },
      { day: '2026-09-26', [k.teamflow]: 2, [k['dash board']]: 1 },
    ])
  })
})

describe('ctxRows', () => {
  it('把各 pane 的點依時間合併成一列一時點；同名 label 加 paneId 區分', () => {
    const { rows, series } = ctxRows([
      { paneId: 'p1', label: 'frontend', points: [{ t: 1000, ctxPct: 10 }, { t: 3000, ctxPct: 30 }] },
      { paneId: 'p2', label: 'frontend', points: [{ t: 2000, ctxPct: 20 }] },
      { paneId: 'p3', label: 'qa', points: [] },
    ])
    expect(series.map((s) => s.label)).toEqual(['frontend（p1）', 'frontend（p2）', 'qa'])
    const [a, b] = series.map((s) => s.key)
    expect(rows).toEqual([
      { t: 1000, [a]: 10 },
      { t: 2000, [b]: 20 },
      { t: 3000, [a]: 30 },
    ])
  })
})

describe('sortedCosts', () => {
  it('依金額大到小', () => {
    expect(sortedCosts({ a: 1, b: 3, c: 2 })).toEqual([
      ['b', 3],
      ['c', 2],
      ['a', 1],
    ])
  })
})

const tc = (over: Record<string, unknown>) => ({ project: 'teamflow', taskDir: '2026-09-25-x', cost: 3, members: {}, unmatched: 0, ...over })

describe('taskCostRows', () => {
  const projects = [
    { name: 'teamflow', list: { tasks: [{ dir: '2026-09-25-x', display: 'X 任務' }, { dir: '2026-09-24-y', display: null }] } },
  ]
  it('找得到任務才可點，帶顯示名；成員依金額排序；列依總額大到小', () => {
    const rows = taskCostRows(
      [
        tc({ cost: 1, taskDir: '2026-09-24-y' }),
        tc({ cost: 5, members: { qa: 1, 'frontend-shell': 3 }, unmatched: 1 }),
        tc({ project: 'gone', taskDir: '2026-01-01-z', cost: 2 }),
      ] as never,
      projects as never,
    )
    expect(rows.map((r) => [r.taskDir, r.display, r.linkable])).toEqual([
      ['2026-09-25-x', 'X 任務', true],
      ['2026-01-01-z', '2026-01-01-z', false],
      ['2026-09-24-y', '2026-09-24-y', true],
    ])
    expect(rows[0].members).toEqual([
      ['frontend-shell', 3],
      ['qa', 1],
    ])
    expect(rows[0].unmatched).toBe(1)
  })
  it('沒有 overview 時全部不可點', () => {
    expect(taskCostRows([tc({})] as never, undefined)[0].linkable).toBe(false)
  })
})

describe('taskCostFor', () => {
  it('依 project＋dir 找；沒資料為 null', () => {
    const costs = { tasks: [tc({}), tc({ taskDir: 'other', cost: 9 })] }
    expect(taskCostFor(costs as never, 'teamflow', 'other')?.cost).toBe(9)
    expect(taskCostFor(costs as never, 'teamflow', 'nope')).toBeNull()
    expect(taskCostFor(null, 'teamflow', 'other')).toBeNull()
  })
})

describe('costByDayRows 系列上限', () => {
  it('超過上限時保留總額前 N−1 名，其餘併成「其他專案」', () => {
    const items = ['a', 'b', 'c', 'd'].map((p, i) => ({ day: '2026-09-26', project: p, cost: i + 1 }))
    const { rows, series } = costByDayRows(items, 3)
    expect(series.map((s) => s.label)).toEqual(['d', 'c', '其他專案'])
    const k = Object.fromEntries(series.map((s) => [s.label, s.key]))
    expect(rows).toEqual([{ day: '2026-09-26', [k.d]: 4, [k.c]: 3, [k['其他專案']]: 3 }])
  })
})

describe('topCtx', () => {
  it('依最後一點 ctx 由高到低取前 n 個，回傳未顯示的數量', () => {
    const ctx = [
      { paneId: 'a', label: 'a', points: [{ t: 1, ctxPct: 50 }, { t: 2, ctxPct: 10 }] },
      { paneId: 'b', label: 'b', points: [{ t: 1, ctxPct: 30 }] },
      { paneId: 'c', label: 'c', points: [] },
    ]
    expect(topCtx(ctx, 2)).toEqual({ shown: [ctx[1], ctx[0]], hidden: 1 })
    expect(topCtx(ctx, 5).hidden).toBe(0)
  })
})

describe('isEmptyData', () => {
  const trends = { usage: {}, ctx: [], costByDay: [] }
  const costs = { tasks: [], byRole: {}, unknownRole: 0, unattributed: 0 }
  it('trends 與 costs 都沒東西才算空', () => {
    expect(isEmptyData(trends as never, costs as never)).toBe(true)
    expect(isEmptyData({ ...trends, usage: { claude: [] } } as never, costs as never)).toBe(false)
    expect(isEmptyData(trends as never, { ...costs, unknownRole: 1 } as never)).toBe(false)
  })
})

describe('時間刻度', () => {
  const t = new Date(2026, 8, 26, 9, 5).getTime()
  it('6h／24h 用 HH:MM，7d／30d 用 MM-DD；tooltip 用 MM-DD HH:MM', () => {
    expect(formatTick(t, '6h')).toBe('09:05')
    expect(formatTick(t, '24h')).toBe('09:05')
    expect(formatTick(t, '7d')).toBe('09-26')
    expect(formatTick(t, '30d')).toBe('09-26')
    expect(formatStamp(t)).toBe('09-26 09:05')
  })
})

describe('timeTicks', () => {
  it('在 [from, to] 內依範圍取對齊本地整點／整日的刻度', () => {
    const to = new Date(2026, 8, 26, 10, 20).getTime()
    const h6 = timeTicks(to - 6 * 3_600_000, to, '6h')
    expect(h6.map((t) => new Date(t).getHours())).toEqual([5, 6, 7, 8, 9, 10])
    const h24 = timeTicks(to - 24 * 3_600_000, to, '24h')
    expect(h24.map((t) => new Date(t).getHours())).toEqual([12, 15, 18, 21, 0, 3, 6, 9])
    const d7 = timeTicks(to - 7 * 86_400_000, to, '7d')
    expect(d7.map((t) => new Date(t).getDate())).toEqual([20, 21, 22, 23, 24, 25, 26])
    expect(d7.every((t) => new Date(t).getHours() === 0)).toBe(true)
    const d30 = timeTicks(to - 30 * 86_400_000, to, '30d')
    expect(d30.length).toBeGreaterThanOrEqual(5)
    expect(d30.length).toBeLessThanOrEqual(8)
    expect(d30.every((t) => t >= to - 30 * 86_400_000 && t <= to)).toBe(true)
  })
})
