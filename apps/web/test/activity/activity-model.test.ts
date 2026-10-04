import { describe, expect, it } from 'vitest'
import { ATTENTION_TYPES, collapseGroup, filterActivity, groupActivity, isLeaderItem, takeItems } from '@/features/activity/model'
import { item } from './items'

const g1 = { project: 'demo', taskDir: 'd1', taskShort: 'one' }
const g2 = { project: 'demo', taskDir: 'd2', taskShort: 'two' }
const g3 = { project: 'other', taskDir: 'd1', taskShort: 'one' }

describe('groupActivity', () => {
  it('新到舊，相鄰且同 project/taskDir 併一組；組時間取組內第一則（最新）', () => {
    const items = [item({ ...g1, ago: 1 }), item({ ...g1, ago: 2 }), item({ ...g2, ago: 3 }), item({ ...g1, ago: 4 }), item({ ...g3, ago: 5 })]
    const groups = groupActivity(items)
    expect(groups.map((g) => [g.project, g.taskDir, g.items.length])).toEqual([
      ['demo', 'd1', 2],
      ['demo', 'd2', 1],
      ['demo', 'd1', 1],
      ['other', 'd1', 1],
    ])
    expect(groups[0]).toMatchObject({ taskShort: 'one', at: items[0].at })
    expect(new Set(groups.map((g) => g.key)).size).toBe(4)
  })
  it('空清單沒有組', () => {
    expect(groupActivity([])).toEqual([])
  })
})

describe('filterActivity（Q6 需處理）', () => {
  it('需處理只留 ESCALATE、BUG、BLOCKED、LIMIT、TIMEOUT、STOP', () => {
    expect([...ATTENTION_TYPES].sort()).toEqual(['BLOCKED', 'BUG', 'ESCALATE', 'LIMIT', 'STOP', 'TIMEOUT'])
    const types = ['DONE', 'ESCALATE', 'BUG', 'spawn', 'BLOCKED', 'LIMIT', 'TIMEOUT', 'STOP', 'FIXED', 'wave-close']
    const items = types.map((type, i) => item({ type, ago: i }))
    expect(filterActivity(items, 'attention').map((x) => x.type)).toEqual(['ESCALATE', 'BUG', 'BLOCKED', 'LIMIT', 'TIMEOUT', 'STOP'])
    expect(filterActivity(items, 'all')).toBe(items)
  })
})

describe('collapseGroup', () => {
  it('組內 > 4 則只顯示前 3 則並回報隱藏數；≤ 4 全顯示', () => {
    const five = [1, 2, 3, 4, 5].map((ago) => item({ ago }))
    expect(collapseGroup(five)).toEqual({ shown: five.slice(0, 3), hidden: 2 })
    expect(collapseGroup(five.slice(0, 4))).toEqual({ shown: five.slice(0, 4), hidden: 0 })
  })
})

describe('takeItems（手機只顯示最新 N 則，分組後）', () => {
  it('依序取前 N 則，組被切開時只留前段', () => {
    const items = [item({ ...g1, ago: 1 }), item({ ...g1, ago: 2 }), item({ ...g2, ago: 3 }), item({ ...g2, ago: 4 }), item({ ...g2, ago: 5 }), item({ ...g1, ago: 6 })]
    const taken = takeItems(groupActivity(items), 4)
    expect(taken.map((g) => [g.taskDir, g.items.length])).toEqual([
      ['d1', 2],
      ['d2', 2],
    ])
    expect(takeItems(groupActivity(items), 99)).toHaveLength(3)
  })
})

describe('isLeaderItem', () => {
  it('process 事件（actor null）與 leader 開頭的成員算 leader', () => {
    expect(isLeaderItem(item({ actor: null }))).toBe(true)
    expect(isLeaderItem(item({ actor: 'glow-leader', taskShort: 'glow' }))).toBe(true)
    expect(isLeaderItem(item({ actor: 'glow-frontend', taskShort: 'glow' }))).toBe(false)
  })
})
