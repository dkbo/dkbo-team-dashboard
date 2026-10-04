import type { ProjectView } from '@dash/shared'
import { groupTasks, memberPills, projectPanes } from './model'

export type Severity = 'danger' | 'warn'

/** 專案卡外框依最高嚴重度（§1.4、§3.7）：有錯誤（裁定）或 blocked（成員 state、herdr pane、其他 session）→ danger；只有 ESCALATE／UNDELIVERED → warn */
export function projectSeverity(p: ProjectView): Severity | null {
  if (p.error) return 'danger'
  const panes = projectPanes(p)
  if (panes.some((x) => x.status === 'blocked')) return 'danger'
  const active = p.list ? groupTasks(p.list.tasks).active : []
  if (active.some((t) => memberPills(t, p.active[t.dir], panes).some((m) => m.blocked))) return 'danger'
  if (active.some((t) => t.counts.escalations > 0 || t.counts.undelivered > 0)) return 'warn'
  return null
}

const hasActiveTask = (p: ProjectView) => !!p.list && groupTasks(p.list.tasks).active.length > 0

/** Q10：沒有 running／planning、沒有 blocked agent、沒有錯誤／過時才算閒置 */
export function isIdleProject(p: ProjectView): boolean {
  return !hasActiveTask(p) && projectSeverity(p) !== 'danger' && !p.error && !p.stale
}

const rank = (p: ProjectView) => {
  const s = projectSeverity(p)
  return s === 'danger' ? 0 : s === 'warn' ? 1 : hasActiveTask(p) ? 2 : 3
}

/** 總覽分組：活躍依 danger > warn > 活躍 > 其他排序（同級保持原順序）；閒置照原順序 */
export function splitProjects(projects: ProjectView[]): { active: ProjectView[]; idle: ProjectView[] } {
  const active = projects
    .filter((p) => !isIdleProject(p))
    .map((p, i) => ({ p, i, r: rank(p) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.p)
  return { active, idle: projects.filter(isIdleProject) }
}

/** 已結案任務最晚的 closed_at（同格式本地時間字串，可直接比字串） */
export function lastClosedAt(p: ProjectView): string | null {
  const closed = p.list ? groupTasks(p.list.tasks).closed : []
  return closed.reduce<string | null>((max, t) => (t.closed_at && (!max || t.closed_at > max) ? t.closed_at : max), null)
}
