import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import type { AgentLive } from '@dash/shared'
import { TooltipProvider } from '@/components/ui/tooltip'
import { BlockedBadge } from '@/features/alerts/BlockedBadge'
import { agentLabel, attentionItems, newAttention, titleWithNeeds } from '@/features/alerts/model'
import { herdrHref } from '@/lib/herdr'
import { useBlockedAlerts } from '@/features/alerts/useBlockedAlerts'
import { resetDashStore, useDashStore } from '@/store/store'
import { officeSession, overview, sessionLive, sessionsDoc } from '../shell/builders'

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
  it('attentionItems：herdr 全部 blocked pane ∪ 等你／錯誤 session，以 sessionId（無 session 的 herdr pane 用 paneId）去重', () => {
    const doc = overview({
      agents: [
        agent('p1', 'blocked', { project: 'teamflow', member: 'qa', session: sessionLive({ sessionId: 'sa', substate: 'waiting' }) }),
        agent('p2', 'blocked', { session: sessionLive({ sessionId: 'sb', substate: 'error' }) }),
        agent('pX', 'blocked', { name: 'outside-dev' }), // config 以外專案的 pane 也算
        agent('p3', 'working'),
      ],
    })
    const sessions = [
      officeSession({ id: 'p1', paneId: 'p1', sessionId: 'sa', member: 'qa', substate: 'waiting', question: '要刪檔嗎？' }),
      officeSession({ id: 'p2', paneId: 'p2', sessionId: 'sb', member: 'dev', substate: 'error', error: 'usage_limit_exceeded' }),
      officeSession({ id: 's:abc', paneId: null, sessionId: 'abc', member: 'solo', substate: 'error', error: 'boom' }),
      officeSession({ id: 'p3', paneId: 'p3', substate: 'running' }),
    ]
    const items = attentionItems(doc, sessions)
    expect(items.map((i) => [i.key, i.kind])).toEqual([
      ['sa', 'waiting'],
      ['sb', 'error'],
      ['abc', 'error'],
      ['pX', 'waiting'],
    ])
    expect(items[0]).toMatchObject({ label: 'qa', detail: '要刪檔嗎？', href: '/office?focus=p1' })
    expect(items[3]).toMatchObject({ label: 'outside-dev', href: '/herdr?w=wX&t=wX%3At1&p=pX' })
    // sessions 還沒抓到時只算 herdr blocked
    expect(attentionItems(doc, null).map((i) => i.key)).toEqual(['sa', 'sb', 'pX'])
    expect(attentionItems(null, null)).toEqual([])
  })

  it('key 用 sessionId：pane 關掉（id 由 paneId 變 s:<sessionId>）或 session 對不到 pane，同一個 session 不算新對象', () => {
    const withPane = attentionItems(null, [officeSession({ id: 'p9', paneId: 'p9', sessionId: 'sx', substate: 'error', error: 'boom' })])
    const paneClosed = attentionItems(null, [officeSession({ id: 's:sx', paneId: null, sessionId: 'sx', substate: 'error', error: 'boom' })])
    expect(withPane.map((i) => i.key)).toEqual(['sx'])
    expect(newAttention(new Map(withPane.map((i) => [i.key, i.kind])), paneClosed)).toEqual([])
    // 連結仍用 OfficeSession.id（focus 契約不變）
    expect(withPane[0].href).toBe('/office?focus=p9')
    expect(paneClosed[0].href).toBe('/office?focus=s%3Asx')
    // 沒有 session 的 herdr blocked pane 才用 paneId；已被某 session 認領的 pane 不重複計
    const doc = overview({ agents: [agent('p9', 'blocked', { session: null }), agent('pZ', 'blocked')] })
    expect(attentionItems(doc, [officeSession({ id: 'p9', paneId: 'p9', sessionId: 'sx', substate: 'error' })]).map((i) => i.key)).toEqual(['sx', 'pZ'])
  })

  it('newAttention：只算新進入（或換了種類）的；第一輪不算', () => {
    const items = attentionItems(overview({ agents: [agent('a', 'blocked'), agent('b', 'blocked')] }), null)
    expect(newAttention(null, items)).toEqual([])
    expect(newAttention(new Map([['a', 'waiting']]), items).map((i) => i.key)).toEqual(['b'])
    expect(newAttention(new Map([['a', 'error'], ['b', 'waiting']]), items).map((i) => i.key)).toEqual(['a'])
  })

  it('標題前綴、名稱與 herdr 連結', () => {
    expect(titleWithNeeds('dkbo', 0)).toBe('dkbo')
    expect(titleWithNeeds('dkbo', 2)).toBe('(2) 需要你 · dkbo')
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
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))) // hook 會抓 /api/sessions；測試自己塞資料
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

  it('標題「(N) 需要你 · 」；新變成等你才通知「有人等你」，點通知跳到 herdr 頁', () => {
    useDashStore.setState({ overview: overview({ agents: [agent('wX:p1', 'blocked'), agent('wX:p2', 'working', { name: 'beta' })] }), sessions: sessionsDoc() })
    renderProbe()
    expect(document.title).toBe('(1) 需要你 · dkbo 儀表板')
    expect(FakeNotification.sent).toHaveLength(0) // 一打開就已卡住的不通知
    expect(screen.getByTestId('blocked-badge')).toHaveTextContent('1 個 agent 卡住')

    act(() => useDashStore.setState({ overview: overview({ generatedAt: 2, agents: [agent('wX:p1', 'blocked'), agent('wX:p2', 'blocked', { name: 'beta' })] }) }))
    expect(document.title).toBe('(2) 需要你 · dkbo 儀表板')
    expect(FakeNotification.sent.map((n) => n.title)).toEqual(['有人等你：beta'])
    act(() => FakeNotification.sent[0].onclick!())
    expect(path).toBe('/herdr?w=wX&t=wX%3At1&p=wX%3Ap2')

    act(() => useDashStore.setState({ overview: overview({ generatedAt: 3, agents: [] }) }))
    expect(document.title).toBe('dkbo 儀表板')
    expect(screen.queryByTestId('blocked-badge')).toBeNull()
  })

  it('session 出錯發「出錯」、點了到 /office 該人；同一次轉變 pane blocked＋session error 只發一則', () => {
    useDashStore.setState({ overview: overview({ agents: [agent('p1', 'working')] }), sessions: sessionsDoc([officeSession({ id: 'p1', member: 'dev-a', substate: 'running' })]) })
    renderProbe()
    act(() =>
      useDashStore.setState({
        overview: overview({ generatedAt: 2, agents: [agent('p1', 'blocked', { session: sessionLive({ substate: 'error' }) })] }),
        sessions: sessionsDoc([officeSession({ id: 'p1', member: 'dev-a', substate: 'error', error: 'API 500' })], { generatedAt: 2 }),
      }),
    )
    expect(FakeNotification.sent.map((n) => [n.title, n.opts.body])).toEqual([['出錯：dev-a', 'API 500']])
    expect(document.title).toBe('(1) 需要你 · dkbo 儀表板')
    act(() => FakeNotification.sent[0].onclick!())
    expect(path).toBe('/office?focus=p1')
    // 沒有 pane 的 session 等你也算進標題
    act(() => useDashStore.setState({ sessions: sessionsDoc([officeSession({ id: 's:z', paneId: null, sessionId: 'z', substate: 'waiting' })], { generatedAt: 3 }) }))
    expect(document.title).toBe('(2) 需要你 · dkbo 儀表板')
    expect(FakeNotification.sent.map((n) => n.title)).toEqual(['出錯：dev-a', '有人等你：dev-a'])
  })

  it('出錯 session 的 pane 被關掉後不重發「出錯」通知', () => {
    const err = (over: object) => officeSession({ sessionId: 'sx', member: 'dev-a', substate: 'error', error: 'API 500', ...over })
    useDashStore.setState({ overview: overview({ agents: [agent('p1', 'working')] }), sessions: sessionsDoc([officeSession({ sessionId: 'sx', member: 'dev-a', substate: 'running' })]) })
    renderProbe()
    act(() => useDashStore.setState({ sessions: sessionsDoc([err({})], { generatedAt: 2 }) }))
    expect(FakeNotification.sent.map((n) => n.title)).toEqual(['出錯：dev-a'])
    act(() => useDashStore.setState({ overview: overview({ generatedAt: 3, agents: [] }), sessions: sessionsDoc([err({ id: 's:sx', paneId: null })], { generatedAt: 3 }) }))
    expect(FakeNotification.sent).toHaveLength(1)
    expect(document.title).toBe('(1) 需要你 · dkbo 儀表板')
  })

  it('sessions 還沒到不定基準；SSE 重連後第一份資料重新當基準、不通知', () => {
    useDashStore.setState({ overview: overview({ agents: [agent('a', 'idle')] }) })
    renderProbe()
    expect(useDashStore.getState().sessions).toBeNull() // hook 會去抓，這裡 fetch 未 stub 不會成功
    act(() => useDashStore.setState({ overview: overview({ generatedAt: 2, agents: [agent('a', 'blocked', { name: 'a' })] }) }))
    expect(FakeNotification.sent).toHaveLength(0)
    act(() => useDashStore.setState({ sessions: sessionsDoc() }))
    act(() => useDashStore.setState({ sse: 'open' }))
    act(() => useDashStore.setState({ overview: overview({ generatedAt: 3, agents: [agent('a', 'blocked', { name: 'a' }), agent('b', 'blocked', { name: 'b' })] }) }))
    expect(FakeNotification.sent.map((n) => n.title)).toEqual(['有人等你：b'])
    // 斷線期間 c 變 blocked；重連後的第一份（overview 與 sessions 都更新）只當基準
    act(() => useDashStore.setState({ sse: 'connecting' }))
    act(() => useDashStore.setState({ sse: 'open' }))
    act(() => useDashStore.setState({ overview: overview({ generatedAt: 4, agents: [agent('a', 'blocked', { name: 'a' }), agent('b', 'blocked', { name: 'b' }), agent('c', 'blocked', { name: 'c' })] }) }))
    act(() => useDashStore.setState({ sessions: sessionsDoc([], { generatedAt: 4 }) }))
    expect(FakeNotification.sent).toHaveLength(1)
    act(() => useDashStore.setState({ overview: overview({ generatedAt: 5, agents: [agent('a', 'blocked', { name: 'a' }), agent('b', 'blocked', { name: 'b' }), agent('c', 'blocked', { name: 'c' }), agent('d', 'blocked', { name: 'd' })] }) }))
    expect(FakeNotification.sent.map((n) => n.title)).toEqual(['有人等你：b', '有人等你：d'])
  })

  it('通知偏好關閉時不發通知', () => {
    localStorage.setItem('dash.notify.blocked', 'off')
    useDashStore.setState({ overview: overview({ agents: [agent('a', 'idle')] }), sessions: sessionsDoc() })
    renderProbe()
    act(() => useDashStore.setState({ overview: overview({ generatedAt: 2, agents: [agent('a', 'blocked')] }) }))
    expect(FakeNotification.sent).toHaveLength(0)
    expect(document.title).toBe('(1) 需要你 · dkbo 儀表板')
  })
})
