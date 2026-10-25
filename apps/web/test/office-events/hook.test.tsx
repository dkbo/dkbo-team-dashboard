import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { OverviewDoc, TaskDetail } from '@dash/shared'
import { useOfficeEvents } from '@/features/office/events/useOfficeEvents'
import { QUEUE_WINDOW_MS } from '@/features/office/events/engine'
import { resetDashStore, useDashStore } from '@/store/store'
import { officeSession, overview, project, sessionsDoc } from '../shell/builders'
import { detail, listDoc, msg, NOW, summary, ts, wave } from './fixtures'

const DIR = '2026-10-25-demo'
let gen = 5_000
function doc(d: TaskDetail): OverviewDoc {
  gen += 1
  return overview({ generatedAt: gen, projects: [project({ list: listDoc([summary(d)]), active: { [DIR]: d } })] })
}
const leader = officeSession({ id: 'p-ld', paneId: 'p-ld', project: 'teamflow', taskDir: DIR, member: null, leader: true, role: 'leader' })

const base = () => doc(detail({ waves: [wave(1)] }))
const spawned = () => doc(detail({ waves: [wave(1, { review_spawned_at: ts(NOW) })] }))
const escalated = () =>
  doc(detail({ waves: [wave(1, { review_spawned_at: ts(NOW) })], messages: [msg('demo-backend', 'leader-demo', 'ESCALATE', 'x', NOW)] }))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  vi.setSystemTime(NOW)
  resetDashStore()
  useDashStore.setState({ sse: 'open', sessions: sessionsDoc([leader]) })
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useOfficeEvents', () => {
  it('掛載時手上的資料當基準；之後 SSE 推來的變化成為事件並寫 announce', () => {
    useDashStore.setState({ overview: base() })
    const { result } = renderHook(() => useOfficeEvents())
    expect(result.current).toEqual({ events: [], announce: null })
    act(() => useDashStore.setState({ overview: spawned() }))
    expect(result.current.events.map((e) => e.kind)).toEqual(['review-spawned'])
    expect(result.current.announce).toBe('teamflow 示範任務：波 1 審查開始')
  })

  it('重連：斷線前那份在 sse=open 時再看一次不算新資料，重連後第一份當基準不播', () => {
    useDashStore.setState({ overview: base() })
    const { result } = renderHook(() => useOfficeEvents())
    act(() => useDashStore.setState({ sse: 'connecting' }))
    act(() => useDashStore.setState({ sse: 'open' }))
    act(() => useDashStore.setState({ overview: spawned() }))
    expect(result.current.events).toEqual([])
    act(() => useDashStore.setState({ overview: escalated() }))
    expect(result.current.events.map((e) => e.kind)).toEqual(['escalate'])
  })

  it('事件 30 秒後移出清單（避免場景重掛時補播），announce 保留最後一句', () => {
    useDashStore.setState({ overview: base() })
    const { result } = renderHook(() => useOfficeEvents())
    act(() => useDashStore.setState({ overview: spawned() }))
    expect(result.current.events).toHaveLength(1)
    act(() => {
      vi.advanceTimersByTime(QUEUE_WINDOW_MS + 1)
    })
    expect(result.current.events).toEqual([])
    expect(result.current.announce).toBe('teamflow 示範任務：波 1 審查開始')
  })

  it('同一角色 30 秒內第 4 個事件進來時只留最後一個', () => {
    let d = detail({ waves: [wave(1)] })
    useDashStore.setState({ overview: doc(d) })
    const { result } = renderHook(() => useOfficeEvents())
    const msgs = []
    for (let i = 0; i < 4; i++) {
      // 每輪多一則不同人送的未解 ESCALATE → leader 的佇列一直長
      msgs.push(msg(`demo-m${i}`, 'leader-demo', 'ESCALATE', 'x', NOW))
      d = detail({ waves: [wave(1)], messages: [...msgs] })
      act(() => {
        vi.advanceTimersByTime(1_000)
        useDashStore.setState({ overview: doc(d) })
      })
    }
    expect(result.current.events.map((e) => e.id)).toHaveLength(1)
    expect(result.current.events[0].id).toContain('demo-m3')
  })

  it('分頁隱藏期間不出事件；切回後手上那份當基準', () => {
    useDashStore.setState({ overview: base() })
    const { result } = renderHook(() => useOfficeEvents())
    const vis = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
      useDashStore.setState({ overview: spawned() })
    })
    expect(result.current.events).toEqual([])
    vis.mockReturnValue('visible')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(result.current.events).toEqual([])
    act(() => useDashStore.setState({ overview: escalated() }))
    expect(result.current.events.map((e) => e.kind)).toEqual(['escalate'])
    vis.mockRestore()
  })
})

describe('useOfficeEvents：審查開始後 20–45 秒才來 verdict（qa 疑慮 1）', () => {
  it.each([20, 29, 31, 45])('審查開始後 %i 秒 verdict 到：氣泡事件與 announce 照常更新', (sec) => {
    const w2 = (over = {}) => wave(1, { review_spawned_at: ts(NOW), ...over })
    useDashStore.setState({ overview: doc(detail({ waves: [wave(1)] })) })
    const { result } = renderHook(() => useOfficeEvents())
    act(() => useDashStore.setState({ overview: doc(detail({ waves: [w2()] })) }))
    expect(result.current.announce).toBe('teamflow 示範任務：波 1 審查開始')
    act(() => {
      vi.advanceTimersByTime(sec * 1000)
    })
    act(() => useDashStore.setState({ overview: doc(detail({ waves: [w2({ review_verdict_at: ts(NOW), review_verdict: 'a: important 2' })] })) }))
    // 30 秒內 spawned 還在清單上，之後已移出；review-fix 一定在最後
    expect(result.current.events.map((e) => e.kind)).toEqual(sec < 30 ? ['review-spawned', 'review-fix'] : ['review-fix'])
    expect(result.current.announce).toBe('teamflow 示範任務：波 1 審查要修 2 條')
  })
})
