// 鏡頭（§4.3）：右前方 45°、俯角 35°、fov 30；fit 全部；OrbitControls 俯角 20°–70°、距離 0.4–1.6 倍。

const DEG = Math.PI / 180

export const CAMERA = {
  fov: 30,
  azimuth: 45 * DEG,
  elevation: 35 * DEG,
  /** OrbitControls 的 polar 角（從正上方量）：俯角 70° → 20°、20° → 70° */
  minPolar: 20 * DEG,
  maxPolar: 70 * DEG,
  minRatio: 0.4,
  maxRatio: 1.6,
}

export interface Bounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  /** 預設 2.4（牆高） */
  maxY?: number
}

export interface Fit {
  target: [number, number, number]
  position: [number, number, number]
  distance: number
  minDistance: number
  maxDistance: number
}

/** 讓房間 8 個角都落在畫面內的距離（含 8% 邊距） */
export function fitCamera(b: Bounds, aspect: number, fov = CAMERA.fov): Fit {
  const cx = (b.minX + b.maxX) / 2
  const cz = (b.minZ + b.maxZ) / 2
  const maxY = b.maxY ?? 2.4
  const target: [number, number, number] = [cx, 0, cz]
  // 鏡頭朝向（從 target 指向鏡頭）
  const dir = [Math.cos(CAMERA.elevation) * Math.sin(CAMERA.azimuth), Math.sin(CAMERA.elevation), Math.cos(CAMERA.elevation) * Math.cos(CAMERA.azimuth)]
  // 相機座標軸：right = up × back、up' = back × right
  const back = dir
  const right = norm(cross([0, 1, 0], back))
  const up = cross(back, right)
  const vHalf = Math.tan((fov * DEG) / 2)
  const hHalf = vHalf * aspect
  let distance = 0
  for (const x of [b.minX, b.maxX])
    for (const y of [0, maxY])
      for (const z of [b.minZ, b.maxZ]) {
        const p = [x - cx, y, z - cz]
        const px = dot(p, right)
        const py = dot(p, up)
        const pz = dot(p, back)
        // 點在相機前方深度 = distance - pz；要 |px| ≤ hHalf × 深度、|py| ≤ vHalf × 深度
        distance = Math.max(distance, pz + Math.abs(px) / hHalf, pz + Math.abs(py) / vHalf)
      }
  distance *= 1.08
  const position: [number, number, number] = [cx + dir[0] * distance, dir[1] * distance, cz + dir[2] * distance]
  return { target, position, distance, minDistance: distance * CAMERA.minRatio, maxDistance: distance * CAMERA.maxRatio }
}

type V = number[]
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V, b: V) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: V) => {
  const l = Math.hypot(a[0], a[1], a[2])
  return [a[0] / l, a[1] / l, a[2] / l]
}

/** 飛到角色（review2 I1）：lastNonce 初值是 null，掛上時已存在的 focus 也會飛一次；同一個 nonce 不重飛 */
export function pendingFocus<F extends { nonce: number }>(lastNonce: number | null, focus: F | null): F | null {
  return focus && focus.nonce !== lastNonce ? focus : null
}
