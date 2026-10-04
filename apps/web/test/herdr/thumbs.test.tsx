import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PaneThumbs, THUMB_LINES, tailLines } from '@/features/overview/PaneThumbs'
import { parseAnsi } from '@/lib/ansi'
import OverviewPage from '@/pages/overview/OverviewPage'
import { resetDashStore, useDashStore } from '@/store/store'
import { overview, pane, project } from '../shell/builders'

describe('tailLines', () => {
  it('去尾端空行後取最後 n 行', () => {
    const lines = parseAnsi('a\r\nb\r\nc\r\n   \r\n\r\n')
    expect(tailLines(lines, 2).map((l) => l.map((s) => s.text).join(''))).toEqual(['b', 'c'])
    expect(tailLines(parseAnsi('\r\n\r\n'), 3)).toEqual([])
  })
})

describe('PaneThumbs', () => {
  it('只畫工作中／卡住且有 agent 的 pane（Q9），連到 herdr 頁，標頭膠囊講狀態', () => {
    const panes = [
      pane({ paneId: 'wA:p1', workspaceId: 'wA', tabId: 'wA:t1', status: 'blocked', member: 'qa' }),
      pane({ paneId: 'wA:p2', agent: null, status: 'working' }),
      pane({ paneId: 'wA:p3', status: 'idle' }),
      pane({ paneId: 'wA:p4', status: 'working' }),
    ]
    render(
      <MemoryRouter>
        <PaneThumbs panes={panes} screens={{ 'wA:p1': { lines: parseAnsi('hello\r\nworld\r\n'), at: 1, error: null } }} />
      </MemoryRouter>,
    )
    const t = screen.getByTestId('thumb-wA:p1')
    expect(t).toHaveAttribute('href', '/herdr?w=wA&t=wA%3At1&p=wA%3Ap1')
    expect(t).toHaveAttribute('data-status', 'blocked')
    expect(t).toHaveTextContent('qa')
    expect(t).toHaveTextContent('world')
    expect(within(t).getByText('卡住').closest('[data-slot="status-pill"]')).toHaveAttribute('data-color', 'danger')
    expect(screen.queryByTestId('thumb-wA:p2')).toBeNull()
    expect(screen.queryByTestId('thumb-wA:p3')).toBeNull()
    expect(screen.getByTestId('thumb-wA:p4')).toBeInTheDocument()
  })

  it('終端內容 mono-terminal（text-2xs leading-terminal）、高 thumb-h、終端黑底，最後 10 行', () => {
    const many = Array.from({ length: 14 }, (_, i) => `line${i}`).join('\r\n')
    render(
      <MemoryRouter>
        <PaneThumbs panes={[pane({ paneId: 'P', status: 'working' })]} screens={{ P: { lines: parseAnsi(many), at: 1, error: null } }} />
      </MemoryRouter>,
    )
    const t = screen.getByTestId('thumb-P')
    expect(THUMB_LINES).toBe(10)
    expect(t).toHaveClass('bg-terminal-bg', 'rounded-md')
    const pre = t.querySelector('pre')!
    expect(pre).toHaveClass('font-mono', 'text-2xs', 'leading-terminal', 'h-(--thumb-h)', 'text-terminal-fg')
    expect(pre).toHaveTextContent('line4')
    expect(pre).not.toHaveTextContent('line3')
  })
})

describe('總覽縮圖', () => {
  const fetchMock = vi.fn(async (url: string) => {
    const m = /^\/api\/herdr\/panes\/([^/?]+)\/screen$/.exec(url)
    if (m) return Response.json({ paneId: decodeURIComponent(m[1]), generatedAt: 1, ansi: `screen ${decodeURIComponent(m[1])}\r\n` })
    return new Response('{}', { status: 404 })
  })
  const doc = (state: 'subscribed' | 'down' = 'subscribed') =>
    overview({
      herdr: { state, lastAt: 1 },
      projects: [project({ name: 'teamflow', otherPanes: [pane({ paneId: 'wE:p1', workspaceId: 'wE', tabId: 'wE:t1', name: 'leader', status: 'blocked' })] })],
    })
  const renderPage = () =>
    render(
      <TooltipProvider>
        <MemoryRouter>
          <OverviewPage />
        </MemoryRouter>
      </TooltipProvider>,
    )

  beforeEach(() => {
    resetDashStore()
    fetchMock.mockClear()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => localStorage.clear())

  it('預設開：讀畫面並畫縮圖；關掉後記在 localStorage、不再讀', async () => {
    useDashStore.setState({ overview: doc() })
    renderPage()
    expect(await within(screen.getByTestId('thumb-wE:p1')).findByText('screen wE:p1')).toBeInTheDocument()
    expect(screen.getByTestId('thumbs-toggle')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByTestId('thumbs-toggle'))
    expect(screen.queryByTestId('pane-thumbs')).toBeNull()
    expect(screen.getByTestId('thumbs-toggle')).toHaveAttribute('aria-pressed', 'false')
    expect(localStorage.getItem('dash.overview.thumbs')).toBe('off')
  })

  it('只讀工作中／卡住 pane 的畫面；閒置專案不讀', async () => {
    useDashStore.setState({
      overview: overview({
        herdr: { state: 'subscribed', lastAt: 1 },
        projects: [
          project({ name: 'busy', otherPanes: [pane({ paneId: 'B1', status: 'blocked' }), pane({ paneId: 'B2', status: 'idle' })] }),
          project({ name: 'calm', otherPanes: [pane({ paneId: 'C1', status: 'working' })] }),
        ],
      }),
    })
    renderPage()
    await within(screen.getByTestId('thumb-B1')).findByText('screen B1')
    const read = fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('/screen'))
    expect(read.some((u) => u.includes('B1'))).toBe(true)
    expect(read.some((u) => u.includes('B2') || u.includes('C1'))).toBe(false)
  })

  it('herdr 連不上：沒有開關、不讀畫面', async () => {
    useDashStore.setState({ overview: doc('down') })
    renderPage()
    await waitFor(() => expect(screen.getByTestId('project-teamflow')).toBeInTheDocument())
    expect(screen.queryByTestId('thumbs-toggle')).toBeNull()
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes('/screen'))).toHaveLength(0)
  })
})
