import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { TooltipProvider } from '@/components/ui/tooltip'
import TrendsPage from '@/pages/trends/TrendsPage'
import { resetDashStore, useDashStore } from '@/store/store'
import { overview, summary, project } from '../shell/builders'
import { costs, emptyCosts, emptyTrends, NOW, trends } from './fixtures'

type Handler = (range: string) => unknown

let trendsFor: Handler
let costsFor: Handler
const calls: string[] = []

beforeEach(() => {
  resetDashStore()
  calls.length = 0
  trendsFor = (r) => trends(r as never)
  costsFor = (r) => costs(r as never)
  vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] })
  vi.setSystemTime(NOW)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(url)
      const u = new URL(url, 'http://x')
      const range = u.searchParams.get('range') ?? ''
      const body = u.pathname === '/api/trends' ? trendsFor(range) : u.pathname === '/api/costs' ? costsFor(range) : null
      if (body instanceof Error) return new Response('{}', { status: 500 })
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    }),
  )
  useDashStore.setState({
    overview: overview({ projects: [project({ name: 'teamflow', list: { ...project().list!, tasks: [summary({ dir: '2026-09-25-x', display: 'X 任務' })] } })] }),
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

let loc = ''
function LocationProbe() {
  const l = useLocation()
  loc = `${l.pathname}${l.search}`
  return null
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <TooltipProvider>
        <Routes>
          <Route path="/trends" element={<TrendsPage />} />
        </Routes>
        <LocationProbe />
      </TooltipProvider>
    </MemoryRouter>,
  )

describe('TrendsPage', () => {
  it('沒帶 range 回落 24h 並改寫網址；trends 與 costs 用同一個 range', async () => {
    renderAt('/trends')
    await screen.findByTestId('usage-chart-claude')
    expect(loc).toBe('/trends?range=24h')
    expect(calls).toContain('/api/trends?range=24h')
    expect(calls).toContain('/api/costs?range=24h')
  })

  it('不合法的 range 回落 24h 並改寫網址', async () => {
    renderAt('/trends?range=1y')
    await screen.findByTestId('usage-chart-claude')
    expect(loc).toBe('/trends?range=24h')
    expect(calls.some((c) => c.includes('range=1y'))).toBe(false)
  })

  it('每個 kind 一張額度圖，旁邊顯示預估或「—」', async () => {
    renderAt('/trends?range=24h')
    const claude = await screen.findByTestId('usage-chart-claude')
    expect(within(claude).getByTestId('projection-5h')).toHaveTextContent('預估 12:30 達 100%')
    expect(within(claude).getByTestId('projection-week')).toHaveTextContent('預估 09-28 09:05 達 100%')
    const codex = screen.getByTestId('usage-chart-codex')
    expect(within(codex).getByTestId('projection-5h')).toHaveTextContent('—')
    expect(within(codex).getByTestId('projection-week')).toHaveTextContent('—')
  })

  it('ctx 圖的圖例用後端給的 label；有每日花費圖', async () => {
    renderAt('/trends?range=24h')
    const ctx = await screen.findByTestId('ctx-chart')
    expect(within(ctx).getByText('frontend')).toBeInTheDocument()
    expect(within(ctx).getByText('dashv1-qa')).toBeInTheDocument()
    const day = screen.getByTestId('cost-by-day-chart')
    expect(within(day).getByText('teamflow')).toBeInTheDocument()
    expect(within(day).getByText('未歸屬')).toBeInTheDocument()
  })

  it('kind 小計、角色小計（含未知角色）', async () => {
    renderAt('/trends?range=24h')
    expect(await screen.findByTestId('kind-cost-claude')).toHaveTextContent('$3.25')
    expect(screen.getByTestId('kind-cost-codex')).toHaveTextContent('$0.50')
    expect(screen.getByTestId('role-cost-frontend')).toHaveTextContent('$2.00')
    expect(screen.getByTestId('role-cost-unknown')).toHaveTextContent('未知角色')
    expect(screen.getByTestId('role-cost-unknown')).toHaveTextContent('$0.75')
  })

  it('任務花費表：找得到的任務可點、找不到只顯示 dir；成員細分＋其他', async () => {
    renderAt('/trends?range=24h')
    const table = await screen.findByTestId('task-cost-table')
    const link = within(table).getByRole('link', { name: 'X 任務' })
    expect(link).toHaveAttribute('href', '/p/teamflow/t/2026-09-25-x')
    const row = screen.getByTestId('task-cost-teamflow-2026-09-25-x')
    expect(row).toHaveTextContent('$3.00')
    expect(row).toHaveTextContent('frontend-shell $2.00')
    expect(row).toHaveTextContent('qa $0.75')
    expect(row).toHaveTextContent('其他 $0.25')
    const gone = screen.getByTestId('task-cost-teamflow-2026-01-01-gone')
    expect(gone).toHaveTextContent('2026-01-01-gone')
    expect(within(gone).queryByRole('link')).toBeNull()
  })

  it('任務花費卡：同一個 cost-by-task 容器內有表格（≥768px）與小螢幕卡片列，卡片列含總額與成員細分', async () => {
    renderAt('/trends?range=24h')
    const box = await screen.findByTestId('cost-by-task')
    expect(within(box).getByTestId('task-cost-table').closest('table')).not.toBeNull()
    const list = within(box).getByTestId('task-cost-list')
    expect(list.className).toContain('md:hidden')
    const card = within(list).getByTestId('task-cost-card-teamflow-2026-09-25-x')
    expect(within(card).getByRole('link', { name: 'X 任務' })).toHaveAttribute('href', '/p/teamflow/t/2026-09-25-x')
    expect(card).toHaveTextContent('$3.00')
    expect(within(card).getByTestId('member-cost-frontend-shell')).toHaveTextContent('frontend-shell $2.00')
    expect(within(card).getByTestId('member-cost-other')).toHaveTextContent('其他 $0.25')
    expect(within(list).getByTestId('task-cost-card-teamflow-2026-01-01-gone')).toHaveTextContent('2026-01-01-gone')
    expect(within(list).getByTestId('task-cost-card-unattributed')).toHaveTextContent('未歸屬任務$0.50')
  })

  it('註記與資料目錄', async () => {
    renderAt('/trends?range=24h')
    await screen.findByTestId('usage-chart-claude')
    expect(screen.getByText('dashboard 未開啟期間的花費可能遺漏，或併入之後第一次記錄')).toBeInTheDocument()
    expect(screen.getByText('資料目錄：/home/u/.local/state/dkbo-dashboard')).toBeInTheDocument()
  })

  it('切換範圍：網址、兩支 API 與頁上數字都跟著換', async () => {
    trendsFor = (r) => trends(r as never, { costByKind: { claude: r === '7d' ? 9 : 3.25 } })
    costsFor = (r) => costs(r as never, { byRole: { frontend: r === '7d' ? 8 : 2 } })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderAt('/trends?range=24h')
    expect(await screen.findByTestId('kind-cost-claude')).toHaveTextContent('$3.25')
    await user.click(screen.getByRole('button', { name: '7 天' }))
    await waitFor(() => expect(screen.getByTestId('kind-cost-claude')).toHaveTextContent('$9.00'))
    expect(screen.getByTestId('role-cost-frontend')).toHaveTextContent('$8.00')
    expect(loc).toBe('/trends?range=7d')
    expect(calls).toContain('/api/trends?range=7d')
    expect(calls).toContain('/api/costs?range=7d')
    expect(screen.getByRole('button', { name: '7 天' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('沒有樣本時顯示空狀態，仍顯示資料目錄', async () => {
    trendsFor = (r) => emptyTrends(r as never)
    costsFor = (r) => emptyCosts(r as never)
    renderAt('/trends?range=6h')
    expect(await screen.findByText('尚無資料：dashboard 開著時每分鐘記錄一次')).toBeInTheDocument()
    expect(screen.queryByTestId('usage-chart-claude')).toBeNull()
    expect(screen.getByText(/資料目錄：/)).toBeInTheDocument()
  })

  it('API 失敗顯示錯誤與重試', async () => {
    trendsFor = () => new Error('x')
    renderAt('/trends?range=24h')
    expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 500')
    trendsFor = (r) => trends(r as never)
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByRole('button', { name: '重試' }))
    expect(await screen.findByTestId('usage-chart-claude')).toBeInTheDocument()
  })

  it('依模型／effort 花費（實際）：金額降冪，null 顯示「未知」', async () => {
    renderAt('/trends?range=24h')
    const card = await screen.findByTestId('cost-by-actual')
    expect(card).toHaveTextContent('依模型／effort 花費（實際：herdr 回報）')
    const items = within(card).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual(['opus 5.5/medium$1.50', 'sonnet 5/high$1.25', '未知$1.00'])
  })

  it('依派工檔位花費（設定）：列 kind＋tier＋model／effort，金額降冪，null 顯示「未知」', async () => {
    renderAt('/trends?range=24h')
    const card = await screen.findByTestId('cost-by-configured')
    expect(card).toHaveTextContent('依派工檔位花費（設定：dkbo 派工）')
    const items = within(card).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual(['claude L · opus/high$2.00', '未知$1.00', 'claude M · opus/medium$0.75'])
  })

  it('實際與設定不一致區塊：逐列 專案／任務／成員／實際／設定／花費', async () => {
    renderAt('/trends?range=24h')
    const box = await screen.findByTestId('cost-mismatch')
    expect(box).toHaveTextContent('實際與設定不一致')
    const row = within(box).getByTestId('mismatch-row-1')
    expect(row).toHaveTextContent('teamflow')
    expect(row).toHaveTextContent('X 任務')
    expect(row).toHaveTextContent('frontend-shell')
    expect(within(row).getByTestId('mismatch-actual')).toHaveTextContent('sonnet 5/high')
    expect(within(row).getByTestId('mismatch-configured')).toHaveTextContent('opus/high')
    expect(row).toHaveTextContent('$1.25')
  })

  it('沒有不一致時不顯示不一致區塊', async () => {
    costsFor = (r) => costs(r as never, { mismatch: { cost: 0, panes: [] } })
    renderAt('/trends?range=24h')
    await screen.findByTestId('cost-by-actual')
    expect(screen.queryByTestId('cost-mismatch')).toBeNull()
  })

  it('依任務花費的成員細分：旁邊顯示設定檔位（標「設定」），不一致加標記與 tooltip', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderAt('/trends?range=24h')
    const row = await screen.findByTestId('task-cost-teamflow-2026-09-25-x')
    expect(within(row).getByTestId('member-tier-frontend-shell')).toHaveTextContent('設定 L · opus/high')
    expect(within(row).getByTestId('member-tier-qa')).toHaveTextContent('設定 M · opus/medium')
    const mark = within(row).getByTestId('member-mismatch-frontend-shell')
    expect(mark).toHaveAccessibleName('實際 sonnet 5/high，設定 opus/high')
    expect(within(row).queryByTestId('member-mismatch-qa')).toBeNull()
    await user.hover(mark)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('實際 sonnet 5/high，設定 opus/high')
    // 沒有派工紀錄的成員：檔位顯示「未知」
    const gone = screen.getByTestId('task-cost-teamflow-2026-01-01-gone')
    expect(within(gone).getByTestId('member-tier-backend')).toHaveTextContent('設定 未知')
  })

  it('成員不一致 tooltip 取該任務該成員 mismatch.panes 花費最大的一列（後段已對齊也不會顯示一致的值）', async () => {
    renderAt('/trends?range=24h')
    const row = await screen.findByTestId('task-cost-teamflow-2026-09-25-x')
    // memberInfo.actual 是最後一筆（opus 5.5/high，已與設定對齊）；同成員別的任務那列（$9）不算
    expect(within(row).getByTestId('member-mismatch-frontend-shell')).toHaveAccessibleName('實際 sonnet 5/high，設定 opus/high')
  })

  it('新卡片跟著 range 切換', async () => {
    costsFor = (r) => costs(r as never, { byActual: [{ model: 'opus', effort: 'high', cost: r === '7d' ? 7 : 1 }] })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderAt('/trends?range=24h')
    expect(await screen.findByTestId('cost-by-actual')).toHaveTextContent('$1.00')
    await user.click(screen.getByRole('button', { name: '7 天' }))
    await waitFor(() => expect(screen.getByTestId('cost-by-actual')).toHaveTextContent('$7.00'))
  })
})
