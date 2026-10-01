import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PaneThumbs, tailLines } from '@/features/overview/PaneThumbs'
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
  it('只畫有 agent 的 pane，連到 herdr 頁，卡住的標紅', () => {
    const panes = [
      pane({ paneId: 'wA:p1', workspaceId: 'wA', tabId: 'wA:t1', status: 'blocked', member: 'qa' }),
      pane({ paneId: 'wA:p2', agent: null }),
    ]
    render(
      <MemoryRouter>
        <PaneThumbs panes={panes} screens={{ 'wA:p1': { lines: parseAnsi('hello\r\nworld\r\n'), at: 1, error: null } }} />
      </MemoryRouter>,
    )
    const t = screen.getByTestId('thumb-wA:p1')
    expect(t).toHaveAttribute('href', '/herdr?w=wA&t=wA%3At1&p=wA%3Ap1')
    expect(t).toHaveTextContent('qa')
    expect(t).toHaveTextContent('world')
    expect(t.className).toContain('border-red-500')
    expect(screen.queryByTestId('thumb-wA:p2')).toBeNull()
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
      projects: [project({ name: 'teamflow', otherPanes: [pane({ paneId: 'wE:p1', workspaceId: 'wE', tabId: 'wE:t1', name: 'leader' })] })],
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
    fireEvent.click(screen.getByTestId('thumbs-toggle'))
    expect(screen.queryByTestId('pane-thumbs')).toBeNull()
    expect(localStorage.getItem('dash.overview.thumbs')).toBe('off')
  })

  it('herdr 連不上：沒有開關、不讀畫面', async () => {
    useDashStore.setState({ overview: doc('down') })
    renderPage()
    await waitFor(() => expect(screen.getByTestId('project-teamflow')).toBeInTheDocument())
    expect(screen.queryByTestId('thumbs-toggle')).toBeNull()
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).includes('/screen'))).toHaveLength(0)
  })
})
