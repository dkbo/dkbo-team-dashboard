import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { AppProviders, AppRoutes } from '@/App'
import { resetDashStore } from '@/store/store'
import { detail, listFixture, overview, project, summary } from '../shell/builders'
import { item, response } from '../activity/items'

class SilentES {
  readyState = 0
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  addEventListener() {}
  close() {}
}

beforeEach(() => {
  resetDashStore()
  vi.stubGlobal('EventSource', SilentES)
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/overview') return Response.json(overview({ projects: [project({ name: 'calm' }), busy('teamflow'), busy('collect')] }))
      if (url.startsWith('/api/activity')) return Response.json(response([item()]))
      return new Response('{}', { status: 404 })
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

function busy(name: string) {
  const t = summary({ dir: `2026-10-04-${name}`, short: name, status: 'running', current_wave: 1 })
  return project({ name, list: { ...listFixture, tasks: [...listFixture.tasks, t] }, active: { [t.dir]: detail({ ...t }) } })
}

const renderApp = () =>
  render(
    <AppProviders>
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>,
  )

const follows = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

describe('總覽頁版面', () => {
  it('頁首「總覽」＋副標；DOM 順序（手機順序）：四張摘要卡 → 活躍專案 → 活動欄 → 閒置專案', async () => {
    renderApp()
    const active = await screen.findByTestId('active-projects')
    expect(screen.getByRole('heading', { level: 1, name: '總覽' })).toBeInTheDocument()
    expect(screen.getByText(/3 個專案 · 2 個進行中任務 · 最後更新/)).toBeInTheDocument()
    const rail = screen.getByTestId('activity-rail')
    const idle = screen.getByTestId('idle-projects')
    for (const id of ['summary-running', 'summary-spend', 'summary-blocked', 'summary-quota']) expect(follows(screen.getByTestId(id), active)).toBe(true)
    expect(follows(active, rail)).toBe(true)
    expect(follows(rail, idle)).toBe(true)
    expect(within(active).getByTestId('project-teamflow')).toBeInTheDocument()
    expect(within(active).getByTestId('project-collect')).toBeInTheDocument()
    expect(within(active).queryByTestId('project-calm')).toBeNull()
    expect(await screen.findByTestId('activity-item')).toBeInTheDocument()
  })

  it('閒置專案收成一列（名稱、版本、已結案 N、最後結案），點列展開已結案清單', async () => {
    renderApp()
    const idle = await screen.findByTestId('idle-projects')
    expect(within(idle).getByText('閒置專案')).toBeInTheDocument()
    const row = within(idle).getByTestId('idle-project-row')
    expect(row).toHaveAttribute('data-project', 'calm')
    expect(row.tagName).toBe('BUTTON')
    expect(row).toHaveAttribute('aria-expanded', 'false')
    expect(row).toHaveTextContent('calm')
    expect(row).toHaveTextContent('v0.17.0')
    expect(row).toHaveTextContent('已結案 10')
    expect(row).toHaveTextContent('09-25 13:45')
    expect(within(idle).queryByTestId('task-2026-09-23-ops')).toBeNull()
    await userEvent.click(row)
    expect(row).toHaveAttribute('aria-expanded', 'true')
    expect(within(idle).getByTestId('task-2026-09-23-ops')).toBeInTheDocument()
  })

  it('全部閒置時活躍區顯示空狀態、沒有專案卡', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/overview') return Response.json(overview({ projects: [project({ name: 'calm' })] }))
        if (url.startsWith('/api/activity')) return Response.json(response([]))
        return new Response('{}', { status: 404 })
      }),
    )
    renderApp()
    const active = await screen.findByTestId('active-projects')
    expect(within(active).getByText('沒有需要注意的專案')).toBeInTheDocument()
    expect(screen.queryByTestId('project-calm')).toBeNull()
  })
})
