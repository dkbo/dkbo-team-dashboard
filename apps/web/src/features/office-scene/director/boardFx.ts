// 白板的波關閉閃框（§6.17）：EventDirector 寫、scene 的 TaskBoardLabel 讀（flashIndex）。
import { useSyncExternalStore } from 'react'

let flashes = new Map<string, number>()
const listeners = new Set<() => void>()
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => void listeners.delete(l)
}

/** motion 用：整份換掉（taskDir → 新填的那一段，0 起算） */
export function publishBoardFlashes(next: ReadonlyMap<string, number>): void {
  const same = next.size === flashes.size && [...next].every(([k, v]) => flashes.get(k) === v)
  if (same) return
  flashes = new Map(next)
  for (const l of listeners) l()
}

/** scene 用：這塊白板現在要閃的那一段；沒在播回 null */
export function useBoardFlash(taskDir: string): number | null {
  return useSyncExternalStore(subscribe, () => flashes.get(taskDir) ?? null)
}
