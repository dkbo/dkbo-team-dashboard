import { describe, expect, it } from 'vitest'
import { formatRelative, formatTs } from '@/lib/format'

const NOW = new Date(2026, 9, 3, 15, 0, 0).getTime()
const MIN = 60_000

describe('formatRelative', () => {
  it('<1 分鐘為「剛剛」（含時鐘略為超前的未來時間）', () => {
    expect(formatRelative(NOW, NOW)).toBe('剛剛')
    expect(formatRelative(NOW - 59_999, NOW)).toBe('剛剛')
    expect(formatRelative(NOW + 30_000, NOW)).toBe('剛剛')
  })
  it('<60 分鐘為「N 分鐘前」', () => {
    expect(formatRelative(NOW - MIN, NOW)).toBe('1 分鐘前')
    expect(formatRelative(NOW - 59 * MIN - 59_000, NOW)).toBe('59 分鐘前')
  })
  it('<24 小時為「N 小時前」', () => {
    expect(formatRelative(NOW - 60 * MIN, NOW)).toBe('1 小時前')
    expect(formatRelative(NOW - (24 * 60 - 1) * MIN, NOW)).toBe('23 小時前')
  })
  it('其餘沿用 formatTs', () => {
    const at = NOW - 24 * 60 * MIN
    expect(formatRelative(at, NOW)).toBe(formatTs('2026-10-02T15:00'))
    expect(formatRelative(at, NOW)).toBe('10-02 15:00')
  })
})
