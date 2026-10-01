import { useEffect, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import type { HerdrSearchHit, HerdrSearchResponse, HerdrView } from '@dash/shared'
import { api, errorText } from '@/api/client'
import { cn } from '@/lib/utils'
import { findPane } from './model'

/** 把 text 裡的 q（不分大小寫）切出來標黃 */
export function splitMatches(text: string, q: string): { text: string; hit: boolean }[] {
  if (!q) return [{ text, hit: false }]
  const lower = text.toLowerCase()
  const needle = q.toLowerCase()
  const out: { text: string; hit: boolean }[] = []
  let at = 0
  for (let i = lower.indexOf(needle); i >= 0; i = lower.indexOf(needle, i + needle.length)) {
    if (i > at) out.push({ text: text.slice(at, i), hit: false })
    out.push({ text: text.slice(i, i + needle.length), hit: true })
    at = i + needle.length
  }
  if (at < text.length || out.length === 0) out.push({ text: text.slice(at), hit: false })
  return out
}

export function Highlighted({ text, q }: { text: string; q: string }) {
  return (
    <>
      {splitMatches(text, q).map((p, i) =>
        p.hit ? (
          <mark key={i} className="rounded-sm bg-yellow-300 text-black">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  )
}

export interface SearchPanelProps {
  view: HerdrView
  onClose(): void
  onPick(hit: HerdrSearchHit): void
  /** 查詢字串變了（給畫面標黃用） */
  onQuery(q: string): void
}

/** herdr 頁的搜尋：打字 300ms 後查全部 pane；↑↓ 選、Enter 跳、Esc 關 */
export function SearchPanel({ view, onClose, onPick, onQuery }: SearchPanelProps) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<HerdrSearchResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)

  useEffect(() => input.current?.focus(), [])

  useEffect(() => {
    onQuery(q.trim())
    const needle = q.trim()
    if (!needle) {
      setRes(null)
      setError(null)
      return
    }
    let alive = true
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const r = await api.herdrSearch(needle)
        if (!alive) return
        setRes(r)
        setError(null)
        setActive(0)
      } catch (e) {
        if (alive) setError(errorText(e))
      } finally {
        if (alive) setLoading(false)
      }
    }, 300)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [q, onQuery])

  useEffect(() => {
    list.current?.querySelector('[data-active]')?.scrollIntoView?.({ block: 'nearest' })
  }, [active])

  const hits = res?.hits ?? []
  const label = (h: HerdrSearchHit) => {
    const at = findPane(view, h.paneId)
    const pane = at?.tab.panes.find((p) => p.paneId === h.paneId)
    return `${at?.workspace.label ?? h.workspaceId} › ${pane?.name ?? pane?.agent ?? h.paneId}`
  }

  return (
    <div
      data-testid="herdr-search"
      className="absolute top-2 right-2 z-30 flex max-h-[70%] w-[32rem] max-w-[calc(100%-1rem)] flex-col overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
    >
      <div className="flex items-center gap-2 border-b px-2 py-1.5">
        <Search aria-hidden className="size-4 text-muted-foreground" />
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={200}
          placeholder="搜尋所有 pane 的畫面…"
          aria-label="搜尋 herdr 畫面"
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
            else if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, hits.length - 1))
            else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0))
            else if (e.key === 'Enter' && hits[active]) onPick(hits[active])
            else return
            e.preventDefault()
          }}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
        {res && (
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {hits.length}
            {res.truncated && '+'} 筆
          </span>
        )}
        <button type="button" onClick={onClose} aria-label="關閉搜尋" className="rounded p-0.5 text-muted-foreground hover:bg-muted">
          <X className="size-4" />
        </button>
      </div>
      {error && <div className="px-3 py-2 text-xs text-red-600 dark:text-red-400">搜尋失敗：{error}</div>}
      {res && res.failed.length > 0 && <div className="px-3 py-1 text-xs text-muted-foreground">{res.failed.length} 個 pane 讀不到畫面</div>}
      {res && hits.length === 0 && !loading && <div className="px-3 py-2 text-sm text-muted-foreground">沒有符合的內容</div>}
      <ul ref={list} data-testid="herdr-search-hits" className="min-h-0 overflow-y-auto">
        {hits.map((h, i) => (
          <li key={`${h.paneId}:${h.line}`}>
            <button
              type="button"
              data-active={i === active || undefined}
              onMouseEnter={() => setActive(i)}
              onClick={() => onPick(h)}
              className={cn('flex w-full flex-col gap-0.5 px-3 py-1 text-left', i === active && 'bg-muted')}
            >
              <span className="text-xs text-muted-foreground">
                {label(h)} · 第 {h.line + 1} 行{h.history && ' · 歷史'}
              </span>
              <span className="truncate font-mono text-xs whitespace-pre">
                <Highlighted text={h.text.trim()} q={q.trim()} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
