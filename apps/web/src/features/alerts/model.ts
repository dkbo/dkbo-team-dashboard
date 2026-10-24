import type { AgentLive, OfficeSession, OverviewDoc } from '@dash/shared'
import { sessionName } from '@/components/app/SessionRow'
import { herdrHref } from '@/lib/herdr'

export const blockedAgents = (doc: OverviewDoc | null): AgentLive[] => (doc?.agents ?? []).filter((a) => a.status === 'blocked')

export const agentLabel = (a: AgentLive): string => a.name ?? (a.member ? `${a.project}-${a.member}` : (a.agent ?? a.paneId))

export type AttentionKind = 'waiting' | 'error'

/** 一個「需要你」的對象（Q14）：pane 或沒有 pane 的 session */
export interface AttentionItem {
  /** paneId；沒有 pane 的 session 用 OfficeSession.id（`s:<sessionId>`） */
  key: string
  kind: AttentionKind
  label: string
  /** 通知內文：問句／錯誤第一行；herdr pane 用專案或 cwd */
  detail: string | null
  href: string
}

const officeHref = (id: string) => `/office?${new URLSearchParams({ focus: id })}`

/**
 * 需要你＝「細狀態等你／錯誤的 session」∪「herdr 全部 agent 中 status 為 blocked 的 pane」，以 paneId（無 pane 用 session id）去重。
 * herdr pane 不在 config 專案（沒有 session 資料）時算「有人等你」，連到 herdr 頁。
 */
export function attentionItems(doc: OverviewDoc | null, sessions: OfficeSession[] | null): AttentionItem[] {
  const out = new Map<string, AttentionItem>()
  for (const s of sessions ?? []) {
    if (s.substate !== 'waiting' && s.substate !== 'error') continue
    out.set(s.id, {
      key: s.id,
      kind: s.substate,
      label: sessionName(s),
      detail: s.substate === 'waiting' ? s.question : s.error,
      href: officeHref(s.id),
    })
  }
  for (const a of blockedAgents(doc)) {
    if (out.has(a.paneId)) continue
    out.set(a.paneId, {
      key: a.paneId,
      kind: a.session?.substate === 'error' ? 'error' : 'waiting',
      label: agentLabel(a),
      detail: a.project ? `${a.project} · ${a.cwd}` : a.cwd,
      href: herdrHref(a),
    })
  }
  return [...out.values()]
}

/** 跟上一輪比，這輪才進入（或換了種類）的對象；prev 為 null（基準那一輪）時不算，免得一打開頁面就狂跳通知 */
export function newAttention(prev: Map<string, AttentionKind> | null, items: AttentionItem[]): AttentionItem[] {
  if (!prev) return []
  return items.filter((i) => prev.get(i.key) !== i.kind)
}

export function titleWithNeeds(base: string, n: number): string {
  return n > 0 ? `(${n}) 需要你 · ${base}` : base
}

export const notifyTitle = (i: AttentionItem): string => (i.kind === 'error' ? `出錯：${i.label}` : `有人等你：${i.label}`)
