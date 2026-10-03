import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import type { OverviewDoc } from '@dash/shared'
import { SummaryCards } from '@/features/overview/SummaryCards'
import { SPEND_POLL_MS } from '@/features/overview/useTodaySpend'
import { overview, pane, project, summary } from '../shell/builders'
import { trends } from '../trends/fixtures'

const NOW = new Date(2026, 9, 3, 15, 0).getTime()

function renderCards(doc: OverviewDoc) {
  return render(
    <MemoryRouter>
      <SummaryCards overview={doc} now={NOW} />
    </MemoryRouter>,
  )
}

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation(async () =>
    Response.json(
      trends('7d', {
        costByDay: [
          { day: '2026-10-02', project: 'a', cost: 1.25 },
          { day: '2026-10-03', project: 'a', cost: 2 },
          { day: '2026-10-03', project: null, cost: 0.5 },
        ],
      }),
    ),
  )
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const running = () =>
  overview({
    projects: [
      project({
        list: {
          ...project().list!,
          tasks: [
            summary({ dir: 'd1', short: 'one', status: 'running', current_wave: 2, waves_planned: 4, updated_at: '2026-10-03T09:00' }),
            summary({ dir: 'd2', short: 'two', status: 'planning', current_wave: null, waves_planned: 3, updated_at: '2026-10-03T11:00' }),
          ],
        },
      }),
    ],
  })

describe('SummaryCards', () => {
  it('藍卡：進行中任務數與前 2 個任務的波次', async () => {
    renderCards(running())
    const card = screen.getByTestId('summary-running')
    expect(within(card).getByText('2')).toBeInTheDocument()
    expect(within(card).getByText('two 波 —/3')).toBeInTheDocument()
    expect(within(card).getByText('one 波 2/4')).toBeInTheDocument()
    await screen.findByText('$2.50')
  })

  it('紫卡：抓 7d 趨勢，顯示今日花費與昨日對照', async () => {
    renderCards(running())
    const card = screen.getByTestId('summary-spend')
    expect(await within(card).findByText('$2.50')).toBeInTheDocument()
    expect(within(card).getByText('昨日 $1.25')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/trends?range=7d', expect.anything())
  })

  it('紫卡：抓不到趨勢時主數字與昨日都顯示 —', async () => {
    fetchMock.mockImplementation(async () => new Response('x', { status: 500 }))
    renderCards(running())
    const card = screen.getByTestId('summary-spend')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(await within(card).findByText('昨日 —')).toBeInTheDocument()
    expect(within(card).getByTestId('summary-spend-value')).toHaveTextContent('—')
  })

  it('紫卡：每 60 秒重抓', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    renderCards(running())
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await act(async () => vi.advanceTimersByTime(SPEND_POLL_MS))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('珊瑚卡：0 卡住時顯示「大家都很順 ✨」並連到 /herdr', async () => {
    renderCards(running())
    const card = screen.getByTestId('summary-blocked')
    expect(card).toHaveAttribute('href', '/herdr')
    expect(within(card).getByText('大家都很順 ✨')).toBeInTheDocument()
    expect(within(card).getByText('0')).toBeInTheDocument()
    await screen.findByText('$2.50')
  })

  it('珊瑚卡：有卡住時顯示數量、最多 3 個名字，整張連到第一個的 herdr 頁', async () => {
    const agents = ['w', 'x', 'y', 'z'].map((n, i) => ({
      ...pane({ paneId: `P${i}`, workspaceId: 'W', tabId: 'T', status: 'blocked', name: `name-${n}` }),
      project: 'teamflow',
    }))
    renderCards({ ...running(), agents })
    const card = screen.getByTestId('summary-blocked')
    expect(card.tagName).toBe('A')
    expect(card).toHaveAttribute('href', '/herdr?w=W&t=T&p=P0')
    expect(within(card).getByText('4')).toBeInTheDocument()
    expect(within(card).getByText('name-w、name-x、name-y')).toBeInTheDocument()
    expect(within(card).queryByText('name-z')).not.toBeInTheDocument()
    await screen.findByText('$2.50')
  })

  it('每張卡角的裝飾圖示 aria-hidden', async () => {
    renderCards(running())
    for (const id of ['summary-running', 'summary-spend', 'summary-blocked']) {
      const icon = screen.getByTestId(id).querySelector('svg')
      expect(icon).toHaveAttribute('aria-hidden', 'true')
    }
    await screen.findByText('$2.50')
  })
})
