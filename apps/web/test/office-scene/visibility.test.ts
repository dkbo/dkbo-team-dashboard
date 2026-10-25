// AC11：背景分頁停 render（visibilityState === 'hidden' → frameloop 'never'），切回 'demand' 並 invalidate 一次
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { frameloopFor, useVisibilityFrameloop } from '@/features/office-scene/visibility'

let state: DocumentVisibilityState = 'visible'
const spy = vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => state)

function setVisibility(v: DocumentVisibilityState) {
  state = v
  document.dispatchEvent(new Event('visibilitychange'))
}

afterEach(() => {
  state = 'visible'
})

describe('frameloopFor', () => {
  it('hidden → never；visible → demand', () => {
    expect(frameloopFor('hidden')).toBe('never')
    expect(frameloopFor('visible')).toBe('demand')
  })
})

describe('useVisibilityFrameloop', () => {
  it('切到背景停 render、切回 demand＋invalidate 一次並通知（給「直接畫最終狀態」用）', () => {
    const setFrameloop = vi.fn()
    const invalidate = vi.fn()
    const onResume = vi.fn()
    const { unmount } = renderHook(() => useVisibilityFrameloop({ setFrameloop, invalidate, onResume }))
    expect(spy).toHaveBeenCalled()
    setVisibility('hidden')
    expect(setFrameloop).toHaveBeenLastCalledWith('never')
    expect(invalidate).not.toHaveBeenCalled()
    setVisibility('visible')
    expect(setFrameloop).toHaveBeenLastCalledWith('demand')
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(onResume).toHaveBeenCalledTimes(1)
    unmount()
    setVisibility('hidden')
    expect(setFrameloop).toHaveBeenCalledTimes(2)
  })

  it('掛載時已在背景就直接 never', () => {
    state = 'hidden'
    const setFrameloop = vi.fn()
    renderHook(() => useVisibilityFrameloop({ setFrameloop, invalidate: vi.fn() }))
    expect(setFrameloop).toHaveBeenCalledWith('never')
  })
})
