import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openStream } from '@/api/stream'

class FakeES {
  static instances: FakeES[] = []
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 2
  readyState = 0
  closed = false
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  listeners = new Map<string, (ev: MessageEvent) => void>()
  constructor(public url: string) {
    FakeES.instances.push(this)
  }
  addEventListener(name: string, fn: (ev: MessageEvent) => void) {
    this.listeners.set(name, fn)
  }
  close() {
    this.closed = true
    this.readyState = 2
  }
  emit(name: string, data: unknown) {
    this.listeners.get(name)?.({ data: JSON.stringify(data) } as MessageEvent)
  }
}

const handlers = () => ({ onOpen: vi.fn(), onError: vi.fn(), onEvent: vi.fn() })

beforeEach(() => {
  FakeES.instances = []
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

describe('openStream', () => {
  it('把三種具名事件解析成 SseEvent，壞 JSON 忽略', () => {
    const h = handlers()
    openStream(h, { EventSourceImpl: FakeES as unknown as typeof EventSource })
    const es = FakeES.instances[0]
    expect(es.url).toBe('/api/stream')
    es.onopen?.()
    expect(h.onOpen).toHaveBeenCalledTimes(1)
    es.emit('pane.updated', { paneId: 'p' })
    es.emit('task.updated', { project: 'a', dir: 'd' })
    es.emit('overview.updated', { generatedAt: 1 })
    es.emit('herdr.view', { generatedAt: 1 })
    es.listeners.get('task.updated')?.({ data: '{bad' } as MessageEvent)
    expect(h.onEvent.mock.calls.map((c) => c[0].event)).toEqual(['pane.updated', 'task.updated', 'overview.updated', 'herdr.view'])
  })

  it('瀏覽器自己重連中（CONNECTING）不另開；CLOSED 時以指數退避重開，open 後退避歸零', () => {
    const h = handlers()
    openStream(h, { EventSourceImpl: FakeES as unknown as typeof EventSource, baseDelayMs: 1000, maxDelayMs: 4000 })
    const first = FakeES.instances[0]
    first.readyState = 0
    first.onerror?.()
    expect(h.onError).toHaveBeenLastCalledWith(false)
    vi.advanceTimersByTime(10_000)
    expect(FakeES.instances).toHaveLength(1)

    first.readyState = 2
    first.onerror?.()
    expect(h.onError).toHaveBeenLastCalledWith(true)
    vi.advanceTimersByTime(999)
    expect(FakeES.instances).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(FakeES.instances).toHaveLength(2)

    const second = FakeES.instances[1]
    second.readyState = 2
    second.onerror?.()
    vi.advanceTimersByTime(1999)
    expect(FakeES.instances).toHaveLength(2)
    vi.advanceTimersByTime(1)
    const third = FakeES.instances[2]
    third.onopen?.()
    third.readyState = 2
    third.onerror?.()
    vi.advanceTimersByTime(1000)
    expect(FakeES.instances).toHaveLength(4)
  })

  it('close() 關掉連線並取消排程中的重連', () => {
    const h = handlers()
    const close = openStream(h, { EventSourceImpl: FakeES as unknown as typeof EventSource, baseDelayMs: 1000 })
    const es = FakeES.instances[0]
    es.readyState = 2
    es.onerror?.()
    close()
    vi.advanceTimersByTime(60_000)
    expect(FakeES.instances).toHaveLength(1)
    expect(es.closed).toBe(true)
  })
})
