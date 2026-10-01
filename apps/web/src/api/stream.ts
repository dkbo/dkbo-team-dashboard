import type { SseEvent, SseEventName } from '@dash/shared'

export interface StreamHandlers {
  onOpen(): void
  /** closed=true：瀏覽器放棄重連，由本模組以退避重開；false：瀏覽器自己重連中 */
  onError(closed: boolean): void
  onEvent(e: SseEvent): void
}

export interface StreamOptions {
  url?: string
  EventSourceImpl?: typeof EventSource
  baseDelayMs?: number
  maxDelayMs?: number
}

const EVENTS: SseEventName[] = ['overview.updated', 'pane.updated', 'task.updated', 'herdr.view']
const CLOSED = 2

/** 開 SSE 連線；回傳關閉函式。 */
export function openStream(h: StreamHandlers, opts: StreamOptions = {}): () => void {
  const { url = '/api/stream', EventSourceImpl = EventSource, baseDelayMs = 1000, maxDelayMs = 30_000 } = opts
  let es: EventSource | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let attempt = 0
  let stopped = false

  const connect = () => {
    timer = null
    const cur = new EventSourceImpl(url)
    es = cur
    cur.onopen = () => {
      attempt = 0
      h.onOpen()
    }
    cur.onerror = () => {
      const closed = cur.readyState === CLOSED
      h.onError(closed)
      if (!closed || stopped || timer) return
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt)
      attempt += 1
      timer = setTimeout(connect, delay)
    }
    for (const name of EVENTS) {
      cur.addEventListener(name, (ev) => {
        let data: unknown
        try {
          data = JSON.parse((ev as MessageEvent<string>).data)
        } catch {
          return // 壞掉的事件忽略；下一次 overview.updated 會補齊
        }
        h.onEvent({ event: name, data } as SseEvent)
      })
    }
  }

  connect()
  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
    es?.close()
  }
}
