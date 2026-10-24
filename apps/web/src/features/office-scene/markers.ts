// 頭頂標記的縮放與碰撞讓位（§6.3、§6.14、E2）。只在鏡頭停下後算一次，不每幀算。
import type { Substate } from '@dash/shared'
import { SUBSTATE_META } from '@/lib/substate'

export const MIN_MARKER_SCALE = 0.6

/** 隨鏡頭距離 0.6–1（中階 base 0.8）；< 0.6 只剩點；alert 永不縮 */
export function markerScale({ base, fitDistance, distance, alert }: { base: number; fitDistance: number; distance: number; alert: boolean }): number | 'dot' {
  if (alert) return 1
  const scale = Math.min(1, (base * fitDistance) / Math.max(distance, 1e-6))
  return scale < MIN_MARKER_SCALE - 1e-9 ? 'dot' : scale
}

/** 數字越小越優先：hover／選取中最前，其次 §1.2 排序 */
export function markerPriority(substate: Substate, focused: boolean): number {
  return (focused ? 0 : 10) + SUBSTATE_META[substate].order
}

export interface MarkerBox {
  id: string
  /** 螢幕座標（左上角）與尺寸，px */
  x: number
  y: number
  w: number
  h: number
  priority: number
  alert: boolean
}

const overlap = (a: MarkerBox, b: MarkerBox) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/** 回傳要縮成點的 id：alert 先佔且不讓位，其餘依優先序，撞到已保留的就縮；縮成點的不再擋人 */
export function resolveCollisions(boxes: MarkerBox[]): Set<string> {
  const sorted = [...boxes].sort((a, b) => Number(b.alert) - Number(a.alert) || a.priority - b.priority || (a.id < b.id ? -1 : 1))
  const kept: MarkerBox[] = []
  const dots = new Set<string>()
  for (const b of sorted) {
    if (!b.alert && kept.some((k) => overlap(k, b))) dots.add(b.id)
    else kept.push(b)
  }
  return dots
}
