import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import type { OfficeSession } from '@dash/shared'
import { TooltipProvider } from '@/components/ui/tooltip'
import { resetDashStore, useDashStore } from '@/store/store'
import { detail, officeSession, overview, pane, project, sessionsDoc } from '../shell/builders'

interface FakeSceneProps {
  sessions: OfficeSession[]
  selectedId: string | null
  focusRequest: { id: string; nonce: number } | null
  resetRequest: number
  theme: 'light' | 'dark'
  tasks: Record<string, unknown>
  onSelect(id: string | null): void
  onFallback(reason: 'webgl' | 'assets' | 'context-lost'): void
  onUserMovedCamera(moved: boolean): void
  objects: { boards: Record<string, { tone: string | null; chips: { label: string }[]; href: string }>; monitor: { value: string } } | null
  events: { id: string }[]
  onOpenObject(href: string): void
}

const h = vi.hoisted(() => ({
  props: null as FakeSceneProps | null,
  webgl: true,
  loads: 0,
  renders: 0,
  events: { events: [] as { id: string }[], announce: null as string | null },
}))

vi.mock('@/features/office/loadScene', () => ({
  loadScene: async () => {
    h.loads += 1
    return {
      default: (p: FakeSceneProps) => {
        h.props = p
        h.renders += 1
        return <div data-testid="fake-scene">{p.sessions.map((s) => s.id).join(',')}</div>
      },
    }
  },
}))
vi.mock('@/features/office/webgl', () => ({ hasWebGL: () => h.webgl }))
vi.mock('@/features/office/events/useOfficeEvents', () => ({ useOfficeEvents: () => h.events }))

// 頁面測試含 lazy 載入與 userEvent；共用 worktree 多人並跑全套時 5 秒預設太緊（frontend-scene 回報偶發 timeout）
vi.setConfig({ testTimeout: 15_000 })

const NOW = Date.now()
const SESSIONS = [
  officeSession({ id: 'p1', paneId: 'p1', sessionId: 'aaaa-1111', member: 'dev-a', project: 'atlas', taskDir: '2026-10-01-pay', role: 'dev', substate: 'waiting', question: '要改 package.json 嗎？', substateSince: NOW - 60_000 }),
  officeSession({ id: 's:cx1', paneId: null, kind: 'codex', sessionId: 'cx1', member: 'qa', project: 'beacon', role: 'qa', substate: 'error', error: 'usage_limit_exceeded', substateSince: NOW - 60_000 }),
  officeSession({ id: 'p3', paneId: 'p3', member: 'backend', project: 'atlas', taskDir: '2026-10-01-pay', role: 'backend', substate: 'running', tool: { name: 'Bash', summary: 'pnpm test' }, turnStartedAt: NOW - 30_000 }),
  officeSession({ id: 'p4', paneId: 'p4', kind: 'codex', member: 'reviewer', project: 'beacon', role: 'reviewer', substate: 'thinking', turnStartedAt: NOW - 30_000 }),
  officeSession({ id: 'p5', paneId: 'p5', member: 'designer', project: 'atlas', role: 'designer', substate: 'done', lastEventAt: NOW - 60_000 }),
]

let loc = ''
function Probe() {
  const l = useLocation()
  loc = l.pathname + l.search
  return null
}

function setWidth(px: number) {
  vi.stubGlobal('matchMedia', (q: string) => {
    const m = /min-width:\s*(\d+)px/.exec(q)
    return { matches: m ? px >= Number(m[1]) : false, addEventListener() {}, removeEventListener() {} }
  })
}

async function renderOffice(path = '/office') {
  const { default: OfficePage } = await import('@/pages/office/OfficePage')
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path="/office"
            element={
              <>
                <OfficePage />
                <Probe />
              </>
            }
          />
          <Route path="*" element={<Probe />} />
        </Routes>
      </MemoryRouter>
    </TooltipProvider>,
  )
}

const fetchMock = vi.fn(async (url: string) => {
  if (url.startsWith('/api/herdr/panes/')) return Response.json({ paneId: 'p1', generatedAt: 1, ansi: 'l1\nl2\nl3\nl4\nl5\nl6\nl7\nl8' })
  if (url === '/api/sessions') return Response.json(sessionsDoc(SESSIONS))
  return new Response('{}', { status: 404 })
})

