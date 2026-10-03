import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { ActivityRail } from '@/features/activity/ActivityRail'
import { ACTIVITY_DEBOUNCE_MS, ACTIVITY_POLL_MS } from '@/features/activity/useActivity'
import { useDashStore, resetDashStore } from '@/store/store'
import { overview, pane } from '../shell/builders'
import { NOW, item, response } from './items'

const fetchMock = vi.fn()
const activityCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).startsWith('/api/activity')).length

beforeEach(() => {
  resetDashStore()
  fetchMock.mockReset()
  fetchMock.mockImplementation(async () => Response.json(response([item()])))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const renderRail = () =>
  render(
    <MemoryRouter>
      <ActivityRail now={NOW} />
    </MemoryRouter>,
  )

describe('ActivityRail', () => {
  it('逐筆顯示頭像、去前綴的 actor（title 全名）、type 膠囊、內文、相對時間與「專案 · 任務」，整筆連到任務詳情', async () => {
    fetchMock.mockImplementation(async () =>
      Response.json(
        response([
          item({ ago: 3, type: 'ESCALATE', actor: 'glow-backend', text: '需要決策：要不要換 schema' }),
          item({ ago: 90, source: 'event', type: 'wave-open', actor: null, text: '1 base abc', taskDir: '2026-10-02-dusk', taskShort: 'dusk', project: 'other' }),
        ]),
      ),
    )
    renderRail()
    const rail = screen.getByTestId('activity-rail')
    const rows = await within(rail).findAllByTestId('activity-item')
    expect(rows).toHaveLength(2)

    const [a, b] = rows
    expect(a).toHaveAttribute('href', '/p/demo/t/2026-10-03-glow')
    expect(a).toHaveAttribute('data-type', 'ESCALATE')
    expect(a).toHaveAttribute('data-project', 'demo')
    expect(a).toHaveAttribute('data-task', '2026-10-03-glow')
    expect(within(a).getByText('backend')).toHaveAttribute('title', 'glow-backend')
    expect(within(a).getByText('ESCALATE')).toBeInTheDocument()
    expect(within(a).getByText('需要決策：要不要換 schema')).toBeInTheDocument()
    expect(within(a).getByText('3 分鐘前')).toBeInTheDocument()
    expect(within(a).getByText('demo · glow')).toBeInTheDocument()
    expect(within(a).getByTestId('activity-avatar').textContent).not.toBe('👑')

    expect(b).toHaveAttribute('href', '/p/other/t/2026-10-02-dusk')
    expect(within(b).getByText('leader')).toBeInTheDocument()
    expect(within(b).getByTestId('activity-avatar')).toHaveTextContent('👑')
    expect(within(b).getByText('wave-open')).toBeInTheDocument()
    expect(within(b).getByText('1 小時前')).toBeInTheDocument()
    expect(within(b).getByText('other · dusk')).toBeInTheDocument()
  })

  it('內文最多兩行省略', async () => {
    renderRail()
    const row = await screen.findByTestId('activity-item')
    expect(within(row).getByText('完成，見 report').className).toContain('line-clamp-2')
  })

  it('載入中顯示骨架', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}))
    renderRail()
    expect(screen.getByTestId('activity-loading')).toBeInTheDocument()
  })

  it('空清單顯示「還沒有新動態，喝口茶吧 🍵」', async () => {
    fetchMock.mockImplementation(async () => Response.json(response([])))
    renderRail()
    expect(await screen.findByTestId('activity-empty')).toHaveTextContent('還沒有新動態，喝口茶吧 🍵')
  })

  it('失敗顯示「暫時拿不到活動」，按重試後重抓成功', async () => {
    fetchMock.mockImplementationOnce(async () => new Response('x', { status: 500 }))
    renderRail()
    const err = await screen.findByTestId('activity-error')
    expect(err).toHaveTextContent('暫時拿不到活動')
    await userEvent.click(screen.getByTestId('activity-retry'))
    expect(await screen.findByTestId('activity-item')).toBeInTheDocument()
    expect(screen.queryByTestId('activity-error')).not.toBeInTheDocument()
    expect(activityCalls()).toBe(2)
  })

  it('task.updated／overview.updated 1 秒防抖後只重抓一次；pane.updated 不觸發', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    renderRail()
    await vi.waitFor(() => expect(activityCalls()).toBe(1))
    const s = useDashStore.getState()
    act(() => {
      s.handleEvent({ event: 'task.updated', data: { project: 'demo', dir: '2026-10-03-glow' } })
      s.handleEvent({ event: 'pane.updated', data: pane() })
    })
    await act(async () => vi.advanceTimersByTime(500))
    act(() => s.handleEvent({ event: 'overview.updated', data: overview({ generatedAt: 2_000 }) }))
    await act(async () => vi.advanceTimersByTime(ACTIVITY_DEBOUNCE_MS - 1))
    expect(activityCalls()).toBe(1)
    await act(async () => vi.advanceTimersByTime(1))
    expect(activityCalls()).toBe(2)
  })

  it('沒有事件時每 60 秒保底重抓', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    renderRail()
    await vi.waitFor(() => expect(activityCalls()).toBe(1))
    await act(async () => vi.advanceTimersByTime(ACTIVITY_POLL_MS))
    expect(activityCalls()).toBe(2)
  })

  it('卸載後不再因事件重抓', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    const { unmount } = renderRail()
    await vi.waitFor(() => expect(activityCalls()).toBe(1))
    unmount()
    act(() => useDashStore.getState().handleEvent({ event: 'task.updated', data: { project: 'demo', dir: 'x' } }))
    await act(async () => vi.advanceTimersByTime(ACTIVITY_POLL_MS))
    expect(activityCalls()).toBe(1)
  })
})
