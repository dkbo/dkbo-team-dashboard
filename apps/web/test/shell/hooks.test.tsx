import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { COSTS_STALE_MS, useCostsAll, useHistory, useOverview, usePane, useTaskDetail } from '@/store'
import { resetDashStore, useDashStore } from '@/store/store'
import { detail, overview, pane, project } from './builders'

function stubFetch(route: (url: string) => { status: number; body: unknown }) {
  const fn = vi.fn(async (url: string) => {
    const { status, body } = route(url)
    return new Response(JSON.stringify(body), { status })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => resetDashStore())
afterEach(() => vi.unstubAllGlobals())

describe('store hooks', () => {
  it('useOverview 掛載時自動抓一次', async () => {
    const f = stubFetch(() => ({ status: 200, body: overview({ generatedAt: 7 }) }))
    const { result, rerender } = renderHook(() => useOverview())
    await waitFor(() => expect(result.current.data?.generatedAt).toBe(7))
    rerender()
    expect(f).toHaveBeenCalledTimes(1)
    expect(result.current).toMatchObject({ error: null, loading: false })
  })

  it('useTaskDetail 依 project/dir 抓與快取，reload 重抓，404 給 notFound', async () => {
    const f = stubFetch((url) =>
      url.endsWith('/missing')
        ? { status: 404, body: {} }
        : {
            status: 200,
            body: {
              project: 'teamflow',
              detail: { schema_version: 1, dkbo_version: null, generated_at: 'x', kinds_down: [], task: detail({ dir: 'd' }) },
              panes: [],
            },
          },
    )
    const { result, rerender } = renderHook(({ dir }) => useTaskDetail('teamflow', dir), { initialProps: { dir: 'd' } })
    await waitFor(() => expect(result.current.data?.detail.task.dir).toBe('d'))
    expect(result.current.notFound).toBe(false)
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(f).toHaveBeenCalledTimes(2)
    rerender({ dir: 'missing' })
    await waitFor(() => expect(result.current.notFound).toBe(true))
    expect(result.current.data).toBeNull()
  })

  it('useHistory 掛載時抓 /api/history', async () => {
    stubFetch(() => ({ status: 200, body: { tasks: [] } }))
    const { result } = renderHook(() => useHistory())
    await waitFor(() => expect(result.current.data).toEqual([]))
  })

  it('usePane 跟著 pane.updated 更新，空 id 回 undefined', () => {
    useDashStore.getState().handleEvent({
      event: 'overview.updated',
      data: overview({ projects: [project({ otherPanes: [pane({ paneId: 'p1', status: 'idle' })] })] }),
    })
    const { result } = renderHook(() => usePane('p1'))
    expect(result.current?.status).toBe('idle')
    act(() => useDashStore.getState().handleEvent({ event: 'pane.updated', data: pane({ paneId: 'p1', status: 'blocked' }) }))
    expect(result.current?.status).toBe('blocked')
    expect(renderHook(() => usePane(null)).result.current).toBeUndefined()
  })

  it('useCostsAll 掛載期間每 60 秒重抓 range=all，卸載即停', async () => {
    // 全假計時器；advanceTimersByTimeAsync 會在計時器之間讓 fetch 的 promise 跑完，不靠真時間等
    vi.useFakeTimers()
    const flush = () => act(() => vi.advanceTimersByTimeAsync(0))
    try {
      let n = 0
      const costs = () => ({ range: 'all', generatedAt: 0, from: 0, to: 0, skipped: 0, tasks: [], byRole: {}, unknownRole: 0, unattributed: ++n })
      const f = stubFetch(() => ({ status: 200, body: costs() }))
      const { result, unmount } = renderHook(() => useCostsAll())
      await flush()
      expect(result.current.data?.unattributed).toBe(1)
      expect(f).toHaveBeenCalledTimes(1)
      expect(String(f.mock.calls[0][0])).toContain('range=all')

      await act(() => vi.advanceTimersByTimeAsync(COSTS_STALE_MS))
      expect(result.current.data?.unattributed).toBe(2)
      await act(() => vi.advanceTimersByTimeAsync(COSTS_STALE_MS))
      expect(result.current.data?.unattributed).toBe(3)
      expect(f).toHaveBeenCalledTimes(3)

      unmount()
      await vi.advanceTimersByTimeAsync(COSTS_STALE_MS * 3)
      expect(f).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })
})
