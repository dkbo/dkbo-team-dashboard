// lobby AC2（base 部分）：substate 依「有沒有存活 pane」分流 —— 有 pane 的 error 不衰退，無 pane 的 error 比照 done
import { describe, expect, it } from 'vitest'
import type { Substate } from '@dash/shared'
import { effectiveSubstate, isOffDuty, needsYou, timerText } from '@/lib/substate'

const NOW = 1_800_000_000_000
const MIN = 60_000
const HOUR = 60 * MIN
const live = (substate: Substate, agoMs: number) => ({
  substate,
  substateSince: NOW - agoMs,
  turnStartedAt: null as number | null,
  lastEventAt: NOW - agoMs,
})

// 邊界：9 分（未到）、10 分整（轉 idle）、11 分、1 時 59 分（未下班）、2 小時整（下班）
const NO_PANE = { hasPane: false }
const PANE = { hasPane: true }

describe('effectiveSubstate × hasPane', () => {
  it.each([
    ['9 分', 9 * MIN, 'error'],
    ['10 分整', 10 * MIN, 'idle'],
    ['11 分', 11 * MIN, 'idle'],
    ['2 小時', 2 * HOUR, 'idle'],
  ] as const)('無 pane 的 error %s → %s（比照 done）', (_l, ago, want) => {
    expect(effectiveSubstate(live('error', ago), NOW, NO_PANE)).toBe(want)
  })

  it.each([9 * MIN, 11 * MIN, 2 * HOUR, 5 * HOUR])('有 pane 的 error %i ms 前仍是 error', (ago) => {
    expect(effectiveSubstate(live('error', ago), NOW, PANE)).toBe('error')
  })

  it('opts 省略＝hasPane true（任務一行為不變）', () => {
    expect(effectiveSubstate(live('error', 11 * MIN), NOW)).toBe('error')
    expect(effectiveSubstate(live('error', 11 * MIN), NOW, {})).toBe('error')
  })

  it('waiting 不受 hasPane 影響；done 不論有無 pane 都 10 分轉 idle', () => {
    expect(effectiveSubstate(live('waiting', 3 * HOUR), NOW, NO_PANE)).toBe('waiting')
    expect(effectiveSubstate(live('done', 11 * MIN), NOW, PANE)).toBe('idle')
    expect(effectiveSubstate(live('done', 11 * MIN), NOW, NO_PANE)).toBe('idle')
  })
})

describe('isOffDuty × hasPane', () => {
  it.each([
    ['1 時 59 分', 2 * HOUR - MIN, false],
    ['2 小時整', 2 * HOUR, true],
    ['3 小時', 3 * HOUR, true],
  ] as const)('無 pane 的 error %s → 下班 %s', (_l, ago, want) => {
    expect(isOffDuty(live('error', ago), NOW, NO_PANE)).toBe(want)
  })

  it('有 pane 的 error 3 小時也不下班', () => {
    expect(isOffDuty(live('error', 3 * HOUR), NOW, PANE)).toBe(false)
    expect(isOffDuty(live('error', 3 * HOUR), NOW)).toBe(false)
  })
})

describe('timerText × hasPane', () => {
  it('無 pane 的 error：9 分仍顯示「9 分前」，11 分改「閒置 11 分」', () => {
    expect(timerText(live('error', 9 * MIN), NOW, { hasPane: false })).toBe('9 分前')
    expect(timerText(live('error', 11 * MIN), NOW, { hasPane: false })).toBe('閒置 11 分')
  })

  it('有 pane 的 error 11 分後仍是「11 分前」；long 與 hasPane 可並用', () => {
    expect(timerText(live('error', 11 * MIN), NOW, { hasPane: true })).toBe('11 分前')
    expect(timerText(live('waiting', 3 * MIN + 12_000), NOW, { long: true, hasPane: false })).toBe('已等 3 分 12 秒')
  })
})

describe('needsYou', () => {
  it('waiting 一律算，不論有無 pane、多久', () => {
    expect(needsYou(live('waiting', 5 * HOUR), NOW)).toBe(true)
    expect(needsYou(live('waiting', 5 * HOUR), NOW, NO_PANE)).toBe(true)
  })

  it('error：有 pane 算（含 opts 省略）；無 pane 不算', () => {
    expect(needsYou(live('error', 3 * MIN), NOW)).toBe(true)
    expect(needsYou(live('error', 3 * MIN), NOW, PANE)).toBe(true)
    expect(needsYou(live('error', 3 * MIN), NOW, NO_PANE)).toBe(false)
  })

  it('無 pane 的 error 11 分後（已轉 idle）不算；有 pane 的 error 11 分後仍算', () => {
    expect(needsYou(live('error', 11 * MIN), NOW, NO_PANE)).toBe(false)
    expect(needsYou(live('error', 11 * MIN), NOW, PANE)).toBe(true)
  })

  it.each(['interrupted', 'running', 'writing', 'thinking', 'done', 'idle'] as const)('%s 不算', (sub) => {
    expect(needsYou(live(sub, MIN), NOW)).toBe(false)
  })
})