beforeEach(() => {
  resetDashStore()
  h.props = null
  h.webgl = true
  h.loads = 0
  h.events = { events: [], announce: null }
  localStorage.clear()
  setWidth(1440)
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  useDashStore.setState({
    overview: overview({ projects: [], agents: [] }),
    sessions: sessionsDoc(SESSIONS),
    livePanes: { p1: pane({ paneId: 'p1', workspaceId: 'w1', tabId: 't1' }), p3: pane({ paneId: 'p3' }) },
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('/office 3D 視圖', () => {
  it('工具列：kind 篩選含 count、只看需要你含計數、3D｜清單；場景載入並收到篩好的 sessions', async () => {
    await renderOffice()
    expect(screen.getByTestId('office-page')).toBeInTheDocument()
    const kind = screen.getByTestId('office-kind-filter')
    expect(within(kind).getByRole('tab', { name: /全部/ })).toHaveTextContent('5')
    expect(within(kind).getByRole('tab', { name: /Claude/ })).toHaveTextContent('3')
    expect(within(kind).getByRole('tab', { name: /Codex/ })).toHaveTextContent('2')
    // AC2：s:cx1 是無 pane 的錯誤，不算需要你
    expect(screen.getByTestId('office-needs-toggle')).toHaveTextContent('1')
    expect(screen.getByTestId('office-view-toggle').querySelector('[data-state="active"]')).toHaveAttribute('data-value', '3d')
    expect(await screen.findByTestId('fake-scene')).toHaveTextContent('p1,s:cx1,p3,p4,p5')
    expect(screen.getByTestId('office-canvas')).toBeInTheDocument()
    expect(h.props?.tasks).toEqual({})

    await userEvent.click(within(kind).getByRole('tab', { name: /Codex/ }))
    expect(loc).toBe('/office?kind=codex')
    expect(screen.getByTestId('fake-scene')).toHaveTextContent('s:cx1,p4')

    await userEvent.click(within(kind).getByRole('tab', { name: /全部/ }))
    await userEvent.click(screen.getByTestId('office-needs-toggle'))
    expect(loc).toBe('/office?needs=1')
    expect(screen.getByTestId('office-needs-toggle')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('fake-scene')).toHaveTextContent(/^p1$/)
  })

  it('找人清單：需要你組列等你與有 pane 的錯誤（無 pane 的錯誤在第三組）；點列＝網址 focus＋請場景飛過去＋詳情；resume 用 sessionId', async () => {
    await renderOffice()
    await screen.findByTestId('fake-scene')
    const finder = screen.getByTestId('office-finder')
    const rows = within(finder).getAllByTestId('finder-row')
    expect(rows.map((r) => [r.dataset.session, r.dataset.substate])).toEqual([
      ['p1', 'waiting'],
      ['p3', 'running'],
      ['p4', 'thinking'],
    ])
    await userEvent.click(rows[0])
    expect(loc).toBe('/office?focus=p1')
    expect(h.props?.selectedId).toBe('p1')
    expect(h.props?.focusRequest?.id).toBe('p1')
    const detail = screen.getByTestId('office-detail')
    expect(detail).toHaveTextContent('dev-a')
    expect(detail).toHaveTextContent('要改 package.json 嗎？')
    expect(detail).toHaveTextContent('claude --resume aaaa-1111')
    expect(within(detail).getByRole('link', { name: /在 herdr 開/ })).toHaveAttribute('href', '/herdr?w=w1&t=t1&p=p1')
    expect(within(detail).getByRole('link', { name: /任務詳情/ })).toHaveAttribute('href', '/p/atlas/t/2026-10-01-pay')
    // 終端尾 6 行（有 pane）
    await waitFor(() => expect(within(detail).getByTestId('office-terminal-tail')).toHaveTextContent('l3'))
    expect(within(detail).getByTestId('office-terminal-tail')).not.toHaveTextContent('l2')

    // 沒有 pane 的 codex session：codex resume、不畫終端尾
    await userEvent.click(within(finder).getByRole('button', { name: /完成 · 中斷 · 閒置/ }))
    const cx = within(finder).getAllByTestId('finder-row').find((r) => r.dataset.session === 's:cx1')!
    expect(cx.dataset.substate).toBe('error')
    // I2：無 pane 的錯誤不算需要你，不畫紅（中斷的語氣）
    expect(cx.querySelector('[data-slot="status-dot"]')).toHaveAttribute('data-tone', 'warn')
    expect(cx.querySelector('.text-status-danger-fg')).toBeNull()
    await userEvent.click(cx)
    expect(loc).toBe('/office?focus=s%3Acx1')
    const d2 = screen.getByTestId('office-detail')
    expect(d2).toHaveTextContent('codex resume cx1')
    expect(d2).toHaveTextContent('usage_limit_exceeded')
    expect(d2.querySelector('[data-slot="banner"]')).toHaveAttribute('data-tone', 'warn')
    // 膠囊（SubstatePill，frontend-base）照細狀態畫「錯誤」；計時與 Banner 不用 danger 語氣
    expect([...d2.querySelectorAll('.text-status-danger-fg')].filter((el) => !el.closest('[data-slot="status-pill"]'))).toEqual([])
    expect(within(d2).queryByTestId('office-terminal-tail')).toBeNull()

    // 場景點空白＝取消選取
    act(() => h.props!.onSelect(null))
    expect(loc).toBe('/office')
    expect(screen.queryByTestId('office-detail')).toBeNull()
  })

  it('?focus= 開頁即選取並請場景飛過去；找不到就忽略', async () => {
    await renderOffice('/office?focus=p3')
    await screen.findByTestId('fake-scene')
    expect(h.props?.selectedId).toBe('p3')
    expect(h.props?.focusRequest?.id).toBe('p3')
    expect(screen.getByTestId('office-detail')).toHaveTextContent('backend')
  })

  it('FilterChip 角色只縮找人清單，場景人數不變；網址 f_role', async () => {
    await renderOffice()
    await screen.findByTestId('fake-scene')
    await userEvent.click(screen.getByRole('button', { name: /^角色/ }))
    await userEvent.click(await screen.findByRole('menuitemradio', { name: /reviewer/ }))
    expect(loc).toBe('/office?f_role=reviewer')
    expect(within(screen.getByTestId('office-finder')).getAllByTestId('finder-row').map((r) => r.dataset.session)).toEqual(['p4'])
    expect(screen.getByTestId('fake-scene')).toHaveTextContent('p1,s:cx1,p3,p4,p5')
  })

  it('場景回報素材載入失敗 → 自動落到清單＋Banner（data-reason）', async () => {
    await renderOffice()
    await screen.findByTestId('fake-scene')
    act(() => h.props!.onFallback('assets'))
    expect(screen.getByTestId('office-fallback-banner')).toHaveAttribute('data-reason', 'assets')
    expect(screen.getByTestId('office-list')).toBeInTheDocument()
    expect(screen.queryByTestId('office-canvas')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /再試 3D/ }))
    expect(await screen.findByTestId('fake-scene')).toBeInTheDocument()
    expect(screen.queryByTestId('office-fallback-banner')).toBeNull()
  })

  it('落到清單後場景卸載才補報的 context-lost 不覆蓋先到的 assets，再試 3D 後可重新記錄', async () => {
    await renderOffice()
    await screen.findByTestId('fake-scene')
    const onFallback = h.props!.onFallback
    act(() => onFallback('assets'))
    act(() => onFallback('context-lost'))
    expect(screen.getByTestId('office-fallback-banner')).toHaveAttribute('data-reason', 'assets')
    await userEvent.click(screen.getByRole('button', { name: /再試 3D/ }))
    await screen.findByTestId('fake-scene')
    act(() => h.props!.onFallback('context-lost'))
    expect(screen.getByTestId('office-fallback-banner')).toHaveAttribute('data-reason', 'context-lost')
  })

  it('使用者動過鏡頭後「重設視角」變提醒色，按下送 resetRequest', async () => {
    await renderOffice()
    await screen.findByTestId('fake-scene')
    const reset = screen.getByRole('button', { name: /重設視角/ })
    expect(reset).toHaveAttribute('data-moved', 'false')
    act(() => h.props!.onUserMovedCamera(true))
    expect(reset).toHaveAttribute('data-moved', 'true')
    const before = h.props!.resetRequest
    await userEvent.click(reset)
    expect(h.props!.resetRequest).toBe(before + 1)
  })

  it('每秒的計時更新與跨分鐘都不讓場景重渲染（props 穩定，靜止 0 幀的前提）', async () => {
    // 假時鐘：從某分鐘的第 59.5 秒開始，走 3 秒＝至少 3 次 useNow tick 並跨過分鐘邊界；不吃真時間，CPU 擠也不會飄
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    try {
      vi.setSystemTime(Math.floor(NOW / 60_000) * 60_000 + 59_500)
      await renderOffice()
      await screen.findByTestId('fake-scene')
      const before = h.renders
      act(() => vi.advanceTimersByTime(3_000))
      expect(h.renders).toBe(before)
    } finally {
      vi.useRealTimers()
    }
  })

  it('沒有 session → office-empty，不畫找人清單', async () => {
    useDashStore.setState({ sessions: sessionsDoc([]) })
    await renderOffice()
    expect(screen.getByTestId('office-empty')).toHaveTextContent('辦公室還沒有人上班')
    expect(screen.queryByTestId('office-finder')).toBeNull()
  })
})

describe('/office 清單模式與退路', () => {
  it('view=list：三欄（需要你／工作中／完成·中斷·閒置），不載入場景', async () => {
    await renderOffice('/office?view=list')
    const list = screen.getByTestId('office-list')
    const cols = within(list).getAllByRole('region')
    expect(cols.map((c) => c.getAttribute('aria-label'))).toEqual(['需要你', '工作中', '完成 · 中斷 · 閒置'])
    expect(within(cols[0]).getAllByTestId('finder-row').map((r) => r.dataset.session)).toEqual(['p1'])
    expect(within(cols[1]).getAllByTestId('finder-row').map((r) => r.dataset.session)).toEqual(['p3', 'p4'])
    expect(screen.queryByTestId('office-canvas')).toBeNull()
    expect(h.loads).toBe(0)
    await userEvent.click(screen.getByTestId('office-view-toggle').querySelector('[data-value="3d"]')!)
    expect(loc).toBe('/office')
  })

  it('無 WebGL：清單＋info Banner（data-reason=webgl），3D 項 disabled，不載入場景', async () => {
    h.webgl = false
    await renderOffice()
    expect(screen.getByTestId('office-fallback-banner')).toHaveAttribute('data-reason', 'webgl')
    expect(screen.getByTestId('office-list')).toBeInTheDocument()
    expect(screen.getByTestId('office-view-toggle').querySelector('[data-value="3d"]')).toBeDisabled()
    expect(h.loads).toBe(0)
  })

  it('< 768 預設清單＋「窄螢幕用清單顯示」，可「仍要開 3D」', async () => {
    setWidth(390)
    await renderOffice()
    expect(screen.getByTestId('office-list')).toBeInTheDocument()
    expect(screen.getByText('窄螢幕用清單顯示')).toBeInTheDocument()
    expect(h.loads).toBe(0)
    await userEvent.click(screen.getByRole('button', { name: '仍要開 3D' }))
    expect(await screen.findByTestId('fake-scene')).toBeInTheDocument()
  })

  it('手機清單：點列就地展開 resume 指令', async () => {
    setWidth(390)
    await renderOffice()
    const list = screen.getByTestId('office-list')
    const row = within(list).getAllByTestId('finder-row')[0]
    await userEvent.click(within(row).getByRole('button', { name: /dev-a/ }))
    expect(within(list).getByText('claude --resume aaaa-1111')).toBeInTheDocument()
    expect(loc).toBe('/office?focus=p1')
  })
})

describe('/office 頁面物件與事件接線（AC6）', () => {
  const PAY = '2026-10-01-pay'
  const ESC_TS = (() => {
    const d = new Date(NOW - 60_000)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
  })()
  const withTask = () =>
    useDashStore.setState({
      overview: overview({ agents: [], projects: [project({ name: 'atlas', list: null, active: { [PAY]: detail({ dir: PAY, short: 'pay', display: '結帳' }) } })] }),
      sessions: sessionsDoc([...SESSIONS, officeSession({ id: 'p9', paneId: 'p9', member: 'leader', leader: true, project: 'atlas', taskDir: PAY, substate: 'idle' })]),
    })
  const escDetail = () => ({
    project: 'atlas',
    detail: { schema_version: 1, dkbo_version: null, generated_at: ESC_TS, kinds_down: [], task: detail({ dir: PAY, short: 'pay', display: '結帳', messages: [{ ts: ESC_TS, from: 'pay-qa', to: 'leader', type: 'ESCALATE', text: '?' }] }) },
    panes: [],
    dispatch: [],
  })

  it('掛載時對每個進行中任務呼叫 fetchDetail（3D 與清單都要）', async () => {
    withTask()
    await renderOffice('/office?view=list')
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/projects/atlas/tasks/${PAY}`, expect.anything()))
  })

  it('場景收到 objects（白板 tone 走未解判定）、events；點物件＝navigate(href)', async () => {
    withTask()
    fetchMock.mockImplementation(async (url: string) => {
      if (url === `/api/projects/atlas/tasks/${PAY}`) return Response.json(escDetail())
      if (url === '/api/sessions') return Response.json(sessionsDoc(SESSIONS))
      return new Response('{}', { status: 404 })
    })
    h.events = { events: [{ id: 'e1' }], announce: null }
    await renderOffice()
    await screen.findByTestId('fake-scene')
    // p1 在這桌等你＝danger；ESCALATE 並存時 chip 兩個都列（E3）
    await waitFor(() => expect(h.props?.objects?.boards[PAY]?.chips.map((c) => c.label)).toEqual(['1 等你', 'ESCALATE']))
    expect(h.props?.objects?.boards[PAY]?.tone).toBe('danger')
    expect(h.props?.events.map((e) => e.id)).toEqual(['e1'])
    act(() => h.props!.onOpenObject('/herdr'))
    expect(loc).toBe('/herdr')
  })

  it('找人清單：有未解 ESCALATE 的任務，leader 列顯示 EventBadge（finder-escalate）', async () => {
    withTask()
    fetchMock.mockImplementation(async (url: string) => {
      if (url === `/api/projects/atlas/tasks/${PAY}`) return Response.json(escDetail())
      if (url === '/api/sessions') return Response.json(sessionsDoc(SESSIONS))
      return new Response('{}', { status: 404 })
    })
    await renderOffice()
    await screen.findByTestId('fake-scene')
    const finder = screen.getByTestId('office-finder')
    await userEvent.click(within(finder).getByRole('button', { name: /完成 · 中斷 · 閒置/ }))
    const row = await waitFor(() => {
      const r = within(finder).getAllByTestId('finder-row').find((x) => x.dataset.session === 'p9')!
      expect(within(r).getByTestId('finder-escalate')).toBeInTheDocument()
      return r
    })
    expect(row).toBeInTheDocument()
    const other = within(finder).getAllByTestId('finder-row').find((x) => x.dataset.session === 'p1')!
    expect(within(other).queryByTestId('finder-escalate')).toBeNull()
  })

  it('live region 掛在頁面（3D 與清單都播報）', async () => {
    h.events = { events: [], announce: 'atlas 結帳：波 1 審查通過' }
    const { unmount } = await renderOffice()
    const live = screen.getByTestId('office-live-region')
    expect(live).toHaveAttribute('aria-live', 'polite')
    expect(live).toHaveTextContent('atlas 結帳：波 1 審查通過')
    unmount()
    await renderOffice('/office?view=list')
    expect(screen.getByTestId('office-live-region')).toHaveTextContent('審查通過')
  })

  it('git 摘要只在 3D 視圖抓，清單模式不抓', async () => {
    await renderOffice('/office?view=list')
    await new Promise((r) => setTimeout(r, 20))
    expect(fetchMock.mock.calls.some(([u]) => u === '/api/git')).toBe(false)
    expect(h.loads).toBe(0)
  })

  it('3D 視圖抓 /api/git', async () => {
    await renderOffice()
    await screen.findByTestId('fake-scene')
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => u === '/api/git')).toBe(true))
  })
})

describe('/office 詳情 Sheet（AC12）', () => {
  it('768–1023 底部 Sheet：高度用 token、aria-modal、Tab 圈在 Sheet 內', async () => {
    setWidth(900)
    await renderOffice('/office?focus=p3')
    await screen.findByTestId('fake-scene')
    const sheet = screen.getByRole('dialog', { name: '詳情' })
    expect(sheet).toHaveAttribute('aria-modal', 'true')
    expect(sheet.className).toContain('h-(--sheet-h)')
    expect(sheet.className).not.toMatch(/h-\[/)
    await waitFor(() => expect(sheet.contains(document.activeElement)).toBe(true))
    for (let i = 0; i < 12; i++) {
      await userEvent.tab()
      expect(sheet.contains(document.activeElement)).toBe(true)
    }
    await userEvent.tab({ shift: true })
    expect(sheet.contains(document.activeElement)).toBe(true)
  })
})
