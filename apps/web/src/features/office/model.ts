// /office 的純函式：網址狀態（§4.5、E13）、場景／清單篩選、分組與計數（§6.6、§6.7）、OfficeScene 的 tasks。
import type { OfficeSession, OverviewDoc, Substate } from '@dash/shared'
import { effectiveSubstate, isOffDuty, SUBSTATE_META } from '@/lib/substate'
import { sessionName } from '@/components/app/SessionRow'

export type KindFilter = 'all' | 'claude' | 'codex'
export type OfficeView = '3d' | 'list'

export interface OfficeParams {
  kind: KindFilter
  /** 工具列專案（改場景） */
  project: string | null
  needs: boolean
  focus: string | null
  view: OfficeView
  /** 找人清單 FilterChip（只縮清單，E13） */
  fProject: string | null
  fTask: string | null
  fRole: string | null
}

/** 任務 FilterChip 的「無任務 session」 */
export const NO_TASK = '__none__'

const KEYS: Record<keyof OfficeParams, string> = {
  kind: 'kind',
  project: 'project',
  needs: 'needs',
  focus: 'focus',
  view: 'view',
  fProject: 'f_project',
  fTask: 'f_task',
  fRole: 'f_role',
}

export function parseOfficeParams(sp: URLSearchParams): OfficeParams {
  const kind = sp.get('kind')
  return {
    kind: kind === 'claude' || kind === 'codex' ? kind : 'all',
    project: sp.get('project') || null,
    needs: sp.get('needs') === '1',
    focus: sp.get('focus') || null,
    view: sp.get('view') === 'list' ? 'list' : '3d',
    fProject: sp.get('f_project') || null,
    fTask: sp.get('f_task') || null,
    fRole: sp.get('f_role') || null,
  }
}

/** 把 patch 寫回網址；預設值（all、false、3d、null）刪掉該參數，其他參數原樣保留 */
export function writeOfficeParams(prev: URLSearchParams, patch: Partial<OfficeParams>): URLSearchParams {
  const next = new URLSearchParams(prev)
  for (const [k, v] of Object.entries(patch) as [keyof OfficeParams, OfficeParams[keyof OfficeParams]][]) {
    const key = KEYS[k]
    if (v == null || v === false || v === 'all' || v === '3d' || v === '') next.delete(key)
    else next.set(key, v === true ? '1' : String(v))
  }
  return next
}

const isNeeds = (sub: Substate) => sub === 'waiting' || sub === 'error'

/** 在場（未下班）且符合工具列專案篩選；kind 計數與場景共用 */
function present(sessions: OfficeSession[], p: OfficeParams, now: number): OfficeSession[] {
  return sessions.filter((s) => !isOffDuty(s, now) && (!p.project || s.project === p.project))
}

/** 交給場景的 sessions：去掉下班、套 kind／project；「只看需要你」只留等你／錯誤 */
export function sceneSessions(sessions: OfficeSession[], p: OfficeParams, now: number): OfficeSession[] {
  return present(sessions, p, now).filter(
    (s) => (p.kind === 'all' || s.kind === p.kind) && (!p.needs || isNeeds(effectiveSubstate(s, now))),
  )
}

export interface KindCounts {
  all: number
  claude: number
  codex: number
  /** 目前 kind／project 範圍內的等你＋錯誤 */
  needs: number
  /** 同專案範圍內的下班人數 */
  offDuty: number
}

export function kindCounts(sessions: OfficeSession[], p: OfficeParams, now: number): KindCounts {
  const here = present(sessions, p, now)
  const inKind = here.filter((s) => p.kind === 'all' || s.kind === p.kind)
  return {
    all: here.length,
    claude: here.filter((s) => s.kind === 'claude').length,
    codex: here.filter((s) => s.kind === 'codex').length,
    needs: inKind.filter((s) => isNeeds(effectiveSubstate(s, now))).length,
    offDuty: sessions.filter((s) => isOffDuty(s, now) && (!p.project || s.project === p.project)).length,
  }
}

/** 找人清單的 FilterChip 篩選（不影響場景） */
export function narrowFinder(sessions: OfficeSession[], p: Pick<OfficeParams, 'fProject' | 'fTask' | 'fRole'>): OfficeSession[] {
  return sessions.filter(
    (s) =>
      (!p.fProject || s.project === p.fProject) &&
      (!p.fTask || (p.fTask === NO_TASK ? s.taskDir == null : s.taskDir === p.fTask)) &&
      (!p.fRole || s.role === p.fRole),
  )
}

