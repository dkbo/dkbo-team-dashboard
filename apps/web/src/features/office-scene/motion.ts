// 角色動作（§6.4、E15）：細狀態 → clip 與停格；只有即時變化才播 6 秒（E7）。
import type { Substate } from '@dash/shared'
import type { OverrideGesture } from './anchors'
import type { Area } from './layout'
import type { ClipName } from './model-map'

/** 狀態改變後播動作的時間（E15） */
export const ANIMATION_MS = 6000
/** motion-walk：1.2 格／秒 */
export const WALK_SPEED = 1.2
/** theme-lerp */
export const THEME_LERP_MS = 400
/** motion-camera-fly */
export const CAMERA_FLY_MS = 600

export interface Action {
  clip: ClipName
  /** 播放速度倍數（writing 0.6） */
  speed: number
  loop: boolean
  /** 停下來時停在 clip 的哪個位置（0–1） */
  keyframe: number
  /** 坐著（座位上） */
  seated: boolean
  /** 錯誤：頭前傾趴桌（自訂 pose） */
  slump?: boolean
  /** 思考：手托下巴、頭左右擺 */
  think?: boolean
  /** 閒置：頭低、呼吸 */
  doze?: boolean
  /** 事件：點頭（leader，波關閉） */
  nod?: boolean
  /** 事件：雙手在胸前拿板子、低頭看板（reviewer 等 verdict） */
  board?: boolean
  /** 事件：比讚（站姿、舉手的那一格） */
  thumb?: boolean
}

const A = (clip: ClipName, over: Partial<Action> = {}): Action => ({ clip, speed: 1, loop: true, keyframe: 0.25, seated: true, ...over })

export function actionFor(substate: Substate, area: Area): Action {
  if (area === 'lounge') return substate === 'done' ? A('idle', { seated: false, keyframe: 0 }) : A('idle', { seated: false })
  switch (substate) {
    case 'waiting':
      return A('wave', { seated: false, keyframe: 0.3 })
    case 'running':
      return A('type')
    case 'writing':
      return A('type', { speed: 0.6 })
    case 'thinking':
      return A('idle', { think: true, keyframe: 0 })
    case 'interrupted':
      return A('type', { keyframe: 0, loop: false })
    case 'error':
      return A('sit', { slump: true, keyframe: 0 })
    case 'done':
      return A('idle', { seated: false, keyframe: 0 })
    case 'idle':
      return A('sit', { doze: true, keyframe: 0 })
  }
}

/** 只有 SSE 即時收到的變化才播；首次載入、重連、切回分頁（live=false）直接畫最終狀態 */
export function shouldAnimate({ prev, next, live }: { prev: Substate | undefined; next: Substate; live: boolean }): boolean {
  return live && prev !== undefined && prev !== next
}

/** 走路最長多久：路太長就加速（同 review-walk-max 的精神），讓「最後一次 SSE 後 7 秒」一定已經靜止（AC11） */
export const WALK_MAX_MS = 6000

export function walkMs(from: { x: number; z: number }, to: { x: number; z: number }): number {
  return Math.min(WALK_MAX_MS, (Math.hypot(to.x - from.x, to.z - from.z) / WALK_SPEED) * 1000)
}

/** 事件動作播多久（之後停在關鍵影格）；0＝靜態姿勢 */
export const GESTURE_MS: Record<OverrideGesture, number> = {
  stand: 0,
  'hold-board': 0,
  'thumbs-up': 1500,
  'head-down': 2000,
  nod: 1200,
  // jump × 2（Kenney jump clip 約 0.8 秒）
  jump: 1700,
  wave: 2500,
}

/** 這些動作一定站著做（§6.17：比讚、站起 jump、拿板子、揮手） */
const STAND_GESTURES: ReadonlySet<OverrideGesture> = new Set(['thumbs-up', 'jump', 'hold-board', 'wave'])

/**
 * 覆寫期間坐不坐（波 2 審查 I2）：看人「現在」在不在座位上（away＝離細狀態該在的位置有距離），
 * 不是只看細狀態的 place.pose；要站著做的動作在座位上也站起來。
 */
export function overrideSeated({ gesture, hasPath, away, placePose }: { gesture: OverrideGesture; hasPath: boolean; away: boolean; placePose: 'sit' | 'stand' }): boolean {
  return placePose === 'sit' && !hasPath && !away && !STAND_GESTURES.has(gesture)
}

/** 覆寫（共用契約「場景錨點」）的動作 → 姿勢；seated＝人還在座位上（沒有走開） */
export function gestureAction(gesture: OverrideGesture, seated: boolean): Action {
  switch (gesture) {
    case 'stand':
      return A('idle', { seated: false, keyframe: 0 })
    case 'hold-board':
      return A('type', { seated: false, keyframe: 0.45, loop: false, board: true })
    case 'thumbs-up':
      // 比讚一律站起來（overrideSeated）；舉手 clip 停在手最高的那格
      return A('wave', { seated: false, keyframe: 0.5, loop: false, thumb: true })
    case 'head-down':
      return seated ? A('sit', { slump: true, keyframe: 0 }) : A('idle', { seated: false, slump: true, keyframe: 0 })
    case 'nod':
      return seated ? A('sit', { nod: true, keyframe: 0 }) : A('idle', { seated: false, nod: true, keyframe: 0 })
    case 'jump':
      return A('cheer', { seated: false, keyframe: 0 })
    case 'wave':
      return A('wave', { seated: false, keyframe: 0.3 })
  }
}
