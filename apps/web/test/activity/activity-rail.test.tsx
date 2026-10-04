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
  it('依任務分組：組頭連到任務（任務 short · 專案、最新相對時間），組內每則連到任務並帶 type／專案／任務屬性', async () => {
    fetchMock.mockImplementation(async () =>
      Response.json(
        response([
          item({ ago: 3, type: 'ESCALATE', actor: 'glow-backend', text: '需要決策：要不要換 schema' }),
          item({ ago: 4, type: 'DONE', actor: 'glow-frontend', text: '完成' }),
          item({ ago: 90, source: 'event', type: 'wave-open', actor: null, text: '1 base abc', taskDir: '2026-10-02-dusk', taskShort: 'dusk', project: 'other' }),
        ]),
      ),
    )
    renderRail()
    const rail = screen.getByTestId('activity-rail')
    const groups = await within(rail).findAllByTestId('activity-group')
    expect(groups.map((g) => g.getAttribute('data-task'))).toEqual(['2026-10-03-glow', '2026-10-02-dusk'])
    const head = within(groups[0]).getByRole('link', { name: /glow/ })
    expect(head).toHaveAttribute('href', '/p/demo/t/2026-10-03-glow')
    expect(head).toHaveTextContent('glow')
    expect(head).toHaveTextContent('· demo')
    expect(head).toHaveTextContent('3 分鐘前')

    const rows = within(rail).getAllByTestId('activity-item')
    expect(rows).toHaveLength(3)
    const [a, b, c] = rows
    expect(a).toHaveAttribute('href', '/p/demo/t/2026-10-03-glow')
    expect(a).toHaveAttribute('data-type', 'ESCALATE')
    expect(a).toHaveAttribute('data-project', 'demo')
    expect(a).toHaveAttribute('data-task', '2026-10-03-glow')
    expect(within(a).getByText('backend')).toHaveAttribute('title', 'glow-backend')
    expect(within(a).getByText('ESCALATE')).toHaveAttribute('data-variant', 'warn')
    expect(within(a).getByText('需要決策：要不要換 schema')).toBeInTheDocument()
    // 組內第一則不重複時間，之後的照常顯示
    expect(within(a).queryByText('3 分鐘前')).toBeNull()
    expect(within(b).getByText('4 分鐘前')).toBeInTheDocument()
    expect(within(a).getByTestId('activity-avatar')).toHaveClass('size-6')
    expect(within(a).getByTestId('activity-avatar').textContent).not.toBe('👑')
    expect(within(b).getByText('DONE')).toHaveAttribute('data-variant', 'ok')

    // leader／process 事件是 compact：不重複頭像、不顯示 actor
    expect(c).toHaveAttribute('data-variant', 'compact')
    expect(c).toHaveAttribute('href', '/p/other/t/2026-10-02-dusk')
    expect(within(c).queryByTestId('activity-avatar')).toBeNull()
    expect(within(c).queryByText('leader')).toBeNull()
    expect(within(c).getByText('wave-open')).toHaveAttribute('data-variant', 'info')
    expect(within(groups[1]).getByRole('link', { name: /dusk/ })).toHaveTextContent('1 小時前')
  })

  it('內文最多兩行省略，title 帶全文', async () => {
    renderRail()
    const row = await screen.findByTestId('activity-item')
    const text = within(row).getByText('完成，見 report')
    expect(text.className).toContain('line-clamp-2')
    expect(text).toHaveAttribute('title', '完成，見 report')
  })

  it('「全部｜需處理」切換：需處理只留 ESCALATE、BUG、BLOCKED、LIMIT、TIMEOUT、STOP，計數顯示在選項上', async () => {
    const types = ['DONE', 'ESCALATE', 'spawn', 'BUG', 'FIXED', 'STOP']
    fetchMock.mockImplementation(async () =>
      Response.json(response(types.map((type, i) => item({ type, ago: i + 1, taskDir: `2026-10-03-t${i}`, taskShort: `t${i}` })))),
    )
    renderRail()
    expect(await screen.findAllByTestId('activity-item')).toHaveLength(6)
    const filter = screen.getByTestId('activity-filter')
    const all = within(filter).getByRole('tab', { name: '全部' })
    const attention = within(filter).getByRole('tab', { name: /需處理/ })
    expect(all).toHaveAttribute('data-value', 'all')
    expect(all).toHaveAttribute('aria-selected', 'true')
    expect(attention).toHaveAttribute('data-value', 'attention')
    expect(attention).toHaveTextContent('3')
    await userEvent.click(attention)
    expect(screen.getAllByTestId('activity-item').map((r) => r.getAttribute('data-type'))).toEqual(['ESCALATE', 'BUG', 'STOP'])
    await userEvent.click(all)
    expect(screen.getAllByTestId('activity-item')).toHaveLength(6)
  })

  it('需處理過濾後沒有東西時顯示「沒有要處理的事 ✨」', async () => {
    renderRail()
    await screen.findByTestId('activity-item')
    await userEvent.click(within(screen.getByTestId('activity-filter')).getByRole('tab', { name: /需處理/ }))
    expect(screen.queryByTestId('activity-item')).toBeNull()
    expect(screen.getByText('沒有要處理的事 ✨')).toBeInTheDocument()
  })

  it('組內超過 4 則只顯示前 3 則，「再看 N 則」原地展開', async () => {
    fetchMock.mockImplementation(async () => Response.json(response([1, 2, 3, 4, 5, 6].map((ago) => item({ ago, text: `第 ${ago} 則` })))))
    renderRail()
    const group = await screen.findByTestId('activity-group')
    expect(within(group).getAllByTestId('activity-item')).toHaveLength(3)
    await userEvent.click(within(group).getByRole('button', { name: '再看 3 則' }))
    expect(within(group).getAllByTestId('activity-item')).toHaveLength(6)
    expect(within(group).queryByRole('button', { name: /再看/ })).toBeNull()
  })

  it('< lg 只顯示最新 5 則（分組後）：其餘加 max-lg:hidden，「看全部活動（N）」展開；不超過 5 則時沒有按鈕', async () => {
    const tasks = ['a', 'a', 'b', 'b', 'b', 'c', 'c']
    fetchMock.mockImplementation(async () =>
      Response.json(response(tasks.map((t, i) => item({ ago: i + 1, taskDir: `2026-10-03-${t}`, taskShort: t })))),
    )
    renderRail()
    const rows = await screen.findAllByTestId('activity-item')
    expect(rows.map((r) => r.closest('.max-lg\\:hidden') != null)).toEqual([false, false, false, false, false, true, true])
    const groups = screen.getAllByTestId('activity-group')
    expect(groups[2]).toHaveClass('max-lg:hidden')
    expect(groups[1]).not.toHaveClass('max-lg:hidden')
    const more = screen.getByTestId('activity-show-all')
    expect(more).toHaveTextContent('看全部活動（7）')
    expect(more).toHaveClass('lg:hidden')
    await userEvent.click(more)
    expect(screen.getAllByTestId('activity-item').some((r) => r.closest('.max-lg\\:hidden'))).toBe(false)
    expect(screen.queryByTestId('activity-show-all')).toBeNull()
  })

  it('「看全部活動」看實際畫出的則數：組內收合後沒有東西被藏就不出現', async () => {
    fetchMock.mockImplementation(async () => Response.json(response([1, 2, 3, 4, 5, 6].map((ago) => item({ ago })))))
    renderRail()
    await screen.findByTestId('activity-group')
    expect(screen.getAllByTestId('activity-item')).toHaveLength(3)
    expect(screen.queryByTestId('activity-show-all')).toBeNull()
  })

  it('「看全部活動（N）」的 N 是展開後實際畫出的則數（組內收合仍算收合後）', async () => {
    const a = [1, 2, 3, 4, 5, 6].map((ago) => item({ ago, taskDir: '2026-10-03-a', taskShort: 'a' }))
    const rest = ['b', 'c', 'd'].map((t, i) => item({ ago: 10 + i, taskDir: `2026-10-03-${t}`, taskShort: t }))
    fetchMock.mockImplementation(async () => Response.json(response([...a, ...rest])))
    renderRail()
    await screen.findAllByTestId('activity-group')
    const rows = screen.getAllByTestId('activity-item')
    expect(rows).toHaveLength(6)
    expect(rows.filter((r) => r.closest('.max-lg\\:hidden')).length).toBe(1)
    expect(screen.getByTestId('activity-show-all')).toHaveTextContent('看全部活動（6）')
  })

  it('不超過 5 則時沒有「看全部活動」', async () => {
    renderRail()
    await screen.findByTestId('activity-item')
    expect(screen.queryByTestId('activity-show-all')).toBeNull()
  })

  it('載入中顯示骨架', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}))
    renderRail()
    expect(screen.getByTestId('activity-loading')).toBeInTheDocument()
  })

  it('空清單顯示 EmptyState 🍵「還沒有新動態，喝口茶吧」', async () => {
    fetchMock.mockImplementation(async () => Response.json(response([])))
    renderRail()
    const empty = await screen.findByTestId('activity-empty')
    expect(empty).toHaveAttribute('data-slot', 'empty-state')
    expect(empty).toHaveTextContent('🍵')
    expect(empty).toHaveTextContent('還沒有新動態，喝口茶吧')
  })

  it('失敗顯示「暫時拿不到活動」，按重試後重抓成功', async () => {
    fetchMock.mockImplementationOnce(async () => new Response('x', { status: 500 }))
    renderRail()
    const err = await screen.findByTestId('activity-error')
    expect(err).toHaveTextContent('暫時拿不到活動')
    expect(err).toHaveAttribute('data-slot', 'banner')
    expect(err).toHaveAttribute('data-tone', 'warn')
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
