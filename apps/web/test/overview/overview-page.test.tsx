import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { AppProviders, AppRoutes } from '@/App'
import { resetDashStore } from '@/store/store'
import { overview, project } from '../shell/builders'
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
      if (url === '/api/overview') return Response.json(overview({ projects: [project({ name: 'teamflow' }), project({ name: 'collect' })] }))
      if (url.startsWith('/api/activity')) return Response.json(response([item()]))
      return new Response('{}', { status: 404 })
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

const follows = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

describe('總覽頁版面', () => {
  it('三張摘要卡在專案卡之前，活動欄在所有專案卡之後', async () => {
    render(
      <AppProviders>
        <MemoryRouter initialEntries={['/']}>
          <AppRoutes />
        </MemoryRouter>
      </AppProviders>,
    )
    const cards = [await screen.findByTestId('project-teamflow'), screen.getByTestId('project-collect')]
    const rail = screen.getByTestId('activity-rail')
    for (const c of cards) {
      expect(follows(c, rail)).toBe(true)
      for (const id of ['summary-running', 'summary-spend', 'summary-blocked']) expect(follows(screen.getByTestId(id), c)).toBe(true)
    }
    expect(await screen.findByTestId('activity-item')).toBeInTheDocument()
  })
})
