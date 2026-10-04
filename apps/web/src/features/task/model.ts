// 任務詳情頁的純計算。參數用結構型別，只取需要的欄位，與 @dash/shared 的 dk-status 型別相容。

import { findMemberPane, type MemberPaneLive } from '@/lib/member-pane'

type Ts = string | null

export function tsToDate(ts: string): Date {
  const [date, time = '00:00'] = ts.split('T')
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm)
}

export function minutesBetween(a: Ts, b: Ts): number | null {
  if (!a || !b) return null
  return Math.round((tsToDate(b).getTime() - tsToDate(a).getTime()) / 60000)
}

export interface WaveLike {
  opened_at: Ts
  dev_done_at: Ts
  review_spawned_at: Ts
  review_verdict_at: Ts
  closed_at: Ts
}

export interface WaveStep {
  key: 'open' | 'dev' | 'review' | 'verdict' | 'close'
  label: string
  ts: Ts
  /** 距上一個有時間的段幾分鐘；第一段或本段沒時間給 null。 */
  sincePrev: number | null
}

const STEPS: { key: WaveStep['key']; label: string; field: keyof WaveLike }[] = [
  { key: 'open', label: '開波', field: 'opened_at' },
  { key: 'dev', label: 'dev 完成', field: 'dev_done_at' },
  { key: 'review', label: '送審', field: 'review_spawned_at' },
  { key: 'verdict', label: '裁定', field: 'review_verdict_at' },
  { key: 'close', label: '關閉', field: 'closed_at' },
]

export function waveSteps(w: WaveLike): WaveStep[] {
  let prev: Ts = null
  return STEPS.map(({ key, label, field }) => {
    const ts = w[field]
    const sincePrev = ts ? minutesBetween(prev, ts) : null
    if (ts) prev = ts
    return { key, label, ts, sincePrev }
  })
}

export function skippedTotal(s: { process: number; messages: number }): number {
  return s.process + s.messages
}

export const ALL_TYPES = 'all'

export function messageTypes(msgs: { type: string }[]): { type: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const m of msgs) counts.set(m.type, (counts.get(m.type) ?? 0) + 1)
  return [...counts]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type))
}

export function filterMessages<T extends { type: string }>(msgs: T[], type: string): T[] {
  if (!type || type === ALL_TYPES) return msgs
  return msgs.filter((m) => m.type === type)
}

/** 每位成員對到的 herdr pane（語意見 findMemberPane）；沒有就是 null。 */
export function matchMemberPanes<P extends MemberPaneLive>(
  task: {
    dir: string
    short: string
    members: { name: string }[]
    panes: { agent: string; pane: string | null }[]
  },
  live: P[],
): Record<string, P | null> {
  const out: Record<string, P | null> = {}
  for (const { name } of task.members) out[name] = findMemberPane(task, task.panes, name, live).pane
  return out
}

const PANE_RANK: Record<string, number> = { blocked: 0, working: 1 }

/** 頁首「看 herdr／複製 focus 指令」對準的 pane：成員 pane 中 blocked → working → 其他，同級取成員順序第一個 */
export function primaryPane<P extends MemberPaneLive & { status?: string | null }>(matched: Record<string, P | null>, members: { name: string }[]): P | null {
  let best: P | null = null
  for (const { name } of members) {
    const p = matched[name]
    if (!p) continue
    if (!best || (PANE_RANK[p.status ?? ''] ?? 2) < (PANE_RANK[best.status ?? ''] ?? 2)) best = p
  }
  return best
}

export type WavePhase = 'closed' | 'current' | 'open' | 'pending'

/** 波的狀態：已關閉／進行中（task.current_wave）／開了沒關／未開始 */
export function wavePhase(w: { wave: number; opened_at: Ts; closed_at: Ts }, currentWave: number | null): WavePhase {
  if (w.closed_at) return 'closed'
  if (currentWave === w.wave) return 'current'
  if (w.opened_at) return 'open'
  return 'pending'
}
