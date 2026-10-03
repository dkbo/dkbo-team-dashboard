import type { DayCost, OverviewDoc, ProjectView, TaskSummary } from '@dash/shared'
import { agentLabel, blockedAgents } from '@/features/alerts/model'
import { herdrHref } from '@/lib/herdr'

const ACTIVE: TaskSummary['status'][] = ['running', 'planning']
const TOP_TASKS = 2
const MAX_NAMES = 3

export interface RunningSummary {
  count: number
  /** 依 updated_at 新到舊的前幾個任務，`<short> 波 <current>/<planned>` */
  top: string[]
}

/** 藍卡：所有專案進行中（running＋planning）任務數 */
export function runningSummary(projects: ProjectView[]): RunningSummary {
  const tasks = projects.flatMap((p) => (p.list?.tasks ?? []).filter((t) => ACTIVE.includes(t.status)))
  // updated_at 是同格式本地時間字串，可直接比字串；沒有的排最後
  const sorted = [...tasks].sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
  return {
    count: tasks.length,
    top: sorted.slice(0, TOP_TASKS).map((t) => `${t.short} 波 ${t.current_wave ?? '—'}/${t.waves_planned}`),
  }
}

const pad = (n: number) => String(n).padStart(2, '0')
const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export interface SpendSummary {
  today: number | null
  yesterday: number | null
}

/** 紫卡：以瀏覽器本地日期比對 costByDay[].day（假設與 server 同時區），同日各專案加總；該日沒有資料為 null */
export function spendSummary(costByDay: DayCost[] | null, nowMs: number): SpendSummary {
  const now = new Date(nowMs)
  const today = dayOf(now)
  const yesterday = dayOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
  const sum = (day: string) => {
    const rows = (costByDay ?? []).filter((r) => r.day === day)
    return rows.length === 0 ? null : rows.reduce((s, r) => s + r.cost, 0)
  }
  return { today: sum(today), yesterday: sum(yesterday) }
}

export interface BlockedSummary {
  count: number
  names: string[]
  href: string
}

/** 珊瑚卡：卡住 agent 數與名字；連結同頂部列的 BlockedBadge */
export function blockedSummary(doc: OverviewDoc | null): BlockedSummary {
  const blocked = blockedAgents(doc)
  return {
    count: blocked.length,
    names: blocked.slice(0, MAX_NAMES).map(agentLabel),
    href: blocked.length > 0 ? herdrHref(blocked[0]) : '/herdr',
  }
}