export interface FinderOptions {
  projects: { value: string; count: number }[]
  tasks: { value: string; project: string | null; count: number }[]
  roles: { value: string; count: number }[]
}

function tally<K>(items: K[], key: (k: K) => string | null): Map<string, { first: K; count: number }> {
  const m = new Map<string, { first: K; count: number }>()
  for (const it of items) {
    const k = key(it)
    if (k == null) continue
    const cur = m.get(k)
    if (cur) cur.count += 1
    else m.set(k, { first: it, count: 1 })
  }
  return m
}

const byKey = <T extends { value: string }>(a: T, b: T) => a.value.localeCompare(b.value)

/** FilterChip 選單：專案全列；任務只列 fProject 範圍（＋無任務數）；角色只列現場有的 */
export function finderOptions(sessions: OfficeSession[], fProject: string | null): FinderOptions {
  const scoped = fProject ? sessions.filter((s) => s.project === fProject) : sessions
  const tasks = [...tally(scoped, (s) => s.taskDir)].map(([value, { first, count }]) => ({ value, project: first.project, count })).sort(byKey)
  const none = scoped.filter((s) => s.taskDir == null).length
  return {
    projects: [...tally(sessions, (s) => s.project)].map(([value, { count }]) => ({ value, count })).sort(byKey),
    tasks: none > 0 ? [...tasks, { value: NO_TASK, project: null, count: none }] : tasks,
    roles: [...tally(sessions, (s) => s.role)].map(([value, { count }]) => ({ value, count })).sort(byKey),
  }
}

export interface SessionGroups {
  needs: OfficeSession[]
  working: OfficeSession[]
  rest: OfficeSession[]
}

/** §6.6 三組；組內照 §1.2 排序（有效細狀態），同狀態依名字 */
export function groupSessions(sessions: OfficeSession[], now: number): SessionGroups {
  const sorted = sessions
    .map((s) => ({ s, sub: effectiveSubstate(s, now), name: sessionName(s) }))
    .sort((a, b) => SUBSTATE_META[a.sub].order - SUBSTATE_META[b.sub].order || a.name.localeCompare(b.name))
  const out: SessionGroups = { needs: [], working: [], rest: [] }
  for (const { s, sub } of sorted) {
    const tone = SUBSTATE_META[sub].tone
    if (tone === 'danger') out.needs.push(s)
    else if (SUBSTATE_META[sub].paneStatus === 'working') out.working.push(s)
    else out.rest.push(s)
  }
  return out
}

/** StateCounts 的順序：照稿 page-office-*（進行中 → 完成 → 中斷 → 閒置） */
const COUNT_ORDER: Substate[] = ['thinking', 'running', 'writing', 'done', 'interrupted', 'idle']

/** §6.7 StateCounts：不含等你／錯誤（在找人清單的需要你組），0 的不列 */
export function stateCounts(sessions: OfficeSession[], now: number): { substate: Substate; count: number }[] {
  const m = new Map<Substate, number>()
  for (const s of sessions) {
    const sub = effectiveSubstate(s, now)
    if (!isNeeds(sub)) m.set(sub, (m.get(sub) ?? 0) + 1)
  }
  return [...m].map(([substate, count]) => ({ substate, count })).sort((a, b) => COUNT_ORDER.indexOf(a.substate) - COUNT_ORDER.indexOf(b.substate))
}

export interface SceneTask {
  project: string
  display: string
  members: string[]
  wave: { current: number; planned: number } | null
}

/** tasks 的 key：任務資料夾名（frontend-scene 以 `session.taskDir` 查；資料夾帶日期前綴，跨專案同名極少見，撞名時先出現的專案優先） */
export const taskKey = (_project: string, dir: string) => dir

/** OfficeScene 的 tasks：key＝任務 dir；members 依 brief 波次表順序取不重複 member（Q5 座位），沒有就退回 members[].name */
export function buildTasks(doc: OverviewDoc | null): Record<string, SceneTask> {
  const out: Record<string, SceneTask> = {}
  for (const p of doc?.projects ?? []) {
    for (const [dir, t] of Object.entries(p.active)) {
      const fromWaves = [...new Set(t.brief.waves.map((w) => w.member).filter((m): m is string => !!m))]
      if (out[taskKey(p.name, dir)]) continue
      out[taskKey(p.name, dir)] = {
        project: p.name,
        display: t.display ?? t.short,
        members: fromWaves.length > 0 ? fromWaves : t.members.map((m) => m.name),
        wave: t.waves_planned > 0 ? { current: t.waves_closed, planned: t.waves_planned } : null,
      }
    }
  }
  return out
}
