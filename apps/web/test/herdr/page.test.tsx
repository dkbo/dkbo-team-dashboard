import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import HerdrPage from '@/pages/herdr/HerdrPage'
import { resetDashStore, useDashStore } from '@/store/store'
import { overview, project } from '../shell/builders'
import { sessionLive } from '../shell/builders'
import { view, withSessions } from './fixture'

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

const selectedPane = () => document.querySelector('[data-testid^="herdr-pane-"][data-selected]')?.getAttribute('data-testid')

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

  it('工具頁骨架：PageHeader compact 帶唯讀說明，鍵盤說明在 ? popover', async () => {
    renderPage()
    await screen.findByTestId('herdr-pane-wB:p2')
    const h1 = screen.getByRole('heading', { level: 1, name: 'herdr' })
    expect(h1.closest('[data-slot=page-header]')).toHaveAttribute('data-size', 'compact')
    expect(h1.closest('[data-slot=page-header]')).toHaveTextContent('唯讀鏡像')
    expect(screen.queryByText(/Tab 循環/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '鍵盤說明' }))
    expect(await screen.findByText(/Tab 循環/)).toBeInTheDocument()
  })

  it('側欄是 SidebarList：agents 依 blocked → working → idle 排序；tab 列是 SegmentedControl sm', async () => {
    renderPage()
    await screen.findByTestId('herdr-pane-wB:p2')
    const agents = within(screen.getByTestId('herdr-agents')).getAllByRole('button')
    expect(agents.map((b) => b.getAttribute('data-pane'))).toEqual(['wB:p3', 'wB:p2', 'wA:p1', 'wB:p4'])
    expect(agents[0]).toHaveAttribute('data-slot', 'sidebar-item')
    const tabs = within(screen.getByTestId('herdr-tabs')).getByRole('tablist')
    expect(tabs).toHaveAttribute('data-size', 'sm')
    expect(within(tabs).getByRole('tab', { selected: true })).toHaveTextContent('split')
    fireEvent.click(within(tabs).getByRole('tab', { name: /main/ }))
    expect(selectedPane()).toBe('herdr-pane-wB:p1')
  })

  it('終端區固定 terminal-bg 黑底；錯誤用 Banner', async () => {
    renderPage()
    expect(await screen.findByTestId('herdr-layout')).toHaveClass('bg-terminal-bg')
    fetchMock.mockClear()
  })

  it('herdr 讀不到時用 Banner danger', async () => {
    fetchMock.mockImplementationOnce(async () => new Response('{}', { status: 503 }))
    renderPage()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveAttribute('data-slot', 'banner')
    expect(alert).toHaveAttribute('data-tone', 'danger')
  })

  it('focus 在 tab 列按 →：只換 tab，不會再被頁面的 pane 導覽鍵處理一次', async () => {
    renderPage('/herdr?w=wB&t=wB:t2&p=wB:p2')
    await screen.findByTestId('herdr-pane-wB:p2')
    const tab = within(screen.getByTestId('herdr-tabs')).getByRole('tab', { selected: true })
    tab.focus()
    act(() => void fireEvent.keyDown(tab, { key: 'ArrowRight' }))
    expect(selectedPane()).toBe('herdr-pane-wB:p1')
    expect(new URLSearchParams(search).get('t')).toBe('wB:t1')
    expect(new URLSearchParams(search).get('p')).toBeNull()
  })

  it('鍵盤說明鈕是 ? 圖示，沒有寫著不存在快捷鍵的 title', async () => {
    renderPage()
    await screen.findByTestId('herdr-pane-wB:p2')
    const btn = screen.getByRole('button', { name: '鍵盤說明' })
    expect(btn).not.toHaveAttribute('title')
    expect(btn.querySelector('svg.lucide-circle-question-mark, svg.lucide-circle-help')).toBeTruthy()
  })
})

