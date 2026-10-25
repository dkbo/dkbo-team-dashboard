import type { HerdrView, HerdrViewPane, HerdrViewTab, HerdrViewWorkspace, Substate } from '@dash/shared'
import type { Tone } from '@/components/app/StatusDot'
import { agentStatusPill } from '@/components/app/StatusPill'
import { effectiveSubstate, SUBSTATE_META } from '@/lib/substate'

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

/** pane 的有效細狀態（套 Q3／Q7）；沒有 session 資料回 null，不從粗狀態編造 */
export function paneSubstate(p: HerdrViewPane, now: number): Substate | null {
  return p.session ? effectiveSubstate(p.session, now) : null
}

export type AgentGroup = 'needs' | 'working' | 'other'

export const AGENT_GROUPS: { group: AgentGroup; label: string }[] = [
  { group: 'needs', label: '需要你' },
  { group: 'working', label: '工作中' },
  { group: 'other', label: '其他' },
]

const GROUP_OF: Record<Substate, AgentGroup> = {
  waiting: 'needs',
  error: 'needs',
  running: 'working',
  writing: 'working',
  thinking: 'working',
  interrupted: 'other',
  done: 'other',
  idle: 'other',
}

/** §6.13 三組：有 session 看有效細狀態；沒有就退回 herdr 粗狀態（blocked／working／其他） */
export function agentGroup(p: HerdrViewPane, now: number): AgentGroup {
  const sub = paneSubstate(p, now)
  if (sub) return GROUP_OF[sub]
  return p.status === 'blocked' ? 'needs' : p.status === 'working' ? 'working' : 'other'
}

/** 排序鍵：有 session 用 §1.2 的 order；沒有就把粗狀態對到最接近的細狀態（blocked＝等你、working＝思考、done、idle、其他最後） */
function paneRank(p: HerdrViewPane, now: number): number {
  const sub = paneSubstate(p, now)
  if (sub) return SUBSTATE_META[sub].order
  switch (p.status) {
    case 'blocked':
      return SUBSTATE_META.waiting.order
    case 'working':
      return SUBSTATE_META.thinking.order
    case 'done':
      return SUBSTATE_META.done.order
    case 'idle':
      return SUBSTATE_META.idle.order
    default:
      return SUBSTATE_META.idle.order + 1
  }
}

/** pane 的狀態點語意色：有 session 用細狀態 tone，否則 herdr 粗狀態 */
export function paneTone(p: HerdrViewPane, now: number): Tone {
  const sub = paneSubstate(p, now)
  return sub ? SUBSTATE_META[sub].tone : agentStatusPill(p.status).tone
}

/** tab 的狀態點：該 tab 內最嚴重（§1.2 排序最前）的 pane；沒有任何 session 資料時沿用 tab 的 herdr 粗狀態 */
export function tabTone(tab: HerdrViewTab, now: number): Tone {
  if (!tab.panes.some((p) => p.session)) return agentStatusPill(tab.status).tone
  let best: HerdrViewPane | null = null
  for (const p of tab.panes) if (!best || paneRank(p, now) < paneRank(best, now)) best = p
  return best ? paneTone(best, now) : agentStatusPill(tab.status).tone
}

const byName = (p: HerdrViewPane) => p.name ?? p.agent ?? p.paneId

/** 側欄 agents 段排序（§6.13）：依細狀態順序（等你 → 完成 → 閒置），同級依名稱；沒有 session 的 pane 以粗狀態對位 */
export function sortAgents<T extends { pane: HerdrViewPane }>(agents: T[], now: number = Date.now()): T[] {
  return [...agents].sort((a, b) => paneRank(a.pane, now) - paneRank(b.pane, now) || byName(a.pane).localeCompare(byName(b.pane)))
}

/** 依 §6.13 切成「需要你／工作中／其他」，0 個的組不出現；組內順序同 sortAgents */
export function groupAgents<T extends { pane: HerdrViewPane }>(agents: T[], now: number = Date.now()): { group: AgentGroup; label: string; items: T[] }[] {
  const sorted = sortAgents(agents, now)
  return AGENT_GROUPS.map(({ group, label }) => ({ group, label, items: sorted.filter((a) => agentGroup(a.pane, now) === group) })).filter((g) => g.items.length > 0)
}
