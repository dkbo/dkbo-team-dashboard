import { describe, expect, it } from 'vitest'
import {
  formatCost,
  formatCountdown,
  formatMinutes,
  formatPct,
  formatTs,
  minutesBetween,
  parseLocalTs,
} from '@/lib/format'

describe('parseLocalTs', () => {
  it('把 YYYY-MM-DDTHH:MM 當本地時間', () => {
    const d = parseLocalTs('2026-09-25T18:14')!
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(8)
    expect(d.getDate()).toBe(25)
    expect(d.getHours()).toBe(18)
    expect(d.getMinutes()).toBe(14)
  })
  it('null 或格式錯給 null', () => {
    expect(parseLocalTs(null)).toBeNull()
    expect(parseLocalTs('garbage')).toBeNull()
  })
})

describe('formatTs', () => {
  it('null 顯示 —，其餘顯示 MM-DD HH:MM', () => {
    expect(formatTs(null)).toBe('—')
    expect(formatTs('2026-09-25T08:04')).toBe('09-25 08:04')
  })
})

describe('minutesBetween', () => {
  it('以分鐘計、下限 0', () => {
    const start = parseLocalTs('2026-09-25T10:00')!.getTime()
    expect(minutesBetween(start, start + 90 * 60_000)).toBe(90)
    expect(minutesBetween(start, start - 5 * 60_000)).toBe(0)
  })
})

describe('formatMinutes', () => {
  it('分／小時／天', () => {
    expect(formatMinutes(null)).toBe('—')
    expect(formatMinutes(0)).toBe('0 分')
    expect(formatMinutes(42)).toBe('42 分')
    expect(formatMinutes(65)).toBe('1 小時 5 分')
    expect(formatMinutes(60 * 24 * 2 + 60 * 3 + 7)).toBe('2 天 3 小時')
  })
})

describe('formatCountdown', () => {
  it('依 until_epoch 算倒數', () => {
    const now = Date.UTC(2026, 8, 25, 0, 0)
    const until = now / 1000 + (15 * 24 + 22) * 3600 + 30 * 60
    expect(formatCountdown(until, now)).toBe('15 天 22 小時')
    expect(formatCountdown(now / 1000 + 3 * 3600 + 12 * 60, now)).toBe('3 小時 12 分')
    expect(formatCountdown(now / 1000 + 59, now)).toBe('1 分')
    expect(formatCountdown(now / 1000 - 1, now)).toBe('已恢復')
  })
})

describe('formatPct / formatCost', () => {
  it('null 顯示 —', () => {
    expect(formatPct(null)).toBe('—')
    expect(formatPct(41.6)).toBe('42%')
    expect(formatCost(null)).toBe('—')
    expect(formatCost(1.234)).toBe('$1.23')
  })
})
