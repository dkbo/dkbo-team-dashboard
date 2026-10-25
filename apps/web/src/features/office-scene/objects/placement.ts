// 頁面物件的座標（§4.6）、標籤密度（E2 修正版）與碰撞讓位（§6.14）。純函式；只在鏡頭停下後算一次。
import type { LabelDensity, LabelYield } from '@/components/app/office'
import { BASE_W, type OfficeLayout } from '../layout'
import { MIN_MARKER_SCALE } from '../markers'

export type Vec3 = [number, number, number]
export type FixedKind = 'monitor' | 'archive' | 'git' | 'notice' | 'meter'
export type ObjectKind = FixedKind | 'board'

export interface ObjectPlace {
  /** 底面中心（y＝0） */
  center: Vec3
  /** w × h × d（格） */
  size: Vec3
  /** 標籤錨點（世界座標） */
  label: Vec3
  placement: 'above' | 'below'
  align: 'center' | 'end' | 'start'
}

/** §4.6 尺寸 */
export const OBJECT_SIZE = {
  monitor: [3.0, 1.2, 0.02] as Vec3,
  archive: [3.4, 1.9, 0.5] as Vec3,
  git: [0.8, 1.2, 0.6] as Vec3,
  notice: [1.6, 1.0, 0.06] as Vec3,
  meter: [0.5, 0.6, 0.3] as Vec3,
  board: [1.8, 1.1, 0.06] as Vec3,
}
/** 離地高（板面／螢幕／電表箱的下緣） */
export const OBJECT_LIFT = { monitor: 0.9, notice: 0.75, meter: 0.85, board: 0.6 }
/** git 櫃頂燈 */
export const LAMP_H = 0.2
/** 標籤錨點離物件頂的空隙 */
const GAP = 0.08

export function objectPlacements(layout: Pick<OfficeLayout, 'officeW' | 'zones' | 'boards'>): {
  fixed: Record<FixedKind, ObjectPlace>
  boards: Record<string, ObjectPlace>
} {
  // 大廳在辦公區右側；辦公區比 20 寬（3 區並排）時整個大廳跟著右移，z 不隨擴張改變
  const dx = layout.officeW - BASE_W
  const lounge = layout.zones.find((z) => z.kind === 'lounge')!.rect
  const top = (kind: keyof typeof OBJECT_LIFT) => OBJECT_LIFT[kind] + OBJECT_SIZE[kind][1] + GAP
  const fixed: Record<FixedKind, ObjectPlace> = {
    monitor: { center: [22.1 + dx, 0, 0.06], size: OBJECT_SIZE.monitor, label: [22.1 + dx, top('monitor'), 0.1], placement: 'above', align: 'end' },
    archive: { center: [22.2 + dx, 0, 4.2], size: OBJECT_SIZE.archive, label: [22.2 + dx, OBJECT_SIZE.archive[1] + GAP, 4.2], placement: 'above', align: 'center' },
    git: { center: [20.6 + dx, 0, 6.4], size: OBJECT_SIZE.git, label: [20.6 + dx, 0, 6.4 + OBJECT_SIZE.git[2] / 2 + 0.1], placement: 'below', align: 'start' },
    // 審查 I3：git 櫃下與公告板頂的錨點在預設鏡頭下投影幾乎同高，擺放時就排開——git 往右、公告板往左
    notice: { center: [21 + dx, 0, 11.4], size: OBJECT_SIZE.notice, label: [21 + dx, top('notice'), 11.4], placement: 'above', align: 'end' },
    meter: {
      center: [lounge.x + 3.8, 0, lounge.z + 0.8],
      size: OBJECT_SIZE.meter,
      label: [lounge.x + 3.8, top('meter'), lounge.z + 0.8],
      placement: 'above',
      align: 'center',
    },
  }
  const boards: Record<string, ObjectPlace> = {}
  for (const [dir, b] of Object.entries(layout.boards)) {
    // process 12:30 ruling（偏離 §4.6 的「板頂中央上方」）：板頂錨點正落在 leader 頭頂標記上，改掛板下中央、三角朝上
    boards[dir] = { center: [b.x, 0, b.z], size: OBJECT_SIZE.board, label: [b.x, OBJECT_LIFT.board, b.z + OBJECT_SIZE.board[2] / 2], placement: 'below', align: 'center' }
  }
  return { fixed, boards }
}

/** 拉近到 fit 距離 × 0.8 以內用 full */
export const FULL_AT = 0.8

/**
 * E2 密度：預設視角（fit）compact；拉近到 ≤ fit 距離 × 0.8 full；
 * 遠到一般標記會縮成點（同 markers.ts 的縮放、< 0.6）時只留有異常的物件。
 */
export function labelDensity({ distance, fitDistance, base }: { distance: number; fitDistance: number; base: number }): LabelDensity {
  if (distance <= fitDistance * FULL_AT + 1e-9) return 'full'
  const scale = (base * fitDistance) / Math.max(distance, 1e-6)
  return scale < MIN_MARKER_SCALE - 1e-9 ? 'alert-only' : 'compact'
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** 指向三角 6px＋留白 */
const POINTER = 6

/** 標籤在螢幕上的框（anchor＝錨點投影，px）；end／start 往內推（三角留在錨點，見 ObjectLabel 的 ALIGN） */
export function labelBox(anchor: { x: number; y: number }, size: { w: number; h: number }, placement: 'above' | 'below', align: 'center' | 'end' | 'start'): Box {
  const x = align === 'center' ? anchor.x - size.w / 2 : align === 'end' ? anchor.x + 16 - size.w : anchor.x - 16
  // 框含指向三角：三角尖端就在錨點
  const y = placement === 'above' ? anchor.y - POINTER - size.h : anchor.y
  return { x, y, w: size.w, h: size.h + POINTER }
}

const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/**
 * §6.14 碰撞讓位：物件標籤撞到角色標記（或排在前面、已保留的物件標籤）→ 縮成點；點也撞到 → 隱藏。
 * 角色標記永遠優先，物件標籤彼此依傳入順序。
 */
export function resolveLabelYield(labels: (Box & { id: string; dot: Box; abnormal?: boolean })[], markers: Box[], fixed: Box[] = []): Record<string, LabelYield> {
  const out: Record<string, LabelYield> = {}
  // 角色標記：所有物件標籤都讓（§6.14）。區牌與其他物件標籤：靠擺放排開，只拿來收沒異常的標籤（審查 I3：不得藏異常）
  const kept: Box[] = [...fixed]
  const blocked = (b: Box, abnormal: boolean) => markers.some((m) => overlap(m, b)) || (!abnormal && kept.some((k) => overlap(k, b)))
  for (const l of labels) {
    const abnormal = l.abnormal ?? false
    if (!blocked(l, abnormal)) {
      out[l.id] = 'none'
      kept.push(l)
    } else if (!blocked(l.dot, abnormal)) {
      out[l.id] = 'dot'
      kept.push(l.dot)
    } else out[l.id] = 'hidden'
  }
  return out
}

/** 白板標籤的讓位（審查 I4）：遠到 alert-only 時沒有異常的白板收掉，其餘照讓位結果 */
export function boardYield(density: LabelDensity, tone: 'danger' | 'warn' | null, y: LabelYield): LabelYield {
  return density === 'alert-only' && !tone ? 'hidden' : y
}

/** 估計文字寬（px）：CJK 12、其他 7.5（text-xs／2xs 的近似；DOM 量到之前用） */
export const textW = (s: string) => [...s].reduce((n, ch) => n + (ch.charCodeAt(0) > 0x2e80 ? 12 : 7.5), 0)
