import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { Eye, History, ListTree, Maximize2, Minimize2, Search } from 'lucide-react'
import type { HerdrSearchHit, HerdrView, HerdrViewPane, HerdrViewTab, PaneStatus } from '@dash/shared'
import { StatusPill } from '@/components/app/StatusPill'
import { formatPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useDashStore } from '@/store'
import { agentPanes, type Resolved } from './model'
import { AnsiLine } from './AnsiText'
import { SearchPanel } from './SearchPanel'
import type { ScreenState } from './useHerdr'

const DOT: Record<PaneStatus, string> = {
  working: 'bg-emerald-500 animate-pulse',
  idle: 'bg-zinc-400',
  blocked: 'bg-red-500',
  done: 'bg-emerald-500',
  unknown: 'bg-zinc-600',
}

function Dot({ status }: { status: PaneStatus }) {
  return <span aria-hidden className={cn('inline-block size-2 shrink-0 rounded-full', DOT[status])} />
}

export interface TaskLink {
  href: string
  label: string
}

/** 從 overview 找每個 pane 屬於哪個任務／成員（herdr 本身不知道） */
function useTaskLinks(): Map<string, TaskLink> {
  const overview = useDashStore((s) => s.overview)
  const out = new Map<string, TaskLink>()
  for (const a of overview?.agents ?? []) {
    if (!a.project || !a.taskDir) continue
    const task = overview?.projects.find((p) => p.name === a.project)?.active[a.taskDir]
    const name = task?.display ?? a.taskDir
    out.set(a.paneId, {
      href: `/p/${encodeURIComponent(a.project)}/t/${encodeURIComponent(a.taskDir)}`,
      label: a.member ? `${name} · ${a.member}` : name,
    })
  }
  return out
}

export interface FocusLine {
  paneId: string
  line: number
}

export interface SearchState {
  highlight: string
  focusLine: FocusLine | null
  onPick(hit: HerdrSearchHit): void
  onQuery(q: string): void
  onClose(): void
}

export interface HerdrMirrorProps {
  view: HerdrView
  sel: Resolved
  zoomed: boolean
  screens: Record<string, ScreenState>
  historyId: string | null
  onHistory(id: string): void
  /** null：搜尋面板關著 */
  search: SearchState | null
  onSearch(): void
  onWorkspace(id: string): void
  onTab(id: string): void
  onPane(id: string): void
  onJump(paneId: string): void
  onZoom(z: boolean): void
}

