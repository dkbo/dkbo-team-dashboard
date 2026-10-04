import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { AppProviders, AppRoutes } from '@/App'
import { resetDashStore } from '@/store/store'
import { detail, overview, project } from './builders'

class SilentES {
  static instances: SilentES[] = []
  readyState = 0
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(public url: string) {
    SilentES.instances.push(this)
  }
  addEventListener() {}
  close() {}
}

beforeEach(() => {
  resetDashStore()
  SilentES.instances = []
  vi.stubGlobal('EventSource', SilentES)
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/overview')
        return Response.json(
          overview({
            // teamflow 無 running／blocked／錯誤 → Q10 閒置；collect 有錯誤 → 活躍卡
            projects: [project({ name: 'teamflow' }), project({ name: 'collect', mode: 'compat', error: { kind: 'exit', message: '讀取失敗' } })],
          }),
        )
      if (url.startsWith('/api/projects/'))
        return Response.json({
          project: 'teamflow',
          detail: { schema_version: 1, dkbo_version: '0.17.0', generated_at: 'x', kinds_down: [], task: detail({ dir: '2026-09-23-ops', display: '營運回饋' }) },
          panes: [],
        })
      if (url === '/api/history') return Response.json({ tasks: [] })
      return new Response('{}', { status: 404 })
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

function renderAt(path: string) {
  return render(
    <AppProviders>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>,
  )
}

describe('App 殼層', () => {
  // 頂部列用主要導覽定位：PageHeader 也是 <header>（在 <main> 內，瀏覽器不算 banner，但 jsdom 的角色計算會算）
  const topNav = () => screen.getByRole('navigation', { name: '主要導覽' })

  it('/ 顯示頂部列、活躍專案卡與閒置專案列，並開 SSE', async () => {
    renderAt('/')
    expect(await screen.findByTestId('project-collect')).toBeInTheDocument()
    expect(screen.queryByTestId('project-teamflow')).toBeNull()
    expect(screen.getAllByTestId('idle-project-row').map((r) => r.dataset.project)).toEqual(['teamflow'])
    expect(topNav()).toBeInTheDocument()
    expect(SilentES.instances.map((e) => e.url)).toEqual(['/api/stream'])
  })

  it('/p/:project/t/:dir 渲染任務詳情頁（殼層頂部列仍在）', async () => {
    renderAt('/p/teamflow/t/2026-09-23-ops')
    expect(await screen.findByText(/2026-09-23-ops/, {}, { timeout: 3000 })).toBeInTheDocument()
    expect(within(topNav()).getByRole('link', { name: '總覽' })).toBeInTheDocument()
  })

  it('/history 渲染歷史頁', async () => {
    renderAt('/history')
    // 載入中與載入後各有一個 PageHeader，元素會被換掉：等到載入後的那個再斷言
    await waitFor(() => expect(screen.queryByTestId('history-loading')).toBeNull(), { timeout: 3000 })
    expect(screen.getByRole('heading', { name: '歷史與分析' })).toBeInTheDocument()
  })

  it('/trends 渲染趨勢頁', async () => {
    renderAt('/trends')
    expect(await screen.findByRole('heading', { name: '花費與額度趨勢' }, { timeout: 3000 })).toBeInTheDocument()
  })

  it('未知路徑顯示找不到頁面', async () => {
    renderAt('/nope')
    expect(await screen.findByText('找不到這個頁面')).toBeInTheDocument()
    // 用 EmptyState page、內容頁容器 max-w-page，「回總覽」是 Button outline sm
    const empty = screen.getByText('找不到這個頁面').closest('[data-slot="empty-state"]')!
    expect(empty).toHaveAttribute('data-size', 'page')
    expect(empty.closest('.max-w-page')).not.toBeNull()
    const back = screen.getByRole('link', { name: '回總覽' })
    expect(back).toHaveAttribute('href', '/')
    expect(back).toHaveAttribute('data-variant', 'outline')
  })
})
