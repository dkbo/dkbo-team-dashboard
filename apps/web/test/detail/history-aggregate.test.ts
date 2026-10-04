import { describe, expect, it } from 'vitest'
import { filterHistory, weeklyClosed, weekStart, limitRecent, reviewParts } from '@/features/history/aggregate'

const row = (project: string, closedAt: string | null) => ({ project, closedAt })

describe('weekStart', () => {
  it('週一起算：週日歸前一個週一、週一歸自己', () => {
    expect(weekStart('2026-09-27T23:59')).toBe('2026-09-21') // 週日
    expect(weekStart('2026-09-21T00:00')).toBe('2026-09-21') // 週一
    expect(weekStart('2026-09-25T10:00')).toBe('2026-09-21') // 週五
    expect(weekStart('2026-01-01T10:00')).toBe('2025-12-29') // 跨年
  })
})

describe('weeklyClosed', () => {
  it('依 closedAt 分週計數並補齊中間的空週，無 closedAt 不計', () => {
    const rows = [
      row('a', '2026-09-01T10:00'), // 週二 → 08-31
      row('b', '2026-09-06T10:00'), // 週日 → 08-31
      row('a', '2026-09-16T10:00'), // → 09-14
      row('a', null),
    ]
    expect(weeklyClosed(rows)).toEqual([
      { week: '2026-08-31', count: 2 },
      { week: '2026-09-07', count: 0 },
      { week: '2026-09-14', count: 1 },
    ])
  })
  it('空輸入給空陣列', () => {
    expect(weeklyClosed([])).toEqual([])
  })
})

describe('filterHistory', () => {
  const rows = [row('a', '2026-09-01T10:00'), row('b', '2026-09-10T23:59'), row('a', '2026-09-20T00:00')]
  it('專案篩選', () => {
    expect(filterHistory(rows, { project: 'a' }).map((r) => r.closedAt)).toEqual(['2026-09-01T10:00', '2026-09-20T00:00'])
  })
  it('日期範圍含頭含尾（以本地日期比）', () => {
    expect(filterHistory(rows, { from: '2026-09-10', to: '2026-09-20' }).length).toBe(2)
    expect(filterHistory(rows, { from: '2026-09-11' }).length).toBe(1)
    expect(filterHistory(rows, { to: '2026-09-01' }).length).toBe(1)
  })
  it('空字串或 all 視為不篩', () => {
    expect(filterHistory(rows, { project: '', from: '', to: '' }).length).toBe(3)
  })
})

describe('devReviewData', () => {
  it('每任務把各波 dev／審查分鐘加總，null 當 0；標籤用 display，無則 dir', async () => {
    const { devReviewData } = await import('@/features/history/aggregate')
    const rows = [
      {
        project: 'a',
        dir: '2026-09-01-x',
        display: 'X 任務',
        closedAt: '2026-09-01T10:00',
        perWave: [
          { wave: 1, devMin: 30, reviewMin: 10 },
          { wave: 2, devMin: null, reviewMin: 5 },
        ],
      },
      { project: 'b', dir: '2026-09-02-y', display: null, closedAt: '2026-09-02T10:00', perWave: [] },
    ]
    expect(devReviewData(rows)).toEqual([
      { key: 'a/2026-09-01-x', label: 'X 任務', project: 'a', dev: 30, review: 15 },
      { key: 'b/2026-09-02-y', label: '2026-09-02-y', project: 'b', dev: 0, review: 0 },
    ])
  })
})

describe('reviewParts（審查欄 Q7）', () => {
  it('裁定/自主 · m minor · r 重審，各段標記是否為 0', () => {
    expect(reviewParts({ rulings: 9, autonomousRulings: 6, minors: 5, reReviews: 1 })).toEqual([
      { key: 'rulings', text: '9/6', zero: false },
      { key: 'minors', text: 'm5', zero: false },
      { key: 'rereviews', text: 'r1', zero: false },
    ])
    expect(reviewParts({ rulings: 0, autonomousRulings: 0, minors: 0, reReviews: 0 }).map((p) => p.zero)).toEqual([true, true, true])
  })
})

describe('limitRecent（15 件限制 Q8）', () => {
  const xs = Array.from({ length: 20 }, (_, i) => i)
  it('預設只取最前（最近）15 件；展開取全部；不足 15 件原樣', () => {
    expect(limitRecent(xs, false)).toEqual(xs.slice(0, 15))
    expect(limitRecent(xs, true)).toBe(xs)
    expect(limitRecent(xs.slice(0, 3), false)).toEqual([0, 1, 2])
  })
})
