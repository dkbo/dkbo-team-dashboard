import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import type { AgentLive } from '@dash/shared'
import { TooltipProvider } from '@/components/ui/tooltip'
import { BlockedBadge } from '@/features/alerts/BlockedBadge'
import { agentLabel, newlyBlocked, titleWithCount } from '@/features/alerts/model'
import { herdrHref } from '@/lib/herdr'
import { useBlockedAlerts } from '@/features/alerts/useBlockedAlerts'
import { resetDashStore, useDashStore } from '@/store/store'
import { overview } from '../shell/builders'

const agent = (id: string, status: AgentLive['status'], over: Partial<AgentLive> = {}): AgentLive => ({
  paneId: id,
  tabId: 'wX:t1',
  workspaceId: 'wX',
  name: null,
  agent: 'claude',
  status,
  cwd: '/p',
  model: null,
  effort: null,
  cost: null,
  ctxPct: null,
  usage5hPct: null,
  usageWkPct: null,
  taskDir: null,
  member: null,
  project: null,
  ...over,
})

describe('alerts model', () => {
  it('newlyBlocked：只算這輪才變 blocked 的；第一輪不算', () => {
    const agents = [agent('a', 'blocked'), agent('b', 'blocked'), agent('c', 'idle')]
    expect(newlyBlocked(null, agents)).toEqual([])
    expect(newlyBlocked(new Map([['a', 'blocked'], ['b', 'working']]), agents).map((a) => a.paneId)).toEqual(['b'])
  })

  it('標題、名稱與 herdr 連結', () => {
    expect(titleWithCount('dkbo', 0)).toBe('dkbo')
    expect(titleWithCount('dkbo', 2)).toBe('(2) dkbo')
    expect(agentLabel(agent('a', 'idle', { project: 'teamflow', member: 'qa' }))).toBe('teamflow-qa')
    expect(agentLabel(agent('a', 'idle', { name: 'x-dev' }))).toBe('x-dev')
    expect(herdrHref(agent('wX:p1', 'idle'))).toBe('/herdr?w=wX&t=wX%3At1&p=wX%3Ap1')
  })
})

let path = ''
function Probe() {
  useBlockedAlerts()
  path = useLocation().pathname + useLocation().search
  return <BlockedBadge />
}

class FakeNotification {
  static permission = 'granted'
  static sent: FakeNotification[] = []
  onclick: (() => void) | null = null
  constructor(
    public title: string,
    public opts: NotificationOptions,
  ) {
    FakeNotification.sent.push(this)
  }
  close() {}
}

describe('useBlockedAlerts／BlockedBadge', () => {
  beforeEach(() => {
    resetDashStore()
    document.title = 'dkbo 儀表板'
    FakeNotification.sent = []
    vi.stubGlobal('Notification', FakeNotification)
    localStorage.setItem('dash.notify.blocked', 'on')
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  const renderProbe = () =>
    render(
      <TooltipProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="*" element={<Probe />} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>,
    )

  it('標題帶卡住數；新變 blocked 才通知，點通知跳到 herdr 頁', () => {
    useDashStore.setState({ overview: overview({ agents: [agent('wX:p1', 'blocked'), agent('wX:p2', 'working', { name: 'beta' })] }) })
    renderProbe()
    expect(document.title).toBe('(1) dkbo 儀表板')
    expect(FakeNotification.sent).toHaveLength(0) // 一打開就已卡住的不通知
    expect(screen.getByTestId('blocked-badge')).toHaveTextContent('1 個 agent 卡住')

    act(() => useDashStore.setState({ overview: overview({ generatedAt: 2, agents: [agent('wX:p1', 'blocked'), agent('wX:p2', 'blocked', { name: 'beta' })] }) }))
    expect(document.title).toBe('(2) dkbo 儀表板')
    expect(FakeNotification.sent.map((n) => n.title)).toEqual(['beta 卡住了'])
    act(() => FakeNotification.sent[0].onclick!())
    expect(path).toBe('/herdr?w=wX&t=wX%3At1&p=wX%3Ap2')

    act(() => useDashStore.setState({ overview: overview({ generatedAt: 3, agents: [] }) }))
    expect(document.title).toBe('dkbo 儀表板')
    expect(screen.queryByTestId('blocked-badge')).toBeNull()
  })

  it('通知偏好關閉時不發通知', () => {
    localStorage.setItem('dash.notify.blocked', 'off')
    useDashStore.setState({ overview: overview({ agents: [agent('a', 'idle')] }) })
    renderProbe()
    act(() => useDashStore.setState({ overview: overview({ generatedAt: 2, agents: [agent('a', 'blocked')] }) }))
    expect(FakeNotification.sent).toHaveLength(0)
    expect(document.title).toBe('(1) dkbo 儀表板')
  })
})
