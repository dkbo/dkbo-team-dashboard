// hover 卡的收起由 DOM 層（OfficeScene）用 hoveredId 決定，不等 r3f 根收到新 props：
// 負載下 props 傳到 r3f 根要 1.5–4 秒（e2e 量測），卡片會「殘留」。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useLingerId } from '@/features/office-scene/hover'

describe('useLingerId', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('有 id 時立刻回傳；變 null 後再留 100 ms 才放掉（§6.8 離開 100ms 後關）', () => {
    const { result, rerender } = renderHook(({ id }) => useLingerId(id), { initialProps: { id: null as string | null } })
    expect(result.current).toBeNull()
    rerender({ id: 'p1' })
    expect(result.current).toBe('p1')
    rerender({ id: null })
    expect(result.current).toBe('p1')
    act(() => void vi.advanceTimersByTime(99))
    expect(result.current).toBe('p1')
    act(() => void vi.advanceTimersByTime(1))
    expect(result.current).toBeNull()
  })

  it('留著的 100 ms 內又 hover 到別人：直接換成新的，舊的計時作廢', () => {
    const { result, rerender } = renderHook(({ id }) => useLingerId(id), { initialProps: { id: 'p1' as string | null } })
    rerender({ id: null })
    act(() => void vi.advanceTimersByTime(50))
    rerender({ id: 'p2' })
    expect(result.current).toBe('p2')
    act(() => void vi.advanceTimersByTime(500))
    expect(result.current).toBe('p2')
  })
})