// AC12：herdr 頁細狀態（office 規格 §6.13）
describe('HerdrPage 細狀態', () => {
  const NOW = 1_800_000_000_000
  const sec = (n: number) => NOW - n * 1000
  const sessionView = withSessions(view, {
    // wB:p3（blocked）＝等你 3:12；wB:p2＝執行 Bash 1:08；wA:p1＝完成 6 分前；wB:p4 沒有 session
    'wB:p3': sessionLive({ substate: 'waiting', substateSince: sec(192), lastEventAt: sec(192), tool: { name: 'Edit', summary: 'package.json' } }),
    'wB:p2': sessionLive({
      sessionId: 's2',
      substate: 'running',
      substateSince: sec(68),
      turnStartedAt: sec(68),
      lastEventAt: sec(1),
      tool: { name: 'Bash', summary: 'pnpm -C apps/web test' },
    }),
    'wA:p1': sessionLive({ sessionId: 's3', substate: 'done', substateSince: sec(360), lastEventAt: sec(360) }),
  })

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/herdr/view') return Response.json(sessionView)
      const m = /^\/api\/herdr\/panes\/(.+)\/screen$/.exec(url)
      if (m) return Response.json({ paneId: decodeURIComponent(m[1]), generatedAt: 1, ansi: 'x\r\n' })
      return new Response('{}', { status: 404 })
    })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('agents 段分「需要你／工作中／其他」三組，附 data-group 與計數；組內依細狀態排序', async () => {
    renderPage()
    await screen.findByTestId('herdr-pane-wB:p2')
    const groups = within(screen.getByTestId('herdr-agents')).getAllByTestId('herdr-agent-group')
    expect(groups.map((g) => g.getAttribute('data-group'))).toEqual(['needs', 'working', 'other'])
    expect(groups.map((g) => within(g).getByRole('heading').textContent)).toEqual(['需要你1', '工作中1', '其他2'])
    expect(within(groups[2]).getAllByRole('button').map((b) => b.getAttribute('data-pane'))).toEqual(['wA:p1', 'wB:p4'])
  })

  it('需要你的組標用 status-danger-fg；0 個的組不顯示', async () => {
    renderPage()
    await screen.findByTestId('herdr-pane-wB:p2')
    const [needs, working] = within(screen.getByTestId('herdr-agents')).getAllByTestId('herdr-agent-group')
    expect(within(needs).getByRole('heading').className).toContain('text-status-danger-fg')
    expect(within(working).getByRole('heading').className).not.toContain('text-status-danger-fg')
  })

  it('agent 項第二行「專案 · 細狀態 · 計時」；沒有 session 的退回 herdr 粗狀態、不帶計時', async () => {
    renderPage()
    await screen.findByTestId('herdr-pane-wB:p2')
    const item = (id: string) => within(screen.getByTestId('herdr-agents')).getAllByRole('button').find((b) => b.getAttribute('data-pane') === id)!
    expect(item('wB:p3')).toHaveTextContent('beta · 等你 · 已等 03:12')
    expect(item('wB:p2')).toHaveTextContent('beta · 執行 Bash · 本輪 01:08')
    expect(item('wA:p1')).toHaveTextContent('alpha · 完成 · 6 分前')
    expect(item('wB:p4')).toHaveTextContent('beta · 閒置')
    expect(item('wB:p4').textContent).not.toMatch(/分前|本輪|已等/)
    // 需要你組的計時用 danger 字色
    expect(within(item('wB:p3')).getByText('已等 03:12').className).toContain('text-status-danger-fg')
  })

  it('pane 標題列：細狀態膠囊（pane-substate）→ 計時 → pane 名 → 工具參數', async () => {
    renderPage()
    const pane = await screen.findByTestId('herdr-pane-wB:p2')
    const pill = within(pane).getByTestId('pane-substate')
    expect(pill).toHaveAttribute('data-substate', 'running')
    expect(pill).toHaveTextContent('執行 Bash')
    const header = pane.querySelector('[data-slot="pane-header"]')!
    expect(header).toHaveTextContent('本輪 01:08')
    expect(within(header as HTMLElement).getByTestId('pane-tool')).toHaveTextContent('pnpm -C apps/web test')
    // 沒有 session 的 pane 保留原本的 herdr 膠囊
    const bare = screen.getByTestId('herdr-pane-wB:p4')
    expect(within(bare).queryByTestId('pane-substate')).toBeNull()
    expect(bare.querySelector('[data-slot="status-pill"]')).toHaveAttribute('data-tone', 'idle')
  })

  it('選中的需要你 pane 加 2px status-danger 外框，其他選中 pane 維持 brand-blue', async () => {
    renderPage()
    await screen.findByTestId('herdr-pane-wB:p3')
    expect(selectedPane()).toBe('herdr-pane-wB:p3')
    expect(screen.getByTestId('herdr-pane-wB:p3').className).toContain('border-status-danger')
    act(() => void fireEvent.keyDown(window, { key: 'h' }))
    expect(selectedPane()).toBe('herdr-pane-wB:p2')
    expect(screen.getByTestId('herdr-pane-wB:p2').className).toContain('border-brand-blue')
    expect(screen.getByTestId('herdr-pane-wB:p3').className).not.toContain('border-status-danger')
  })

  it('tab 的點用該 tab 內最嚴重細狀態的 tone', async () => {
    renderPage()
    await screen.findByTestId('herdr-pane-wB:p2')
    const tab = (name: RegExp) => within(screen.getByTestId('herdr-tabs')).getByRole('tab', { name })
    expect(tab(/split/).querySelector('[data-slot="status-dot"]')).toHaveAttribute('data-tone', 'danger')
    expect(tab(/main/).querySelector('[data-slot="status-dot"]')).toHaveAttribute('data-tone', 'idle')
  })

  it('PageHeader「在辦公室看」帶目前選的 pane：/office?focus=<paneId>，換 pane 跟著變', async () => {
    renderPage()
    await screen.findByTestId('herdr-pane-wB:p3')
    const link = screen.getByTestId('herdr-office-link')
    expect(link).toHaveAttribute('href', `/office?${new URLSearchParams({ focus: 'wB:p3' })}`)
    expect(link).toHaveTextContent('在辦公室看')
    act(() => void fireEvent.keyDown(window, { key: 'h' }))
    expect(screen.getByTestId('herdr-office-link')).toHaveAttribute('href', `/office?${new URLSearchParams({ focus: 'wB:p2' })}`)
  })
})
