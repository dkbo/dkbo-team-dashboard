import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { Eye, History, ListTree, Maximize2, Minimize2, Search } from 'lucide-react'
import type { HerdrSearchHit, HerdrView, HerdrViewPane, HerdrViewTab, PaneStatus } from '@dash/shared'
import { PaneBody, PaneHeader } from '@/components/app/PaneHeader'
import { SegmentedControl } from '@/components/app/SegmentedControl'
import { SidebarItem, SidebarList, SidebarSection } from '@/components/app/SidebarList'
import { StatusDot, type Tone } from '@/components/app/StatusDot'
import { agentStatusPill, StatusPill } from '@/components/app/StatusPill'
import { Tag } from '@/components/app/Tag'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatPct } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useDashStore } from '@/store'
import { agentPanes, sortAgents, type Resolved } from './model'
import { AnsiLine } from './AnsiText'
import { SearchPanel } from './SearchPanel'
import type { ScreenState } from './useHerdr'

/** pane／space 狀態 → 狀態點語意色（§1.4） */
const toneOf = (status: PaneStatus): Tone => agentStatusPill(status).tone

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
  const agents = sortAgents(agentPanes(view))
  const links = useTaskLinks()
  const tabs = sel.workspace?.tabs ?? []
  const tabNo = sel.tab ? tabs.indexOf(sel.tab) + 1 : 0
  return (
    <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[var(--sidebar-w)_minmax(0,1fr)]">
      <Card variant="pane" className="max-lg:max-h-(--pane-max-h-sm)">
        <SidebarList>
          <SidebarSection title="spaces" count={<Tag count={view.workspaces.length} />} data-testid="herdr-spaces">
            {view.workspaces.map((w) => (
              <SidebarItem
                key={w.id}
                index={w.number}
                title={w.label || w.id}
                selected={w.id === sel.workspace?.id}
                data-active={w.id === sel.workspace?.id || undefined}
                onClick={() => onWorkspace(w.id)}
                trailing={
                  <>
                    {w.id === view.focused.workspaceId && <Eye aria-label="herdr 目前所在" />}
                    {w.status !== 'idle' && <StatusDot tone={toneOf(w.status)} label={agentStatusPill(w.status).label} />}
                  </>
                }
              />
            ))}
          </SidebarSection>
          <SidebarSection title="agents" count={<Tag count={agents.length} />} data-testid="herdr-agents">
            {agents.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">沒有 agent</p>}
            {agents.map(({ workspace, pane }) => {
              const look = agentStatusPill(pane.status)
              return (
                <SidebarItem
                  key={pane.paneId}
                  data-pane={pane.paneId}
                  title={pane.name ?? pane.agent}
                  subtitle={`${workspace.label} · ${look.label}`}
                  dot={look.tone}
                  pulse={look.pulse}
                  dotLabel={look.label}
                  selected={pane.paneId === sel.pane?.paneId}
                  onClick={() => onJump(pane.paneId)}
                />
              )
            })}
          </SidebarSection>
        </SidebarList>
      </Card>

      <Card variant="pane" className="relative max-lg:h-(--pane-max-h-sm)">
        {search && <SearchPanel view={view} onClose={search.onClose} onPick={search.onPick} onQuery={search.onQuery} />}
        <PaneHeader
          data-testid="herdr-tabs"
          className="pl-2"
          title={
            tabs.length > 0 && (
              <SegmentedControl
                size="sm"
                aria-label="tab"
                value={sel.tab?.id ?? ''}
                onChange={onTab}
                items={tabs.map((t, i) => ({
                  value: t.id,
                  label: (
                    <span className="inline-flex items-center gap-1.5">
                      <StatusDot tone={toneOf(t.status)} size="sm" />
                      <span className="tabular-nums">{i + 1}</span>
                      {t.label !== String(i + 1) && t.label}
                    </span>
                  ),
                }))}
              />
            )
          }
          info={sel.workspace && tabNo > 0 && <span className="text-xs">{`${sel.workspace.label} · tab ${tabNo}`}</span>}
          actions={
            <>
              <Button variant="ghost" size="sm" onClick={onSearch} data-testid="herdr-search-open" title="搜尋所有 pane（/）">
                <Search aria-hidden />
                搜尋
              </Button>
              {sel.pane && (
                <Button variant="ghost" size="sm" onClick={() => onZoom(!zoomed)} aria-pressed={zoomed} title={zoomed ? '還原（z／Esc）' : '放大（z）'}>
                  {zoomed ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
                  {zoomed ? '還原' : '放大'}
                </Button>
              )}
            </>
          }
        />
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
          <PaneBody className="bg-terminal-bg p-8 text-center text-sm text-terminal-dim">這個 space 沒有 tab</PaneBody>
        )}
      </Card>
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
    <div ref={ref} data-testid="herdr-layout" className="relative min-h-0 flex-1 bg-terminal-bg" style={{ fontSize: font }}>
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
      {tab.panes.length === 0 && <div className="p-8 text-center text-sm text-terminal-dim">這個 tab 沒有 pane</div>}
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
      className={cn('@container absolute flex flex-col overflow-hidden border', selected ? 'z-10 border-brand-blue' : 'border-terminal-line')}
      style={style}
    >
      <PaneHeader
        variant="terminal"
        title={
          <span className="flex min-w-0 items-center gap-2">
            <StatusPill status={pane.status} size="sm" terminal />
            <span className="truncate">{pane.name ?? pane.agent ?? pane.paneId}</span>
          </span>
        }
        info={
          <span className="flex min-w-0 items-center gap-2">
            {link && (
              <Link
                to={link.href}
                data-testid="pane-task-link"
                onMouseDown={(e) => e.stopPropagation()}
                className="dark inline-flex min-w-0 shrink-0 items-center gap-1 rounded-sm bg-terminal-line px-1.5 text-status-info-fg outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <ListTree aria-hidden className="size-3" />
                <span className="truncate">{link.label}</span>
              </Link>
            )}
            {pane.title && <span className="min-w-0 truncate font-medium">{pane.title}</span>}
          </span>
        }
        actions={
          <span className="flex items-center gap-2 font-medium text-terminal-dim tabular-nums">
            {/* 窄 pane（< 32rem）收掉 model／ctx／花費，讓狀態膠囊與名稱不被擠扁；終端底列本身也有 ctx */}
            <span data-testid="pane-meta" className="hidden items-center gap-2 @lg:flex">
              {pane.model && <span>{pane.model}</span>}
              {pane.ctxPct != null && <span>ctx {formatPct(pane.ctxPct)}</span>}
              {pane.cost != null && <span>${pane.cost.toFixed(2)}</span>}
            </span>
            {pane.scrollback > 0 && (
              <button
                type="button"
                data-testid="pane-history-toggle"
                aria-pressed={history}
                title={history ? '回到即時畫面（Esc）' : `看捲動歷史（${pane.scrollback} 行，e）`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => onHistory(pane.paneId)}
                className={cn(
                  'dark inline-flex cursor-pointer items-center gap-1 rounded-sm px-1.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  history ? 'bg-status-info-soft text-status-info-fg' : 'text-terminal-dim hover:bg-terminal-line hover:text-terminal-fg',
                )}
              >
                <History aria-hidden className="size-3" />
                歷史
              </button>
            )}
          </span>
        }
      />
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
  if (!screen) return <div className="p-2 font-sans text-xs text-terminal-dim">讀取畫面中…</div>
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
        className="h-full overflow-auto px-1 font-mono leading-terminal whitespace-pre text-terminal-fg select-text">
        {screen.lines.map((l, i) => (
          <AnsiLine key={i} segs={l} highlight={highlight} focused={i === focusLine} />
        ))}
      </pre>
      {screen.error && (
        <div className="dark absolute right-1 bottom-1 rounded-sm bg-status-danger-soft px-1.5 py-0.5 font-sans text-2xs font-semibold text-status-danger-fg">畫面更新失敗</div>
      )}
    </div>
  )
}
