import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { HerdrView } from '@dash/shared'
import { LIVE_SAFETY_MS, viewPollMs } from '@/features/herdr/useHerdr'
import HerdrPage from '@/pages/herdr/HerdrPage'
import { mergePaneIntoHerdrView } from '@/store/merge'
import { resetDashStore, useDashStore } from '@/store/store'
import { view, vpane } from './fixture'

const withHistory: HerdrView = structuredClone(view)
withHistory.workspaces[1].tabs[1].panes[0].scrollback = 300

beforeEach(() => resetDashStore())

describe('herdr 全貌的即時更新', () => {
  it('推送中只保險重抓，否則照 pollMs 輪詢', () => {
    expect(viewPollMs(true, 2000)).toBe(LIVE_SAFETY_MS)
    expect(viewPollMs(false, 2000)).toBe(2000)
  })

  it('SSE herdr.view：較新的才收', () => {
    const s = useDashStore.getState()
    s.handleEvent({ event: 'herdr.view', data: { ...view, generatedAt: 5 } })
    s.handleEvent({ event: 'herdr.view', data: { ...view, generatedAt: 3, workspaces: [] } })
    expect(useDashStore.getState().herdrView?.generatedAt).toBe(5)
    expect(useDashStore.getState().herdrView?.workspaces).toHaveLength(2)
  })

  it('pane.updated 合進 herdr 全貌：狀態與 token 更新，rect／title／scrollback 不動', () => {
    const p = vpane('wB:p3', [0, 0, 1, 1], 'working', { cost: 9, title: 'x', scrollback: 7 })
    const next = mergePaneIntoHerdrView(withHistory, p)
    const merged = next.workspaces[1].tabs[1].panes[1]
    expect(merged).toMatchObject({ status: 'working', cost: 9, rect: { x: 50, y: 0, width: 50, height: 20 }, title: null, scrollback: 0 })
    expect(next.workspaces[0]).toBe(withHistory.workspaces[0])
    expect(mergePaneIntoHerdrView(withHistory, vpane('zz:p1', [0, 0, 1, 1]))).toBe(withHistory)
  })

  it('經由 store 的 handleEvent：pane.updated 更新 herdr 頁畫面上的狀態', () => {
    useDashStore.setState({ herdrView: view })
    useDashStore.getState().handleEvent({ event: 'pane.updated', data: vpane('wB:p2', [0, 0, 1, 1], 'blocked') })
    expect(useDashStore.getState().herdrView!.workspaces[1].tabs[1].panes[0].status).toBe('blocked')
  })
})

describe('歷史模式', () => {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/herdr/view') return Response.json(withHistory)
    const m = /^\/api\/herdr\/panes\/([^/]+)\/screen(\?.*)?$/.exec(url)
    if (m) return Response.json({ paneId: decodeURIComponent(m[1]), generatedAt: 1, ansi: `${m[2] ? 'history' : 'live'} ${decodeURIComponent(m[1])}\r\n` })
    return new Response('{}', { status: 404 })
  })

  beforeEach(() => {
    fetchMock.mockClear()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('有捲動歷史的 pane 才有「歷史」鈕；打開後改讀 source=recent，Esc 回即時', async () => {
    render(
      <MemoryRouter initialEntries={['/herdr']}>
        <Routes>
          <Route path="herdr" element={<HerdrPage />} />
        </Routes>
      </MemoryRouter>,
    )
    const p2 = await screen.findByTestId('herdr-pane-wB:p2')
    expect(within(screen.getByTestId('herdr-pane-wB:p3')).queryByTestId('pane-history-toggle')).toBeNull()
    fireEvent.click(within(p2).getByTestId('pane-history-toggle'))
    expect(await within(p2).findByText('history wB:p2')).toBeInTheDocument()
    expect(fetchMock.mock.calls.map((c) => c[0])).toContain('/api/herdr/panes/wB%3Ap2/screen?source=recent&lines=340')
    expect(within(p2).getByTestId('herdr-screen')).toHaveAttribute('data-history')
    act(() => void fireEvent.keyDown(window, { key: 'Escape' }))
    await waitFor(() => expect(within(p2).getByTestId('herdr-screen')).not.toHaveAttribute('data-history'))
    expect(await within(p2).findByText('live wB:p2')).toBeInTheDocument()
  })
})
