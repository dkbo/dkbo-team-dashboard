import type { PaneLive, ProjectView, TaskDetail, TaskSummary } from '@dash/shared'
import { minutesBetween, parseLocalTs } from '@/lib/format'
import { findMemberPane } from '@/lib/member-pane'

type TaskMember = TaskDetail['members'][number]

export interface TaskGroups {
  active: TaskSummary[]
  unknown: TaskSummary[]
  closed: TaskSummary[]
}

const byDirDesc = (a: TaskSummary, b: TaskSummary) => (a.dir < b.dir ? 1 : a.dir > b.dir ? -1 : 0)

export function groupTasks(tasks: TaskSummary[]): TaskGroups {
  const pick = (...s: TaskSummary['status'][]) => tasks.filter((t) => s.includes(t.status)).sort(byDirDesc)
  return {
    active: [...pick('running'), ...pick('planning')],
    unknown: pick('unknown'),
    closed: pick('done', 'abandoned'),
  }
}

export interface MemberPill {
  member: string
  /** `.panes` 記的 herdr pane id（可能已不在 herdr） */
  paneId: string | null
  /** 對到的 herdr 即時 pane；null ＝ 無 pane */
  pane: PaneLive | null
  stateStatus: string | null
  noPane: boolean
  /** herdr blocked 或 state status blocked */
  blocked: boolean
  state: TaskMember | null
}

/** 成員膠囊：pane 對應見 findMemberPane。 */
export function memberPills(task: TaskSummary, detail: TaskDetail | undefined, livePanes: PaneLive[]): MemberPill[] {
  if (!detail) return []
  return detail.members.map((m) => {
    const { recordedId: paneId, pane } = findMemberPane(task, detail.panes, m.name, livePanes)
    return {
      member: m.name,
      paneId: pane?.paneId ?? paneId,
      pane,
      stateStatus: m.status,
      noPane: pane === null,
      blocked: pane?.status === 'blocked' || m.status === 'blocked',
      state: m,
    }
  })
}

export function taskAlert(task: TaskSummary, pills: MemberPill[]): boolean {
  return task.counts.escalations > 0 || task.counts.undelivered > 0 || pills.some((p) => p.blocked)
}

export function projectPanes(p: ProjectView): PaneLive[] {
  return [...p.panes, ...p.otherPanes]
}

export function cardAlert(p: ProjectView): boolean {
  if (!p.list) return false
  const panes = projectPanes(p)
  return groupTasks(p.list.tasks).active.some((t) => taskAlert(t, memberPills(t, p.active[t.dir], panes)))
}

export interface WaveInfo {
  closed: number
  planned: number
  pct: number
  current: number | null
  /** 目前這一波開了幾分鐘（取該波 opened_at）；不知道就 null */
  currentMin: number | null
}

export function waveInfo(task: TaskSummary, detail: TaskDetail | undefined, nowMs: number): WaveInfo {
  const planned = task.waves_planned
  const closed = task.waves_closed
  const pct = planned > 0 ? Math.min(100, Math.round((closed / planned) * 100)) : 0
  const current = task.current_wave
  let currentMin: number | null = null
  if (current != null) {
    const opened = parseLocalTs(detail?.waves.find((w) => w.wave === current)?.opened_at)
    if (opened) currentMin = minutesBetween(opened.getTime(), nowMs)
  }
  return { closed, planned, pct, current, currentMin }
}

export function skippedLines(detail: TaskDetail | undefined): number {
  return detail ? detail.skipped_lines.process + detail.skipped_lines.messages : 0
}

export function staleMinutes(p: ProjectView, nowMs: number): number | null {
  if (!p.stale || p.fetchedAt == null) return null
  return minutesBetween(p.fetchedAt, nowMs)
}

export function paneLabel(p: PaneLive): string {
  return p.name ?? p.agent ?? p.paneId
}
