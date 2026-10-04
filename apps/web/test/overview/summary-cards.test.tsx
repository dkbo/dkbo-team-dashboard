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
  it('進行中卡：> 0 綠（ok），任務數與前 2 個任務的波次合成一行', async () => {
    renderCards(running())
    const card = screen.getByTestId('summary-running')
    expect(card).toHaveAttribute('data-variant', 'ok')
    expect(within(card).getByText('2')).toBeInTheDocument()
    expect(within(card).getByText('two · 波 —/3、one · 波 2/4')).toBeInTheDocument()
    await screen.findByText('$2.50')
  })

  it('進行中卡：0 時 quiet，副行「目前沒有任務在跑」', async () => {
    renderCards(overview())
    const card = screen.getByTestId('summary-running')
    expect(card).toHaveAttribute('data-variant', 'quiet')
    expect(within(card).getByText('目前沒有任務在跑')).toBeInTheDocument()
    await screen.findByText('$2.50')
  })

  it('今日花費卡：抓 7d 趨勢，有資料 brand，顯示今日花費與昨日對照', async () => {
    renderCards(running())
    const card = screen.getByTestId('summary-spend')
    expect(await within(card).findByText('$2.50')).toBeInTheDocument()
    expect(card).toHaveAttribute('data-variant', 'brand')
    expect(within(card).getByText('昨日 $1.25')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/trends?range=7d', expect.anything())
  })

  it('今日花費卡：抓不到趨勢時 quiet，主數字與昨日都顯示 —', async () => {
    fetchMock.mockImplementation(async () => new Response('x', { status: 500 }))
    renderCards(running())
    const card = screen.getByTestId('summary-spend')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(await within(card).findByText('昨日 —')).toBeInTheDocument()
    expect(within(card).getByTestId('summary-spend-value')).toHaveTextContent('—')
    expect(card).toHaveAttribute('data-variant', 'quiet')
  })

  it('今日花費卡：每 60 秒重抓', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    renderCards(running())
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await act(async () => vi.advanceTimersByTime(SPEND_POLL_MS))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('卡住卡：0 時 quiet，副行綠字「大家都很順 ✨」並連到 /herdr', async () => {
    renderCards(running())
    const card = screen.getByTestId('summary-blocked')
    expect(card).toHaveAttribute('href', '/herdr')
    expect(card).toHaveAttribute('data-variant', 'quiet')
    expect(within(card).getByText('大家都很順 ✨')).toHaveClass('text-status-ok-fg')
    expect(within(card).getByText('0')).toBeInTheDocument()
    await screen.findByText('$2.50')
  })

  it('卡住卡：有卡住時 danger，顯示數量、最多 3 個名字，整張連到第一個的 herdr 頁', async () => {
    const agents = ['w', 'x', 'y', 'z'].map((n, i) => ({
      ...pane({ paneId: `P${i}`, workspaceId: 'W', tabId: 'T', status: 'blocked', name: `name-${n}` }),
      project: 'teamflow',
    }))
    renderCards({ ...running(), agents })
    const card = screen.getByTestId('summary-blocked')
    expect(card.tagName).toBe('A')
    expect(card).toHaveAttribute('data-variant', 'danger')
    expect(card).toHaveAttribute('href', '/herdr?w=W&t=T&p=P0')
    expect(within(card).getByText('4')).toBeInTheDocument()
    expect(within(card).getByText('name-w、name-x、name-y')).toBeInTheDocument()
    expect(within(card).queryByText('name-z')).not.toBeInTheDocument()
    await screen.findByText('$2.50')
  })

  it('熔斷與額度卡：有熔斷 warn，列 kind 與最短剩餘時間', async () => {
    const until = Math.floor(NOW / 1000) + 2 * 3600
    const kd = { kind: 'codex', until: '', until_epoch: until, exact: true, recorded_at: '', from_task: '', agent: '', reason: '', project: 'p' }
    renderCards({ ...running(), kindsDown: [kd] })
    const card = screen.getByTestId('summary-quota')
    expect(card).toHaveAttribute('data-variant', 'warn')
    expect(within(card).getByText('1 熔斷')).toBeInTheDocument()
    expect(within(card).getByText('codex · 最短還剩 2 小時 0 分')).toBeInTheDocument()
    await screen.findByText('$2.50')
  })

  it('熔斷與額度卡：額度 ≥ 80% warn（不變紅），否則 quiet 列最高用量', async () => {
    const { unmount } = renderCards({ ...running(), usage: { claude: { fiveHourPct: 85, weekPct: 20 } } })
    expect(screen.getByTestId('summary-quota')).toHaveAttribute('data-variant', 'warn')
    await screen.findByText('$2.50')
    unmount()
    renderCards({ ...running(), usage: { claude: { fiveHourPct: 37, weekPct: 25 } } })
    const card = screen.getByTestId('summary-quota')
    expect(card).toHaveAttribute('data-variant', 'quiet')
    expect(within(card).getByText('額度都健康 · 最高 claude 5h 37%')).toBeInTheDocument()
    await screen.findByText('$2.50')
  })

  it('四張卡順序固定：進行中、今日花費、卡住、熔斷與額度', async () => {
    renderCards(running())
    const ids = [...document.querySelectorAll('[data-slot=summary-tile]')].map((e) => e.getAttribute('data-testid'))
    expect(ids).toEqual(['summary-running', 'summary-spend', 'summary-blocked', 'summary-quota'])
    await screen.findByText('$2.50')
  })

  it('每張卡角的裝飾圖示 aria-hidden', async () => {
    renderCards(running())
    for (const id of ['summary-running', 'summary-spend', 'summary-blocked', 'summary-quota']) {
      const icon = screen.getByTestId(id).querySelector('svg')
      expect(icon).toHaveAttribute('aria-hidden', 'true')
    }
    await screen.findByText('$2.50')
  })
})
