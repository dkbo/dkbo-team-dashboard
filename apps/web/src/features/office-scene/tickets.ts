// 動畫票（§4.7、E15）：> 0 時 render loop 連續跑，= 0 時停（frameloop demand 回到靜止 0 幀）。
// 共用契約「場景錨點」：SceneRoot 的那一份由 TicketsContext 傳出，motion 用 useTickets() 或 EventDirector 的 tickets prop 拿。
import { createContext, useContext } from 'react'

export interface Tickets {
  /** 拿一張票，回傳歸還函式（重複呼叫只歸還一次） */
  hold(): () => void
  /** 拿一張票，ms 後自動歸還 */
  holdFor(ms: number): () => void
  count(): number
  dispose(): void
}

export function createTickets(onChange?: (count: number) => void): Tickets {
  let n = 0
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const releases = new Set<() => void>()
  const set = (v: number) => {
    n = v
    onChange?.(n)
  }
  const hold = () => {
    let done = false
    const release = () => {
      if (done) return
      done = true
      releases.delete(release)
      set(n - 1)
    }
    releases.add(release)
    set(n + 1)
    return release
  }
  return {
    hold,
    holdFor(ms) {
      const release = hold()
      const t = setTimeout(() => {
        timers.delete(t)
        release()
      }, ms)
      timers.add(t)
      return () => {
        clearTimeout(t)
        timers.delete(t)
        release()
      }
    },
    count: () => n,
    dispose() {
      for (const t of timers) clearTimeout(t)
      timers.clear()
      releases.clear()
      if (n !== 0) set(0)
    },
  }
}

export const TicketsContext = createContext<Tickets | null>(null)

/** 場景的動畫票（SceneRoot 之內才有）；播放期間 hold()、播完呼叫回傳的 release */
export function useTickets(): Tickets {
  const t = useContext(TicketsContext)
  if (!t) throw new Error('useTickets() 只能在 SceneRoot 之內用')
  return t
}
