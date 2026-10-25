// 共用契約「場景錨點」（擁有者 frontend-scene、消費者 frontend-motion）：
// 事件動畫要用的世界座標（座位、白板前、休息區、走道路徑）與角色覆寫（motion 寫、Character 讀）。
// 錨點讀的是 SceneRoot 最近一次 publish 的 layout；場景還沒畫出來時一律回 null／空路徑。
import { useSyncExternalStore } from 'react'
import type * as THREE from 'three'
import type { Substate } from '@dash/shared'
import type { OfficeEvent } from '@/features/office/events/types'
import type { Tickets } from './tickets'
import { AISLE, PAD, ZONE_D, type OfficeLayout, type Place, type Rect } from './layout'
import { WALK_MAX_MS, WALK_SPEED } from './motion'

/** 世界座標 [x, y, z]（y 一律 0＝地面） */
export type Vec3 = [number, number, number]

/** 覆寫期間角色做的動作（clip 沒有的由 procedural 補） */
export type OverrideGesture =
  /** 站著（走完預設） */
  | 'stand'
  /** 站著拿板子（reviewer 等 verdict） */
  | 'hold-board'
  /** 比讚（motion-thumb） */
  | 'thumbs-up'
  /** 垂頭（motion-head-down），可坐可站 */
  | 'head-down'
  /** 點頭（leader，波關閉） */
  | 'nod'
  /** 跳（結案 jump × 2） */
  | 'jump'
  /** 揮手（reviewer 走路中途變等你） */
  | 'wave'

export interface CharacterOverride {
  /**
   * 沿著走的路徑點（世界座標，通常是 walkPath 的結果）；第一點可以是角色現在的位置。
   * 省略或 null：不移動，留在原位（座位上或現在站的地方）。
   */
  path?: Vec3[] | null
  /** 走完（或沒有 path 時）面向；省略＝面向最後一段的行進方向，沒有 path 時不變 */
  rotY?: number
  /** 走完之後（或沒有 path 時）的動作；省略＝'stand'（在座位上沒 path 時＝維持細狀態姿勢） */
  gesture?: OverrideGesture
  /** 走完整條路徑的時間上限（ms，review-walk-max）；路短照 WALK_SPEED，路長加速壓在上限內 */
  walkMaxMs?: number
  /** reduced motion：不走，直接出現在路徑終點 */
  instant?: boolean
  /** 座位螢幕暗（reviewer 離座） */
  screenOff?: boolean
  /** 同一個覆寫要重播動作時換新值（例如再比一次讚） */
  nonce?: number
}

/** 角色在場景中的即時資訊（給 motion 判斷細狀態優先、掛 bubble） */
export interface CharacterInfo {
  /** 已套 hasPane 的有效細狀態 */
  substate: Substate
  /** 自己的座位 */
  home: Place
  /** 細狀態下該在的位置（等你站座位旁、done 在休息區） */
  place: Place
}

/** `director/EventDirector.tsx` default export 的 props（SceneRoot 在第二包載入後掛在 <Canvas> 內） */
export interface EventDirectorProps {
  /** 只含即時事件（契約「OfficeEvent」）；同一個 id 只播一次 */
  events: OfficeEvent[]
  /** 場景的動畫票：播放期間 hold()、播完 release */
  tickets: Tickets
}

// ---- 場景來源（SceneRoot publish） ----

interface Source {
  layout: OfficeLayout
  subs: Record<string, Substate>
  /** 任務白板（世界座標中心、面向 +z） */
  boards: Record<string, { x: number; z: number }>
}

let source: Source | null = null
const overrides = new Map<string, CharacterOverride>()
/** 覆寫帶 screenOff 的 session（座位螢幕暗）；變了才換參照 */
let screenOff: ReadonlySet<string> = new Set()
const syncScreenOff = () => {
  const next = [...overrides].filter(([, o]) => o.screenOff).map(([id]) => id)
  if (next.length !== screenOff.size || next.some((id) => !screenOff.has(id))) screenOff = new Set(next)
}
const heads = new Map<string, THREE.Object3D>()
const listeners = new Set<() => void>()
let version = 0
const emit = () => {
  version++
  for (const l of listeners) l()
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => void listeners.delete(l)
}

/** scene 用：每次 layout／細狀態變了就 publish（motion 不呼叫） */
export function publishSceneAnchors(next: Source | null): void {
  source = next
  emit()
}

/** scene 用：Character 掛上／卸下頭頂 group（motion 用 r3f createPortal 把 bubble 掛進去） */
export function registerCharacterHead(id: string, head: THREE.Object3D | null): void {
  if (head) heads.set(id, head)
  else heads.delete(id)
  emit()
}

// ---- 錨點（motion 用） ----

/** 板子前站的距離（格） */
const BOARD_STAND = 0.7

const v = (x: number, z: number): Vec3 => [x, 0, z]

/** 角色自己座位上的位置（坐著那一點）；不在場回 null */
export function deskAnchor(sessionId: string): Vec3 | null {
  const h = source?.layout.homes[sessionId]
  return h ? v(h.x, h.z) : null
}

/** 座位桌子右側站的位置（E6：本波只有 1 位 dev 時 reviewer 走到這裡） */
export function deskSideAnchor(sessionId: string): Vec3 | null {
  const h = source?.layout.homes[sessionId]
  return h ? v(h.x + 0.9, h.z) : null
}

