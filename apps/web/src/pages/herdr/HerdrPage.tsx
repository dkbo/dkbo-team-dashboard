import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import type { HerdrSearchHit } from '@dash/shared'
import { Skeleton } from '@/components/ui/skeleton'
import { HerdrMirror } from '@/features/herdr/HerdrMirror'
import { cycle, cyclePane, findPane, neighborPane, resolveSelection, type Direction, type HerdrSelection } from '@/features/herdr/model'
import { historyLines, useHerdrScreens, useHerdrView } from '@/features/herdr/useHerdr'

const KEY_DIR: Record<string, Direction> = { h: 'left', ArrowLeft: 'left', l: 'right', ArrowRight: 'right', k: 'up', j: 'down' }

/** herdr 唯讀鏡像：選擇只存在網址（?w&t&p&z），不會 focus 真的 herdr */
export default function HerdrPage() {
  const { view, error } = useHerdrView()
  const [params, setParams] = useSearchParams()
  const lastTab = useRef<Record<string, string>>({})
  const sel = resolveSelection(view, { workspaceId: params.get('w'), tabId: params.get('t'), paneId: params.get('p') }, lastTab.current)
  const zoomed = params.get('z') === '1'
  if (sel.workspace && sel.tab) lastTab.current[sel.workspace.id] = sel.tab.id

  const select = useCallback(
    (next: HerdrSelection & { zoomed?: boolean }) =>
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev)
          const set = (k: string, v: string | null | undefined) => (v ? p.set(k, v) : p.delete(k))
          if ('workspaceId' in next) set('w', next.workspaceId)
          if ('tabId' in next) set('t', next.tabId)
          if ('paneId' in next) set('p', next.paneId)
          if ('zoomed' in next) set('z', next.zoomed ? '1' : null)
          return p
        },
        { replace: true },
      ),
    [setParams],
  )

  const onWorkspace = (id: string) => select({ workspaceId: id, tabId: null, paneId: null })
  const onTab = (id: string) => select({ tabId: id, paneId: null })
  const onPane = (id: string) => select({ paneId: id })
  const onJump = (paneId: string) => {
    const at = findPane(view, paneId)
    if (at) select({ workspaceId: at.workspace.id, tabId: at.tab.id, paneId })
  }

  // 歷史模式：一次只開一個 pane（讀捲動歷史比較重），只對有歷史的 pane 有效
  const [historyId, setHistoryId] = useState<string | null>(null)
  const shownPanes = sel.tab ? (zoomed && sel.pane ? [sel.pane] : sel.tab.panes) : []
  const historyPane = shownPanes.find((p) => p.paneId === historyId && p.scrollback > 0) ?? null
  const screens = useHerdrScreens(
    shownPanes.map((p) => (p === historyPane ? { paneId: p.paneId, recentLines: historyLines(p, sel.tab!) } : { paneId: p.paneId })),
    historyPane ? 3000 : 1000,
  )
  const toggleHistory = (id: string) => setHistoryId((cur) => (cur === id ? null : id))

  // 搜尋：結果點下去跳到 pane（命中在歷史裡就開歷史模式）並捲到那一行
  const [searchOpen, setSearchOpen] = useState(false)
  const [highlight, setHighlight] = useState('')
  const [focusLine, setFocusLine] = useState<{ paneId: string; line: number } | null>(null)
  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setHighlight('')
    setFocusLine(null)
  }, [])
  const onPick = (hit: HerdrSearchHit) => {
    onJump(hit.paneId)
    setHistoryId(hit.history ? hit.paneId : null)
    setFocusLine({ paneId: hit.paneId, line: hit.line })
  }

  // herdr 導覽鍵（不需 prefix）；只切網頁自己的畫面
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {})
  keyRef.current = (e: KeyboardEvent) => {
    if (!view || e.ctrlKey || e.metaKey || e.altKey) return
    const t = e.target as HTMLElement | null
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
    const { workspace, tab, pane } = sel
    let handled = true
    if (e.key === '/') {
      setSearchOpen(true)
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const w = cycle(view.workspaces, workspace?.id, e.key === 'ArrowUp' ? -1 : 1)
      if (w) onWorkspace(w.id)
    } else if ((e.key === 'n' || e.key === 'p') && workspace) {
      const next = cycle(workspace.tabs, tab?.id, e.key === 'p' ? -1 : 1)
      if (next) onTab(next.id)
    } else if (/^[1-9]$/.test(e.key) && workspace) {
      const next = workspace.tabs[Number(e.key) - 1]
      if (next) onTab(next.id)
    } else if (e.key in KEY_DIR && tab && pane) {
      const id = neighborPane(tab, pane.paneId, KEY_DIR[e.key])
      if (id) onPane(id)
    } else if (e.key === 'Tab' && tab) {
      const id = cyclePane(tab, pane?.paneId ?? null, e.shiftKey ? -1 : 1)
      if (id) onPane(id)
    } else if (e.key === 'e' && pane && pane.scrollback > 0) {
      toggleHistory(pane.paneId)
    } else if (e.key === 'z') {
      select({ zoomed: !zoomed })
    } else if (e.key === 'Escape' && searchOpen) {
      closeSearch()
    } else if (e.key === 'Escape' && historyPane) {
      setHistoryId(null)
    } else if (e.key === 'Escape' && zoomed) {
      select({ zoomed: false })
    } else handled = false
    if (handled) e.preventDefault()
  }
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  return (
    <div className="flex h-[calc(100svh-3.1rem)] flex-col">
      {error && (
        <div role="alert" className="border-b border-red-500/40 bg-red-500/10 px-3 py-1.5 text-sm text-red-700 dark:text-red-400">
          {view ? '更新失敗，顯示的是舊資料：' : '無法讀取 herdr：'}
          {error}
        </div>
      )}
      {view ? (
        view.workspaces.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">herdr 目前沒有任何 space</div>
        ) : (
          <HerdrMirror
            view={view}
            sel={sel}
            zoomed={zoomed}
            screens={screens}
            historyId={historyPane?.paneId ?? null}
            onHistory={toggleHistory}
            search={searchOpen ? { highlight, focusLine, onPick, onQuery: setHighlight, onClose: closeSearch } : null}
            onSearch={() => setSearchOpen(true)}
            onWorkspace={onWorkspace}
            onTab={onTab}
            onPane={onPane}
            onJump={onJump}
            onZoom={(z) => select({ zoomed: z })}
          />
        )
      ) : (
        !error && (
          <div data-testid="herdr-loading" className="flex flex-1 gap-4 p-4">
            <Skeleton className="w-56" />
            <Skeleton className="flex-1" />
          </div>
        )
      )}
    </div>
  )
}
