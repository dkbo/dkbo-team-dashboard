// 「即時」與否（E7、review2 I2）：第一份資料、SSE 重連後補抓的第一份都直接畫最終狀態，之後的變化才播動作。
// 呼叫端在 sessions commit 之後（passive effect）才 update，所以那一份 commit 時角色讀到的仍是舊值。
export type SseLike = 'open' | 'connecting' | 'closed'

export interface LiveGate {
  /** 這一份 sessions 畫完之後，下一次變化算不算即時 */
  update(sse: SseLike, sessions: readonly unknown[]): boolean
  isLive(): boolean
}

export function createLiveGate(): LiveGate {
  let live = false
  /** 斷過線（或還沒連上）：要等連上之後「換了一份」sessions 才算回來 */
  let needFresh = false
  let atOpen: readonly unknown[] | null = null
  let prevSse: SseLike | null = null
  return {
    update(sse, sessions) {
      if (sse !== 'open') {
        live = false
        needFresh = true
        atOpen = null
      } else {
        if (prevSse !== 'open') atOpen = sessions
        if (needFresh) {
          if (sessions !== atOpen) {
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