/** 任務白板前、面向白板站的位置（E6：≥ 2 位 dev） */
export function boardAnchor(taskDir: string): Vec3 | null {
  const b = source?.boards[taskDir]
  return b ? v(b.x, b.z + BOARD_STAND) : null
}

/** 休息區第 i 個位子（沙發 → 咖啡機旁 → 站格） */
export function loungeAnchor(i: number): Vec3 | null {
  const lounge = source?.layout.zones.find((z) => z.kind === 'lounge')
  return lounge ? v(...loungeXZ(lounge.rect, i)) : null
}

function loungeXZ(rect: Rect, i: number): [number, number] {
  if (i < 3) return [rect.x + 5.6 + i * 0.75, rect.z + 1.2]
  if (i < 5) return [rect.x + 1.6 + (i - 3) * 0.9, rect.z + 1.6]
  const k = i - 5
  return [rect.x + 1 + (k % 8), rect.z + 2.8 + Math.floor(k / 8) * 0.9]
}

/** 走道中線的 z（專案區每排前緣的走道），由後往前 */
export function aisleLines(layout: Pick<OfficeLayout, 'zones'>): number[] {
  const rows = new Set<number>()
  for (const z of layout.zones) if (z.kind === 'project') rows.add(z.rect.z)
  if (rows.size === 0) return [PAD / 2]
  return [...rows].sort((a, b) => a - b).map((z) => z + ZONE_D + AISLE / 2)
}

/**
 * 走道中線路徑（不做 A*）：起點 → 起點那排的前緣走道 → 沿走道橫移到終點 x → 終點。
 * 兩點在不同排：先走到起點那排前緣，再沿 x 不變直走到終點那排前緣。
 */
export function walkPath(from: Vec3, to: Vec3): Vec3[] {
  const lines = source ? aisleLines(source.layout) : [PAD / 2]
  return pathVia(lines, from, to)
}

export function pathVia(lines: number[], from: Vec3, to: Vec3): Vec3[] {
  const lineOf = (z: number) => lines.find((l) => z <= l) ?? lines[lines.length - 1]
  const a = lineOf(from[2])
  const b = lineOf(to[2])
  const pts: Vec3[] = [from, v(from[0], a)]
  if (a !== b) pts.push(v(from[0], b))
  pts.push(v(to[0], b), to)
  // 去掉重複點
  return pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[2] - pts[i - 1][2]) > 1e-3)
}

const segLen = (a: Vec3, b: Vec3) => Math.hypot(b[0] - a[0], b[2] - a[2])

export function pathLength(pts: Vec3[]): number {
  let n = 0
  for (let i = 1; i < pts.length; i++) n += segLen(pts[i - 1], pts[i])
  return n
}

/** 走完路徑要多久：照 WALK_SPEED，壓在 max（預設 WALK_MAX_MS；reviewer 用 review-walk-max）內 */
export function pathMs(pts: Vec3[], max = WALK_MAX_MS): number {
  return Math.min(max, (pathLength(pts) / WALK_SPEED) * 1000)
}

/** 路徑上比例 k（0–1）的位置與面向（rotY：0＝面向 +z） */
export function samplePath(pts: Vec3[], k: number): { x: number; z: number; rotY: number } {
  const last = pts[pts.length - 1]
  const total = pathLength(pts)
  let d = Math.min(1, Math.max(0, k)) * total
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const l = segLen(a, b)
    if (l < 1e-6) continue
    if (d <= l || i === pts.length - 1) {
      const t = Math.min(1, d / l)
      return { x: a[0] + (b[0] - a[0]) * t, z: a[2] + (b[2] - a[2]) * t, rotY: Math.atan2(b[0] - a[0], b[2] - a[2]) }
    }
    d -= l
  }
  return { x: last[0], z: last[2], rotY: 0 }
}

/** 角色現在的細狀態與位置；不在場回 null */
export function characterInfo(sessionId: string): CharacterInfo | null {
  const s = source
  const sub = s?.subs[sessionId]
  const home = s?.layout.homes[sessionId]
  const place = s?.layout.places[sessionId]
  return s && sub && home && place ? { substate: sub, home, place } : null
}

// ---- 覆寫 ----

/** motion 用：寫入或清掉（null＝回到細狀態的姿勢與位置）一個角色的覆寫 */
export function setCharacterOverride(id: string, o: CharacterOverride | null): void {
  if (o) overrides.set(id, o)
  else if (!overrides.delete(id)) return
  syncScreenOff()
  emit()
}

export function getCharacterOverride(id: string): CharacterOverride | null {
  return overrides.get(id) ?? null
}

/** 清掉全部覆寫（場景卸載、測試） */
export function clearCharacterOverrides(): void {
  if (overrides.size === 0) return
  overrides.clear()
  syncScreenOff()
  emit()
}

/** Character（scene）讀；回傳同一個物件參照直到被換掉 */
export function useCharacterOverride(id: string): CharacterOverride | null {
  return useSyncExternalStore(subscribe, () => overrides.get(id) ?? null)
}

/** scene 用：座位螢幕要暗的 session（Furniture 讀） */
export function useScreenOffIds(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, () => screenOff)
}

/** 角色頭頂 group（AgentMarker 的錨點）；motion 用 createPortal 把 EventBubble／EventBadge 掛進去 */
export function useCharacterHead(id: string): THREE.Object3D | null {
  return useSyncExternalStore(subscribe, () => heads.get(id) ?? null)
}

/** 錨點來源換了就重 render（motion 的 hook 用） */
export function useAnchorsVersion(): number {
  return useSyncExternalStore(subscribe, () => version)
}
