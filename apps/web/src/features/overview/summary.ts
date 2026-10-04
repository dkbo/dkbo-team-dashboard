import type { DayCost, KindUsage, OverviewDoc, ProjectKindsDown, ProjectView, TaskSummary } from '@dash/shared'
import type { SummaryVariant } from '@/components/app/SummaryTile'
import { agentLabel, blockedAgents } from '@/features/alerts/model'
import { USAGE_WARN_PCT, latestKindsDown, usageRows } from '@/features/topbar/model'
import { formatCountdown } from '@/lib/format'
import { herdrHref } from '@/lib/herdr'

const ACTIVE: TaskSummary['status'][] = ['running', 'planning']
const TOP_TASKS = 2
const MAX_NAMES = 3

export interface RunningSummary {
  count: number
  /** 依 updated_at 新到舊的前幾個任務，`<short> · 波 <current>/<planned>` */
  top: string[]
}

/** 進行中卡：所有專案進行中（running＋planning）任務數 */
export function runningSummary(projects: ProjectView[]): RunningSummary {
  const tasks = projects.flatMap((p) => (p.list?.tasks ?? []).filter((t) => ACTIVE.includes(t.status)))
  // updated_at 是同格式本地時間字串，可直接比字串；沒有的排最後
  const sorted = [...tasks].sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
  return {
    count: tasks.length,
    top: sorted.slice(0, TOP_TASKS).map((t) => `${t.short} · 波 ${t.current_wave ?? '—'}/${t.waves_planned}`),
  }
}

const pad = (n: number) => String(n).padStart(2, '0')
const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export interface SpendSummary {
  today: number | null
  yesterday: number | null
}

/** 今日花費卡：以瀏覽器本地日期比對 costByDay[].day（假設與 server 同時區），同日各專案加總；該日沒有資料為 null */
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

/** 卡住卡：卡住 agent 數與名字；連結同頂部列的 BlockedBadge */
export function blockedSummary(doc: OverviewDoc | null): BlockedSummary {
  const blocked = blockedAgents(doc)
  return {
    count: blocked.length,
    names: blocked.slice(0, MAX_NAMES).map(agentLabel),
    href: blocked.length > 0 ? herdrHref(blocked[0]) : '/herdr',
  }
}

// 摘要卡 variant（§1.4、Q1、Q2）：漸層＝要看一眼的事；quiet＝沒事
export const runningVariant = (count: number): SummaryVariant => (count > 0 ? 'ok' : 'quiet')
export const spendVariant = (today: number | null): SummaryVariant => (today != null ? 'brand' : 'quiet')
export const blockedVariant = (count: number): SummaryVariant => (count > 0 ? 'danger' : 'quiet')

export interface QuotaSummary {
  variant: 'warn' | 'quiet'
  value: string
  line: string
}

/** 熔斷與額度卡（Q1）：有 kind 熔斷或任一額度 ≥ 80% → warn（永不變紅，Q12）；否則 quiet 並列最高用量 */
export function quotaSummary(kindsDown: ProjectKindsDown[], usage: Record<string, KindUsage>, nowMs: number): QuotaSummary {
  const downs = latestKindsDown(kindsDown, nowMs)
  if (downs.length > 0) {
    const soonest = Math.min(...downs.map((d) => d.until_epoch))
    return { variant: 'warn', value: `${downs.length} 熔斷`, line: `${downs.map((d) => d.kind).join('、')} · 最短還剩 ${formatCountdown(soonest, nowMs)}` }
  }
  const windows = usageRows(usage).flatMap((u) => [
    { kind: u.kind, win: '5h', pct: u.fiveHourPct },
    { kind: u.kind, win: '週', pct: u.weekPct },
  ])
  // 同值取先出現的（kind 字母序、5h 先於週）
  const top = windows.reduce<(typeof windows)[number] | null>((m, w) => (w.pct != null && (m == null || w.pct > m.pct!) ? w : m), null)
  if (top && top.pct! >= USAGE_WARN_PCT) {
    return { variant: 'warn', value: `${Math.round(top.pct!)}%`, line: `${top.kind} ${top.win} ${Math.round(top.pct!)}% · 接近上限` }
  }
  return { variant: 'quiet', value: '0 熔斷', line: top ? `額度都健康 · 最高 ${top.kind} ${top.win} ${Math.round(top.pct!)}%` : '額度都健康' }
}
