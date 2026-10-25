import type { OfficeSession } from '@dash/shared'
import { sessionName } from '@/components/app/SessionRow'
import { RANK_LABEL, rankOf, starsOf } from '@/lib/rank'
import { substateLabel, timerText } from '@/lib/substate'
import { NO_TASK, paneOpts, subOf, taskKey, type SceneTask } from './model'

/** 2026-10-24-office → office */
export const shortTask = (dir: string) => dir.replace(/^\d{4}-\d{2}-\d{2}-/, '')

export function taskLabel(s: Pick<OfficeSession, 'project' | 'taskDir'>, tasks: Record<string, SceneTask>): string | null {
  if (!s.taskDir) return null
  return tasks[taskKey(s.project, s.taskDir)]?.display ?? shortTask(s.taskDir)
}

export const taskOptionLabel = (dir: string, tasks: Record<string, SceneTask>, project: string | null) =>
  dir === NO_TASK ? '無任務 session' : ((project && tasks[taskKey(project, dir)]?.display) ?? shortTask(dir))

export const taskHref = (project: string, dir: string) => `/p/${encodeURIComponent(project)}/t/${encodeURIComponent(dir)}`

/** 細狀態文字（等你接審批／提問） */
export function substateText(s: OfficeSession, now: number): string {
  const sub = subOf(s, now)
  return `${substateLabel(sub, s.tool?.name)}${sub === 'waiting' ? waitingNote(s) : ''}`
}

/** 等你的 note：卡在工具上＝審批，否則＝提問 */
export const waitingNote = (s: OfficeSession) => (s.tool ? '審批' : '提問')

/** §6.6 列的 aria-label：「dev-a，atlas 結帳流程改版，等你審批 3 分 12 秒，資深，effort 2」 */
export function rowAriaLabel(s: OfficeSession, tasks: Record<string, SceneTask>, now: number): string {
  const where = [s.project, taskLabel(s, tasks)].filter(Boolean).join(' ')
  const stars = starsOf(s.kind, s.effort)
  return [
    sessionName(s),
    where,
    [substateText(s, now), timerText(s, now, { long: true, ...paneOpts(s) })].filter(Boolean).join(' '),
    RANK_LABEL[rankOf(s.kind, s.model)],
    stars > 0 ? `effort ${stars}` : null,
  ]
    .filter(Boolean)
    .join('，')
}
