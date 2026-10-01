import type { AgentLive, OverviewDoc, PaneStatus } from '@dash/shared'

export const blockedAgents = (doc: OverviewDoc | null): AgentLive[] => (doc?.agents ?? []).filter((a) => a.status === 'blocked')

/** 跟上一輪比，這輪才變成 blocked 的 agent；prev 為 null（第一次拿到資料）時不算，免得一打開頁面就狂跳通知 */
export function newlyBlocked(prev: Map<string, PaneStatus> | null, agents: AgentLive[]): AgentLive[] {
  if (!prev) return []
  return agents.filter((a) => a.status === 'blocked' && prev.get(a.paneId) !== 'blocked')
}

export const agentLabel = (a: AgentLive): string => a.name ?? (a.member ? `${a.project}-${a.member}` : (a.agent ?? a.paneId))

export function titleWithCount(base: string, n: number): string {
  return n > 0 ? `(${n}) ${base}` : base
}
