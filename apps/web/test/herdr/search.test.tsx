import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import type { HerdrSearchResponse, HerdrView } from '@dash/shared'
import { markSegments } from '@/features/herdr/AnsiText'
import { splitMatches } from '@/features/herdr/SearchPanel'
import HerdrPage from '@/pages/herdr/HerdrPage'
import { resetDashStore } from '@/store/store'
import { view } from './fixture'

describe('命中切段', () => {
  it('splitMatches 不分大小寫、全部命中', () => {
    expect(splitMatches('Error: error!', 'error')).toEqual([
      { text: 'Error', hit: true },
      { text: ': ', hit: false },
      { text: 'error', hit: true },
      { text: '!', hit: false },
    ])
    expect(splitMatches('abc', '')).toEqual([{ text: 'abc', hit: false }])
  })

  it('markSegments：命中跨 ANSI 片段時兩邊都切開、保留樣式', () => {
    const segs = [
      { text: 'ab', style: { bold: true } },
      { text: 'cd', style: {} },
    ]
    expect(markSegments(segs, 'bc')).toEqual([
      { text: 'a', style: { bold: true }, hit: false },
      { text: 'b', style: { bold: true }, hit: true },
      { text: 'c', style: {}, hit: true },
      { text: 'd', style: {}, hit: false },
    ])
    expect(markSegments(segs, 'zz').map((s) => s.hit)).toEqual([false, false])
  })
})

describe('herdr 頁搜尋', () => {
  const withHistory: HerdrView = structuredClone(view)
  withHistory.workspaces[0].tabs[0].panes[0].scrollback = 100

  const searchResp: HerdrSearchResponse = {
    q: 'boom',
    generatedAt: 1,
    truncated: false,
    failed: [],
    hits: [
      { paneId: 'wB:p4', workspaceId: 'wB', tabId: 'wB:t2', line: 1, text: '  boom here', history: false },
      { paneId: 'wA:p1', workspaceId: 'wA', tabId: 'wA:t1', line: 2, text: 'old boom', history: true },
    ],
  }
  const fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/herdr/view') return Response.json(withHistory)
    if (url.startsWith('/api/herdr/search?')) return Response.json(searchResp)
    const m = /^\/api\/herdr\/panes\/([^/?]+)\/screen(\?.*)?$/.exec(url)
    if (m) return Response.json({ paneId: decodeURIComponent(m[1]), generatedAt: 1, ansi: `line0\r\nboom here\r\nold boom\r\n` })
    return new Response('{}', { status: 404 })
  })

  beforeEach(() => {
    resetDashStore()
    fetchMock.mockClear()
    vi.stubGlobal('fetch', fetchMock)
  })

  it('/ 開搜尋、打字後查詢、畫面標黃；點結果跳到 pane 並標出那一行；歷史命中開歷史模式；Esc 關', async () => {
    render(
      <MemoryRouter initialEntries={['/herdr']}>
        <Routes>
          <Route path="herdr" element={<HerdrPage />} />
        </Routes>
      </MemoryRouter>,
    )
    await screen.findByTestId('herdr-pane-wB:p2')
    act(() => void fireEvent.keyDown(window, { key: '/' }))
    const box = screen.getByRole('textbox', { name: '搜尋 herdr 畫面' })
    fireEvent.change(box, { target: { value: 'boom' } })
    const hits = await screen.findByTestId('herdr-search-hits', {}, { timeout: 2000 })
    await within(hits).findByText(/beta › claude · 第 2 行/)
    expect(fetchMock.mock.calls.map((c) => c[0])).toContain('/api/herdr/search?q=boom')
    // 搜尋中，畫面上的命中標黃
    await waitFor(() => expect(within(screen.getByTestId('herdr-pane-wB:p4')).getAllByText('boom')[0].tagName).toBe('MARK'))

    // Enter 跳第一筆
    fireEvent.keyDown(box, { key: 'Enter' })
    await waitFor(() => expect(document.querySelector('[data-selected]')).toHaveAttribute('data-testid', 'herdr-pane-wB:p4'))
    expect(screen.getByTestId('herdr-pane-wB:p4').querySelector('[data-focused]')).toHaveTextContent(/^boom here$/)

    // 歷史裡的命中：跳到別的 space 並開歷史
    fireEvent.click(within(hits).getByText(/alpha › alpha-dev · 第 3 行 · 歷史/))
    const p1 = await screen.findByTestId('herdr-pane-wA:p1')
    await waitFor(() => expect(within(p1).getByTestId('herdr-screen')).toHaveAttribute('data-history'))
    expect(fetchMock.mock.calls.map((c) => c[0])).toContain('/api/herdr/panes/wA%3Ap1/screen?source=recent&lines=140')

    fireEvent.keyDown(box, { key: 'Escape' })
    expect(screen.queryByTestId('herdr-search')).toBeNull()
    await waitFor(() => expect(p1.querySelector('mark')).toBeNull())
  })
})
