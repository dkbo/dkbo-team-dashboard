// 角色動作（§6.4、E15）：細狀態 → clip 與停格；只有即時變化才播 6 秒（E7）。
import type { Substate } from '@dash/shared'
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
