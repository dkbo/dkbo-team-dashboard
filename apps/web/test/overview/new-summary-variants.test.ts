import { describe, expect, it } from 'vitest'
import { blockedVariant, quotaSummary, runningVariant, spendVariant } from '@/features/overview/summary'

const NOW = new Date(2026, 9, 4, 12, 0).getTime()
const sec = (ms: number) => Math.floor(ms / 1000)
const HOUR = 3_600_000
const down = (kind: string, untilMs: number) => ({
  kind, until: '', until_epoch: sec(untilMs), exact: true, recorded_at: '', from_task: '', agent: '', reason: '', project: 'p',
})

describe('摘要卡 variant（§1.4、Q1、Q2）', () => {
  it('進行中：> 0 ok，0 quiet', () => {
    expect(runningVariant(2)).toBe('ok')
    expect(runningVariant(0)).toBe('quiet')
  })
  it('今日花費：有資料 brand（含 0 元），無資料 quiet', () => {
    expect(spendVariant(12.5)).toBe('brand')
    expect(spendVariant(0)).toBe('brand')
    expect(spendVariant(null)).toBe('quiet')
  })
  it('卡住：> 0 danger，0 quiet', () => {
    expect(blockedVariant(1)).toBe('danger')
    expect(blockedVariant(0)).toBe('quiet')
  })
})

describe('quotaSummary（熔斷與額度）', () => {
  it('有熔斷：warn，值「N 熔斷」，副行列 kind 與最短剩餘時間；過期的熔斷不算', () => {
    const q = quotaSummary([down('codex', NOW + 30 * HOUR), down('agy', NOW + 2 * HOUR), down('old', NOW - HOUR)], {}, NOW)
    expect(q).toEqual({ variant: 'warn', value: '2 熔斷', line: 'agy、codex · 最短還剩 2 小時 0 分' })
  })
  it('沒有熔斷但任一額度 ≥ 80%：warn，值為最高百分比；79% 不算', () => {
    expect(quotaSummary([], { claude: { fiveHourPct: 79, weekPct: 10 } }, NOW).variant).toBe('quiet')
    const q = quotaSummary([], { claude: { fiveHourPct: 37, weekPct: 25 }, codex: { fiveHourPct: null, weekPct: 80 } }, NOW)
    expect(q).toEqual({ variant: 'warn', value: '80%', line: 'codex 週 80% · 接近上限' })
  })
  it('都正常：quiet，副行「額度都健康 · 最高 <kind> <窗口> N%」', () => {
    const q = quotaSummary([], { claude: { fiveHourPct: 37, weekPct: 25 }, codex: { fiveHourPct: 12, weekPct: null } }, NOW)
    expect(q).toEqual({ variant: 'quiet', value: '0 熔斷', line: '額度都健康 · 最高 claude 5h 37%' })
  })
  it('沒有額度資料：quiet，副行只說都健康', () => {
    expect(quotaSummary([], {}, NOW)).toEqual({ variant: 'quiet', value: '0 熔斷', line: '額度都健康' })
    expect(quotaSummary([], { claude: { fiveHourPct: null, weekPct: null } }, NOW).line).toBe('額度都健康')
  })
})