export function HerdrMirror({ view, sel, zoomed, screens, historyId, onHistory, search, onSearch, onWorkspace, onTab, onPane, onJump, onZoom }: HerdrMirrorProps) {
  const agents = agentPanes(view)
  const links = useTaskLinks()
  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-muted/30 text-sm">
        <div className="px-3 pt-3 pb-1 text-xs font-medium text-muted-foreground">spaces</div>
        <ul data-testid="herdr-spaces" className="flex flex-col gap-0.5 px-1.5">
          {view.workspaces.map((w) => (
            <li key={w.id}>
              <button
                type="button"
                data-active={w.id === sel.workspace?.id || undefined}
                onClick={() => onWorkspace(w.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left',
                  w.id === sel.workspace?.id ? 'bg-primary/10 font-medium' : 'hover:bg-muted',
                )}
              >
                <span className="w-4 text-right text-xs text-muted-foreground tabular-nums">{w.number}</span>
                <span className="min-w-0 flex-1 truncate">{w.label || w.id}</span>
                {w.id === view.focused.workspaceId && <Eye aria-label="herdr 目前所在" className="size-3 text-muted-foreground" />}
                <Dot status={w.status} />
              </button>
            </li>
          ))}
        </ul>
        <div className="px-3 pt-4 pb-1 text-xs font-medium text-muted-foreground">agents</div>
        <ul data-testid="herdr-agents" className="flex min-h-0 flex-col gap-0.5 overflow-y-auto px-1.5 pb-3">
          {agents.length === 0 && <li className="px-2 text-xs text-muted-foreground">沒有 agent</li>}
          {agents.map(({ workspace, pane }) => (
            <li key={pane.paneId}>
              <button
                type="button"
                onClick={() => onJump(pane.paneId)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left',
                  pane.paneId === sel.pane?.paneId ? 'bg-primary/10' : 'hover:bg-muted',
                  pane.status === 'blocked' && 'bg-red-500/10 text-red-700 ring-1 ring-red-500/40 dark:text-red-300',
                )}
              >
                <Dot status={pane.status} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{pane.name ?? pane.agent}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {workspace.label} · {pane.status}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-auto border-t px-3 py-2 text-[0.7rem] leading-relaxed text-muted-foreground">
          唯讀鏡像：不會送任何按鍵或命令給 herdr。
          <br />
          ↑↓ space · n/p/1-9 tab · h/j/k/l pane · Tab 循環 · z 放大 · e 歷史 · / 搜尋
        </div>
      </aside>

      <section className="relative flex min-w-0 flex-1 flex-col">
        {search && <SearchPanel view={view} onClose={search.onClose} onPick={search.onPick} onQuery={search.onQuery} />}
        <div data-testid="herdr-tabs" className="flex items-center gap-1 border-b px-2 py-1.5">
          {sel.workspace?.tabs.map((t, i) => (
            <button
              key={t.id}
              type="button"
              data-active={t.id === sel.tab?.id || undefined}
              onClick={() => onTab(t.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-sm',
                t.id === sel.tab?.id ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <span className={cn('tabular-nums', t.label && t.label !== String(i + 1) && 'text-xs opacity-60')}>{i + 1}</span>
              {t.label !== String(i + 1) && t.label}
              <Dot status={t.status} />
            </button>
          ))}
          <span className="flex-1" />
          <button
            type="button"
            onClick={onSearch}
            data-testid="herdr-search-open"
            className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Search className="size-3.5" />
            搜尋
          </button>
          {sel.pane && (
            <button
              type="button"
              onClick={() => onZoom(!zoomed)}
              aria-pressed={zoomed}
              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {zoomed ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
              {zoomed ? '還原' : '放大'}
            </button>
          )}
        </div>
        {sel.tab ? (
          <TabLayout
            tab={sel.tab}
            selectedId={sel.pane?.paneId ?? null}
            zoomed={zoomed}
            screens={screens}
            links={links}
            historyId={historyId}
            onHistory={onHistory}
            highlight={search?.highlight ?? ''}
            focusLine={search?.focusLine ?? null}
            onPane={onPane}
          />
        ) : (
          <div className="p-8 text-center text-sm text-muted-foreground">這個 space 沒有 tab</div>
        )}
      </section>
    </div>
  )
}

/** 照 herdr 的 split 版面排 pane；字級依容器寬度縮放，讓一行放得下 tab 的欄數 */
function TabLayout({
  tab,
  selectedId,
  zoomed,
  screens,
  links,
  historyId,
  onHistory,
  highlight,
  focusLine,
  onPane,
}: {
  tab: HerdrViewTab
  selectedId: string | null
  zoomed: boolean
  screens: Record<string, ScreenState>
  links: Map<string, TaskLink>
  historyId: string | null
  onHistory(id: string): void
  highlight: string
  focusLine: FocusLine | null
  onPane(id: string): void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const cols = Math.max(tab.area.width, 1)
  const rows = Math.max(tab.area.height, 1)
  // 等寬字寬約 0.6em、行高 1.2em；取寬高都放得下的字級
  const font = size.w && size.h ? Math.max(5, Math.min(14, size.w / (cols * 0.6), size.h / (rows * 1.2 + 2))) : 11
  const shown = zoomed ? tab.panes.filter((p) => p.paneId === selectedId) : tab.panes

  return (
    <div ref={ref} data-testid="herdr-layout" className="relative min-h-0 flex-1 bg-zinc-950" style={{ fontSize: font }}>
      {shown.map((p) => {
        const style: CSSProperties = zoomed
          ? { inset: 0 }
          : {
              left: `${(p.rect.x / cols) * 100}%`,
              top: `${(p.rect.y / rows) * 100}%`,
              width: `${(p.rect.width / cols) * 100}%`,
              height: `${(p.rect.height / rows) * 100}%`,
            }
        return (
          <PaneBox
            key={p.paneId}
            pane={p}
            style={style}
            selected={p.paneId === selectedId}
            screen={screens[p.paneId]}
            link={links.get(p.paneId)}
            history={p.paneId === historyId}
            onHistory={onHistory}
            highlight={highlight}
            focusLine={focusLine?.paneId === p.paneId ? focusLine.line : null}
            onSelect={onPane}
          />
        )
      })}
      {tab.panes.length === 0 && <div className="p-8 text-center text-sm text-zinc-500">這個 tab 沒有 pane</div>}
    </div>
  )
}

function PaneBox({
  pane,
  style,
  selected,
  screen,
  link,
  history,
  onHistory,
  highlight,
  focusLine,
  onSelect,
}: {
  pane: HerdrViewPane
  style: CSSProperties
  selected: boolean
  screen: ScreenState | undefined
  link: TaskLink | undefined
  history: boolean
  onHistory(id: string): void
  highlight: string
  focusLine: number | null
  onSelect(id: string): void
}) {
  return (
    <div
      data-testid={`herdr-pane-${pane.paneId}`}
      data-selected={selected || undefined}
      onMouseDown={() => onSelect(pane.paneId)}
      className={cn('absolute flex flex-col overflow-hidden border', selected ? 'z-10 border-emerald-500' : 'border-zinc-800')}
      style={style}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-2 py-0.5 font-sans text-xs text-zinc-300">
        <StatusPill status={pane.status} className="h-5 px-2 text-[0.7rem]" />
        <span className="truncate font-medium">{pane.name ?? pane.agent ?? pane.paneId}</span>
        {link && (
          <Link
            to={link.href}
            data-testid="pane-task-link"
            onMouseDown={(e) => e.stopPropagation()}
            className="inline-flex min-w-0 shrink-0 items-center gap-1 rounded bg-zinc-800 px-1.5 text-sky-300 hover:bg-zinc-700"
          >
            <ListTree aria-hidden className="size-3" />
            <span className="truncate">{link.label}</span>
          </Link>
        )}
        {pane.title && <span className="min-w-0 truncate text-zinc-500">{pane.title}</span>}
        <span className="flex-1" />
        {pane.model && <span className="shrink-0 text-zinc-500">{pane.model}</span>}
        {pane.ctxPct != null && <span className="shrink-0 text-zinc-500 tabular-nums">ctx {formatPct(pane.ctxPct)}</span>}
        {pane.cost != null && <span className="shrink-0 text-zinc-500 tabular-nums">${pane.cost.toFixed(2)}</span>}
        {pane.scrollback > 0 && (
          <button
            type="button"
            data-testid="pane-history-toggle"
            aria-pressed={history}
            title={history ? '回到即時畫面（Esc）' : `看捲動歷史（${pane.scrollback} 行，e）`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => onHistory(pane.paneId)}
            className={cn('inline-flex shrink-0 items-center gap-1 rounded px-1.5', history ? 'bg-sky-900 text-sky-200' : 'text-zinc-400 hover:bg-zinc-800')}
          >
            <History aria-hidden className="size-3" />
            歷史
          </button>
        )}
      </div>
      <Screen screen={screen} history={history} highlight={highlight} focusLine={focusLine} />
    </div>
  )
}

function Screen({
  screen,
  history,
  highlight,
  focusLine,
}: {
  screen: ScreenState | undefined
  history: boolean
  highlight: string
  focusLine: number | null
}) {
  const ref = useRef<HTMLPreElement>(null)
  const stick = useRef(true)
  // 歷史模式：剛打開時捲到底；之後使用者在底部才跟著新輸出往下
  useLayoutEffect(() => {
    stick.current = true
  }, [history])
  useLayoutEffect(() => {
    const el = ref.current
    if (el && history && stick.current && focusLine == null) el.scrollTop = el.scrollHeight
  }, [screen, history, focusLine])
  // 搜尋跳過來：捲到那一行（之後不再自動黏底）
  const hasLines = !!screen && screen.lines.length > (focusLine ?? 0)
  useLayoutEffect(() => {
    if (focusLine == null || !hasLines) return
    stick.current = false
    ref.current?.children[focusLine]?.scrollIntoView?.({ block: 'center' })
  }, [focusLine, hasLines])
  if (!screen) return <div className="p-2 font-sans text-xs text-zinc-500">讀取畫面中…</div>
  return (
    <div className="relative min-h-0 flex-1">
      <pre
        ref={ref}
        data-testid="herdr-screen"
        data-history={history || undefined}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 4
        }}
        className="h-full overflow-auto px-1 font-mono leading-[1.2] whitespace-pre text-zinc-200 select-text">
        {screen.lines.map((l, i) => (
          <AnsiLine key={i} segs={l} highlight={highlight} focused={i === focusLine} />
        ))}
      </pre>
      {screen.error && (
        <div className="absolute right-1 bottom-1 rounded bg-red-950/80 px-1.5 py-0.5 font-sans text-[0.7rem] text-red-300">畫面更新失敗</div>
      )}
    </div>
  )
}
