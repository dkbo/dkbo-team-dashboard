import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskDetailResponse } from '@dash/shared'
import { resetDashStore, useDashStore } from '@/store/store'
import { detail, overview, pane, project } from './builders'

type Route = (url: string) => { status: number; body: unknown }

function stubFetch(route: Route) {
  const fn = vi.fn(async (url: string) => {
    const { status, body } = route(url)
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

const detailResp = (dir: string, over: Partial<TaskDetailResponse> = {}): TaskDetailResponse => ({
  project: 'teamflow',
  detail: {
    schema_version: 1,
    dkbo_version: '0.17.0',
    generated_at: '2026-09-25T10:00',
    kinds_down: [],
    task: detail({ dir }),
  },
  panes: [pane({ paneId: 'p9', status: 'idle' })],
  dispatch: [],
  ...over,
})

beforeEach(() => resetDashStore())
afterEach(() => vi.unstubAllGlobals())

describe('overview', () => {
  it('fetchOverview 取得資料；較舊的 generatedAt 不覆蓋較新的', async () => {
    stubFetch(() => ({ status: 200, body: overview({ generatedAt: 5 }) }))
    await useDashStore.getState().fetchOverview()
    expect(useDashStore.getState().overview?.generatedAt).toBe(5)
    useDashStore.getState().handleEvent({ event: 'overview.updated', data: overview({ generatedAt: 9 }) })
    expect(useDashStore.getState().overview?.generatedAt).toBe(9)
    await useDashStore.getState().fetchOverview()
    expect(useDashStore.getState().overview?.generatedAt).toBe(9)
  })

  it('抓失敗記錯誤、保留舊資料', async () => {
    useDashStore.getState().handleEvent({ event: 'overview.updated', data: overview({ generatedAt: 3 }) })
    stubFetch(() => ({ status: 500, body: { error: 'boom' } }))
    await useDashStore.getState().fetchOverview()
    const s = useDashStore.getState()
    expect(s.overviewError).toMatch(/500/)
    expect(s.overview?.generatedAt).toBe(3)
    expect(s.overviewLoading).toBe(false)
  })
})

describe('pane.updated', () => {
  it('即時補進 overview、detail 快取與 usePane 用的 livePanes', async () => {
    const doc = overview({
      projects: [project({ panes: [pane({ paneId: 'p1', status: 'idle', taskDir: 'd', member: 'm' })] })],
    })
    useDashStore.getState().handleEvent({ event: 'overview.updated', data: doc })
    stubFetch(() => ({ status: 200, body: detailResp('d', { panes: [pane({ paneId: 'p1', status: 'idle' })] }) }))
    await useDashStore.getState().fetchDetail('teamflow', 'd')

    useDashStore.getState().handleEvent({ event: 'pane.updated', data: pane({ paneId: 'p1', status: 'working' }) })
    const s = useDashStore.getState()
    expect(s.overview?.projects[0].panes[0]).toMatchObject({ status: 'working', member: 'm' })
    expect(s.details['teamflow/d'].data?.panes[0].status).toBe('working')
    expect(s.livePanes.p1.status).toBe('working')
  })

  it('新 overview 以其內容重建 livePanes', () => {
    useDashStore.getState().handleEvent({ event: 'pane.updated', data: pane({ paneId: 'old', status: 'working' }) })
    useDashStore.getState().handleEvent({
      event: 'overview.updated',
      data: overview({ generatedAt: 2, projects: [project({ otherPanes: [pane({ paneId: 'o1', status: 'done' })] })] }),
    })
    const s = useDashStore.getState()
    expect(s.livePanes.o1.status).toBe('done')
    expect(s.livePanes.old).toBeUndefined()
  })
})

describe('task detail', () => {
  it('404 → notFound；其他錯誤 → error', async () => {
    stubFetch((url) => (url.includes('/nope') ? { status: 404, body: {} } : { status: 502, body: {} }))
    await useDashStore.getState().fetchDetail('teamflow', 'nope')
    expect(useDashStore.getState().details['teamflow/nope']).toMatchObject({ notFound: true, data: null })
    await useDashStore.getState().fetchDetail('teamflow', 'bad')
    expect(useDashStore.getState().details['teamflow/bad'].error).toMatch(/502/)
  })

  it('路徑參數做 URL 編碼', async () => {
    const f = stubFetch(() => ({ status: 200, body: detailResp('a b') }))
    await useDashStore.getState().fetchDetail('my proj', 'a b')
    expect(f).toHaveBeenCalledWith('/api/projects/my%20proj/tasks/a%20b', expect.anything())
  })

  it('task.updated 只重抓已快取的任務，重抓期間保留舊 data', async () => {
    const f = stubFetch(() => ({ status: 200, body: detailResp('d') }))
    await useDashStore.getState().fetchDetail('teamflow', 'd')
    f.mockClear()
    useDashStore.getState().handleEvent({ event: 'task.updated', data: { project: 'teamflow', dir: 'other' } })
    expect(f).not.toHaveBeenCalled()
    useDashStore.getState().handleEvent({ event: 'task.updated', data: { project: 'teamflow', dir: 'd' } })
    expect(f).toHaveBeenCalledTimes(1)
    expect(useDashStore.getState().details['teamflow/d']).toMatchObject({ loading: true })
    expect(useDashStore.getState().details['teamflow/d'].data).not.toBeNull()
  })
})

describe('history', () => {
  it('fetchHistory 取 tasks；task.updated 時已載入就重抓', async () => {
    const f = stubFetch(() => ({ status: 200, body: { tasks: [{ project: 'a', dir: 'd' }] } }))
    useDashStore.getState().handleEvent({ event: 'task.updated', data: { project: 'a', dir: 'd' } })
    expect(f).not.toHaveBeenCalled()
    await useDashStore.getState().fetchHistory()
    expect(useDashStore.getState().history.data).toHaveLength(1)
    f.mockClear()
    useDashStore.getState().handleEvent({ event: 'task.updated', data: { project: 'a', dir: 'd' } })
    expect(f).toHaveBeenCalledWith('/api/history', expect.anything())
  })
})

describe('costsAll', () => {
  const costsBody = (cost: number) => ({
    range: 'all', generatedAt: 1, from: 0, to: 1, skipped: 0,
    tasks: [{ project: 'teamflow', taskDir: 'd', cost, members: {}, unmatched: 0 }],
    byRole: {}, unknownRole: 0, unattributed: 0,
  })

  it('fetchCostsAll 抓 range=all；失敗記錯誤、保留舊資料；SSE 重連時已載入就重抓', async () => {
    let cost = 1
    let fail = false
    const fn = stubFetch(() => (fail ? { status: 500, body: {} } : { status: 200, body: costsBody(cost) }))
    await useDashStore.getState().fetchCostsAll()
    expect(fn).toHaveBeenLastCalledWith('/api/costs?range=all', expect.anything())
    expect(useDashStore.getState().costsAll.data?.tasks[0].cost).toBe(1)
    expect(useDashStore.getState().costsAll.fetchedAt).not.toBeNull()
    fail = true
    await useDashStore.getState().fetchCostsAll()
    expect(useDashStore.getState().costsAll.error).toMatch(/500/)
    expect(useDashStore.getState().costsAll.data?.tasks[0].cost).toBe(1)
    fail = false
    cost = 2
    useDashStore.getState().handleStreamOpen()
    await vi.waitFor(() => expect(useDashStore.getState().costsAll.data?.tasks[0].cost).toBe(2))
  })
})

describe('SSE 連線狀態', () => {
  it('open 時先重抓 overview 與已快取的 detail；error 時轉 connecting／closed', async () => {
    const f = stubFetch((url) => (url === '/api/overview' ? { status: 200, body: overview() } : { status: 200, body: detailResp('d') }))
    await useDashStore.getState().fetchDetail('teamflow', 'd')
    f.mockClear()
    useDashStore.getState().handleStreamOpen()
    expect(useDashStore.getState().sse).toBe('open')
    const urls = f.mock.calls.map((c) => c[0])
    expect(urls[0]).toBe('/api/overview')
    expect(urls).toContain('/api/projects/teamflow/tasks/d')
    useDashStore.getState().handleStreamError(false)
    expect(useDashStore.getState().sse).toBe('connecting')
    useDashStore.getState().handleStreamError(true)
    expect(useDashStore.getState().sse).toBe('closed')
  })
})
