// review 累積 Minor 11／AC11：hidden 時 frameloop 必須是 never，重 render（configure 重跑）不能把它蓋回 demand。
// r3f 9.8.2 的 configure 拿「這次傳入的 frameloop」跟「上次傳入的」比，沒傳＝預設 'always'（會變成持續 render），
// 所以做法是 hidden 時傳 'never'，而不是省略 frameloop。
import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const configure = vi.fn(() => Promise.resolve())
const rootApi = { configure, render: vi.fn(), unmount: vi.fn() }
vi.mock('@react-three/fiber', () => ({
  createRoot: vi.fn(() => rootApi),
  events: () => ({}),
  extend: vi.fn(),
}))

import { SlimCanvas } from '@/features/office-scene/SlimCanvas'

let visibility: DocumentVisibilityState = 'visible'

beforeEach(() => {
  configure.mockClear()
  visibility = 'visible'
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300, x: 0, y: 0, toJSON() {} })
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const frameloops = () => (configure.mock.calls as unknown as { frameloop?: string }[][]).map((c) => c[0].frameloop)

describe('SlimCanvas frameloop', () => {
  it('分頁在背景時 configure 傳 never（重 render 也一樣）', async () => {
    visibility = 'hidden'
    const { rerender } = render(<SlimCanvas frameloop="demand">{null}</SlimCanvas>)
    await waitFor(() => expect(configure).toHaveBeenCalled())
    rerender(<SlimCanvas frameloop="demand">{null}</SlimCanvas>)
    await waitFor(() => expect(configure.mock.calls.length).toBeGreaterThan(1))
    expect(new Set(frameloops())).toEqual(new Set(['never']))
  })

  it('分頁可見時傳 prop 的 frameloop，且任何一次都不省略（省略會被 r3f 補成 always）', async () => {
    const { rerender } = render(<SlimCanvas frameloop="demand">{null}</SlimCanvas>)
    await waitFor(() => expect(configure).toHaveBeenCalled())
    rerender(<SlimCanvas frameloop="demand">{null}</SlimCanvas>)
    await waitFor(() => expect(configure.mock.calls.length).toBeGreaterThan(1))
    expect(new Set(frameloops())).toEqual(new Set(['demand']))
  })
})
