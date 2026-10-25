// 「即時」與否（E7、review2 I2）：第一份資料、SSE 重連後補抓的第一份都直接畫最終狀態，之後的變化才播動作。
// 呼叫端在 sessions commit 之後（passive effect）才 update，所以那一份 commit 時角色讀到的仍是舊值。
// 「換了一份」看內容不看陣列參照（AC12 live.ts:24）：父層重算出內容相同的新陣列不算補抓到。
export type SseLike = 'open' | 'connecting' | 'closed'

type SessionLike = { id?: unknown; substate?: unknown; substateSince?: unknown; lastEventAt?: unknown }

/** 判斷「內容換了沒」的指紋：每人的 id、細狀態、起始時間、最後事件時間 */
export function sessionsKey(sessions: readonly unknown[]): string {
  return sessions
    .map((x) => {
      const s = (x ?? {}) as SessionLike
      return `${String(s.id)}|${String(s.substate)}|${String(s.substateSince)}|${String(s.lastEventAt)}`
    })
    .join('\n')
}

export interface LiveGate {
  /** 這一份 sessions 畫完之後，下一次變化算不算即時 */
  update(sse: SseLike, sessions: readonly unknown[]): boolean
  isLive(): boolean
}

export function createLiveGate(): LiveGate {
  let live = false
  /** 斷過線（或還沒連上）：要等連上之後「換了一份」sessions 才算回來 */
  let needFresh = false
  let atOpen: string | null = null
  let prevSse: SseLike | null = null
  return {
    update(sse, sessions) {
      if (sse !== 'open') {
        live = false
        needFresh = true
        atOpen = null
      } else {
        if (prevSse !== 'open') atOpen = sessionsKey(sessions)
        if (needFresh) {
          if (sessionsKey(sessions) !== atOpen) {
            needFresh = false
            live = true
          }
        } else if (sessions.length > 0) live = true
      }
      prevSse = sse
      return live
    },
    isLive: () => live,
  }
}
