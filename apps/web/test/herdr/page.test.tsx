import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import HerdrPage from '@/pages/herdr/HerdrPage'
import { resetDashStore, useDashStore } from '@/store/store'
import { overview, project } from '../shell/builders'
import { view } from './fixture'

let search = ''
function Loc() {
  search = useLocation().search
  return null
}

const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
  if (url === '/api/herdr/view') return Response.json(view)
  const m = /^\/api\/herdr\/panes\/(.+)\/screen$/.exec(url)
  if (m) return Response.json({ paneId: decodeURIComponent(m[1]), generatedAt: 1, ansi: `\u001b[31mscreen ${decodeURIComponent(m[1])}\u001b[0m\r\n` })
  return new Response('{}', { status: 404 })
})

beforeEach(() => {
  resetDashStore()
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
})

function renderPage(path = '/herdr') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="herdr"
          element={
            <>
              <HerdrPage />
              <Loc />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

const selectedPane = () => document.querySelector('[data-selected]')?.getAttribute('data-testid')

describe('HerdrPage', () => {
  it('預設顯示 herdr focus 的 space／tab，畫出分割版面與畫面內容', async () => {
    renderPage()
    await screen.findByTestId('herdr-pane-wB:p2')
    expect(within(screen.getByTestId('herdr-spaces')).getByText('beta').closest('button')).toHaveAttribute('data-active')
    expect(screen.getByTestId('herdr-pane-wB:p3')).toHaveStyle({ left: '50%', width: '50%', height: '50%' })
    expect(selectedPane()).toBe('herdr-pane-wB:p3')
    expect(await screen.findByText('screen wB:p4')).toHaveStyle({ color: '#cd3131' })
  })

  it('只輪詢目前 tab 的 pane，而且只用 GET', async () => {
    renderPage()
    await screen.findByText('screen wB:p2')
    const urls = fetchMock.mock.calls.map((c) => c[0])
    expect(urls.filter((u) => u.includes('/screen')).sort()).toEqual(
      ['/api/herdr/panes/wB%3Ap2/screen', '/api/herdr/panes/wB%3Ap3/screen', '/api/herdr/panes/wB%3Ap4/screen'],
    )
    expect(fetchMock.mock.calls.every((c) => !c[1]?.method || c[1].method === 'GET')).toBe(true)
  })

  it('鍵盤：h/j/k/l 切 pane、z 放大、↑↓ 切 space、數字切 tab；選擇寫進網址', async () => {
    renderPage()
    await screen.findByTestId('herdr-pane-wB:p2')
    act(() => void fireEvent.keyDown(window, { key: 'j' }))
    expect(selectedPane()).toBe('herdr-pane-wB:p4')
    act(() => void fireEvent.keyDown(window, { key: 'h' }))
    expect(selectedPane()).toBe('herdr-pane-wB:p2')
    act(() => void fireEvent.keyDown(window, { key: 'z' }))
    expect(screen.queryByTestId('herdr-pane-wB:p3')).toBeNull()
    expect(search).toContain('z=1')
    act(() => void fireEvent.keyDown(window, { key: 'Escape' }))
    expect(screen.getByTestId('herdr-pane-wB:p3')).toBeInTheDocument()
    act(() => void fireEvent.keyDown(window, { key: '1' }))
    expect(selectedPane()).toBe('herdr-pane-wB:p1')
    act(() => void fireEvent.keyDown(window, { key: 'ArrowDown' }))
    expect(selectedPane()).toBe('herdr-pane-wA:p1')
    expect(search).toContain('w=wA')
  })

  it('點 agents 清單跳到該 pane 所在的 space／tab', async () => {
    renderPage('/herdr?w=wA')
    await screen.findByTestId('herdr-pane-wA:p1')
    fireEvent.click(within(screen.getByTestId('herdr-agents')).getByText('beta-lead'))
    await waitFor(() => expect(selectedPane()).toBe('herdr-pane-wB:p2'))
  })

  it('herdr 讀不到時顯示錯誤', async () => {
    fetchMock.mockImplementationOnce(async () => new Response('{}', { status: 503 }))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('無法讀取 herdr')
  })

  it('屬於任務的 pane 標頭帶任務連結', async () => {
    const [p2] = view.workspaces[1].tabs[1].panes
    useDashStore.setState({
      overview: overview({
        projects: [project({ name: 'teamflow' })],
        agents: [{ ...p2, project: 'teamflow', taskDir: '2026-09-23-ops', member: 'backend' }],
      }),
    })
    renderPage()
    const pane = await screen.findByTestId('herdr-pane-wB:p2')
    const link = within(pane).getByTestId('pane-task-link')
    expect(link).toHaveAttribute('href', '/p/teamflow/t/2026-09-23-ops')
    expect(link).toHaveTextContent('2026-09-23-ops · backend')
    expect(within(screen.getByTestId('herdr-pane-wB:p3')).queryByTestId('pane-task-link')).toBeNull()
  })
})
