import { describe, expect, it } from 'vitest'
import { blockedSummary, runningSummary, spendSummary } from '@/features/overview/summary'
import { overview, pane, project, summary } from '../shell/builders'

const list = (tasks: ReturnType<typeof summary>[]) => ({ ...project().list!, tasks })

describe('runningSummary', () => {
  it('跨專案數 running＋planning；副行依 updated_at 新到舊取前 2，波次缺時顯示 —', () => {
    const r = runningSummary([
      project({
        name: 'a',
        list: list([
          summary({ dir: 'd1', short: 'one', status: 'running', current_wave: 2, waves_planned: 4, updated_at: '2026-10-03T09:00' }),
          summary({ dir: 'd2', short: 'two', status: 'planning', current_wave: null, waves_planned: 3, updated_at: '2026-10-03T11:00' }),
          summary({ dir: 'd3', short: 'old', status: 'done', updated_at: '2026-10-03T12:00' }),
        ]),
      }),
      project({ name: 'b', list: list([summary({ dir: 'd4', short: 'four', status: 'running', current_wave: 1, waves_planned: 2, updated_at: '2026-10-03T10:00' })]) }),
      project({ name: 'c', list: null }),
    ])
    expect(r.count).toBe(3)
    expect(r.top).toEqual(['two 波 —/3', 'four 波 1/2'])
  })

  it('沒有進行中任務時 count 0、副行空', () => {
    expect(runningSummary([project({ list: list([summary({ status: 'done' })]) })])).toEqual({ count: 0, top: [] })
  })
})

describe('spendSummary', () => {
  const NOW = new Date(2026, 9, 3, 15, 0).getTime()
  it('今日與昨日各自加總所有專案', () => {
    const r = spendSummary(
      [
        { day: '2026-10-02', project: 'a', cost: 1.25 },
        { day: '2026-10-03', project: 'a', cost: 2 },
        { day: '2026-10-03', project: null, cost: 0.5 },
        { day: '2026-10-01', project: 'a', cost: 9 },
      ],
      NOW,
    )
    expect(r).toEqual({ today: 2.5, yesterday: 1.25 })
  })

  it('某天沒有資料就是 null；整份拿不到兩者都是 null', () => {
    expect(spendSummary([{ day: '2026-10-03', project: 'a', cost: 1 }], NOW)).toEqual({ today: 1, yesterday: null })
    expect(spendSummary(null, NOW)).toEqual({ today: null, yesterday: null })
  })

  it('跨月：10/1 的昨日是 9/30', () => {
    const r = spendSummary([{ day: '2026-09-30', project: 'a', cost: 3 }], new Date(2026, 9, 1, 0, 5).getTime())
    expect(r).toEqual({ today: null, yesterday: 3 })
  })
})

describe('blockedSummary', () => {
  it('列出卡住 agent 數、最多 3 個名字，連到第一個的 herdr 頁', () => {
    const agents = ['w', 'x', 'y', 'z'].map((n, i) => ({
      ...pane({ paneId: `P${i}`, workspaceId: 'W', tabId: 'T', status: 'blocked', name: `name-${n}` }),
      project: 'teamflow',
    }))
    const r = blockedSummary(overview({ agents: [{ ...pane({ paneId: 'OK', status: 'working' }), project: null }, ...agents] }))
    expect(r.count).toBe(4)
    expect(r.names).toEqual(['name-w', 'name-x', 'name-y'])
    expect(r.href).toBe('/herdr?w=W&t=T&p=P0')
  })

  it('沒有卡住時連到 /herdr', () => {
    expect(blockedSummary(overview())).toEqual({ count: 0, names: [], href: '/herdr' })
    expect(blockedSummary(null)).toEqual({ count: 0, names: [], href: '/herdr' })
  })
})
