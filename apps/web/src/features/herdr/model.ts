import type { HerdrView, HerdrViewPane, HerdrViewTab, HerdrViewWorkspace } from '@dash/shared'

export interface HerdrSelection {
  workspaceId?: string | null
  tabId?: string | null
  paneId?: string | null
}

export interface Resolved {
  workspace: HerdrViewWorkspace | null
  tab: HerdrViewTab | null
  pane: HerdrViewPane | null
}

/** 把網頁自己的選擇（可能已過期）對到現有的 workspace／tab／pane；找不到就退回 herdr 的 focus／active／第一個 */
export function resolveSelection(view: HerdrView | null, sel: HerdrSelection, lastTab: Record<string, string> = {}): Resolved {
  if (!view || view.workspaces.length === 0) return { workspace: null, tab: null, pane: null }
  const ws =
    view.workspaces.find((w) => w.id === sel.workspaceId) ??
    view.workspaces.find((w) => w.id === view.focused.workspaceId) ??
    view.workspaces[0]
  const tabs = ws.tabs
  const tab =
    tabs.find((t) => t.id === sel.tabId) ??
    tabs.find((t) => t.id === lastTab[ws.id]) ??
    tabs.find((t) => t.id === ws.activeTabId) ??
    tabs[0] ??
    null
  const pane = tab
    ? (tab.panes.find((p) => p.paneId === sel.paneId) ?? tab.panes.find((p) => p.paneId === tab.focusedPaneId) ?? tab.panes[0] ?? null)
    : null
  return { workspace: ws, tab, pane }
}

export type Direction = 'left' | 'right' | 'up' | 'down'

const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0)

/** 依 rect 找某方向的鄰居 pane：在那一側、垂直軸上有重疊，取最近、重疊最多的 */
export function neighborPane(tab: HerdrViewTab, fromId: string, dir: Direction): string | null {
  const from = tab.panes.find((p) => p.paneId === fromId)
  if (!from) return tab.panes[0]?.paneId ?? null
  const f = from.rect
  let best: { id: string; dist: number; ov: number } | null = null
  for (const p of tab.panes) {
    if (p.paneId === fromId) continue
    const r = p.rect
    const horizontal = dir === 'left' || dir === 'right'
    const ov = horizontal ? overlap(f.y, f.y + f.height, r.y, r.y + r.height) : overlap(f.x, f.x + f.width, r.x, r.x + r.width)
    if (ov <= 0) continue
    const dist =
      dir === 'left' ? f.x - (r.x + r.width) : dir === 'right' ? r.x - (f.x + f.width) : dir === 'up' ? f.y - (r.y + r.height) : r.y - (f.y + f.height)
    if (dist < -1) continue
    if (!best || dist < best.dist || (dist === best.dist && ov > best.ov)) best = { id: p.paneId, dist, ov }
  }
  return best?.id ?? null
}

/** 依畫面順序（上到下、左到右）循環 */
export function cyclePane(tab: HerdrViewTab, fromId: string | null, delta: number): string | null {
  if (tab.panes.length === 0) return null
  const order = [...tab.panes].sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x)
  const i = order.findIndex((p) => p.paneId === fromId)
  const n = order.length
  return order[(((i < 0 ? 0 : i + delta) % n) + n) % n].paneId
}

export function cycle<T extends { id: string }>(items: T[], fromId: string | null | undefined, delta: number): T | null {
  if (items.length === 0) return null
  const i = items.findIndex((x) => x.id === fromId)
  const n = items.length
  return items[(((i < 0 ? 0 : i + delta) % n) + n) % n]
}

/** 所有有 agent 的 pane（herdr 側欄的 agents 區），依 workspace、tab 順序 */
export function agentPanes(view: HerdrView | null): { workspace: HerdrViewWorkspace; tab: HerdrViewTab; pane: HerdrViewPane }[] {
  if (!view) return []
  return view.workspaces.flatMap((workspace) =>
    workspace.tabs.flatMap((tab) => tab.panes.filter((p) => p.agent).map((pane) => ({ workspace, tab, pane }))),
  )
}

export function findPane(view: HerdrView | null, paneId: string): { workspace: HerdrViewWorkspace; tab: HerdrViewTab } | null {
  for (const workspace of view?.workspaces ?? [])
    for (const tab of workspace.tabs) if (tab.panes.some((p) => p.paneId === paneId)) return { workspace, tab }
  return null
}

const AGENT_ORDER: Record<string, number> = { blocked: 0, working: 1, idle: 2 }

/** 側欄 agents 段排序（§6.20）：blocked → working → idle → 其他，同狀態依名稱 */
export function sortAgents<T extends { pane: HerdrViewPane }>(agents: T[]): T[] {
  const rank = (p: HerdrViewPane) => AGENT_ORDER[p.status] ?? 3
  const name = (p: HerdrViewPane) => p.name ?? p.agent ?? p.paneId
  return [...agents].sort((a, b) => rank(a.pane) - rank(b.pane) || name(a.pane).localeCompare(name(b.pane)))
}
