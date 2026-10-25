// 白板事件特效（§6.17）：波關閉的星點（DOM，animate-spark；reduced motion 由 CSS 藏起）與結案彩帶（3D，brand 三色）。
// 只在播放期間掛著；動畫票由 runtime 持有，這裡不另外拿。
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { Sparkles } from 'lucide-react'
import { readCssVar } from '../colors'
import type { Vec3 } from '../anchors'

/** boardAnchor 是白板前站的位置；白板本身在後面這麼遠（格） */
const BOARD_BACK = 0.7
/** 白板上緣高度（格） */
const BOARD_TOP = 1.9

const SPARKS = [
  { cls: 'left-0 top-0 text-brand-violet', delay: 0 },
  { cls: 'left-6 -top-3 text-brand-blue', delay: 150 },
  { cls: '-left-6 -top-2 text-brand-coral', delay: 300 },
] as const

export function BoardSpark({ at }: { at: Vec3 }) {
  return (
    <Html position={[at[0], BOARD_TOP, at[2] - BOARD_BACK]} zIndexRange={[99, 0]}>
      <div data-slot="board-spark" aria-hidden className="pointer-events-none relative size-0">
        {SPARKS.map((s, i) => (
          <Sparkles key={i} className={`absolute size-4 animate-spark ${s.cls}`} style={{ animationDelay: `${s.delay}ms` }} />
        ))}
      </div>
    </Html>
  )
}

const PIECES = 60
const GRAVITY = -3.2
const BRAND = ['--brand-violet', '--brand-blue', '--brand-coral'] as const

interface Piece {
  p: THREE.Vector3
  v: THREE.Vector3
  spin: THREE.Vector3
}

/** 彩帶（motion-celebrate）：一個 InstancedMesh，60 片從白板上方往外噴、落下 */
export function Confetti({ at, ms }: { at: Vec3; ms: number }) {
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.2, 0.32),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true }),
      PIECES,
    )
    m.frustumCulled = false
    const colors = BRAND.map((n) => {
      const c = readCssVar(n)
      return c ? new THREE.Color().setRGB(c.r, c.g, c.b, THREE.SRGBColorSpace) : new THREE.Color()
    })
    for (let i = 0; i < PIECES; i++) m.setColorAt(i, colors[i % colors.length])
    return m
  }, [])
  useEffect(
    () => () => {
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    },
    [mesh],
  )
  // 只在掛上時取一次起點（at 每次 render 都是新陣列）
  const [pieces] = useState<Piece[]>(
    () =>
      Array.from({ length: PIECES }, () => {
        const a = Math.random() * Math.PI * 2
        const r = 0.6 + Math.random() * 1.2
        return {
          p: new THREE.Vector3(at[0], BOARD_TOP + 0.3, at[2] - BOARD_BACK + 0.2),
          v: new THREE.Vector3(Math.cos(a) * r, 2.2 + Math.random() * 1.6, Math.sin(a) * r * 0.6 + 0.4),
          spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8),
        }
      }),
  )
  const start = useRef<number | null>(null)
  const o = useMemo(() => new THREE.Object3D(), [])
  useFrame(() => {
    const now = performance.now()
    start.current ??= now
    const t = (now - start.current) / 1000
    const k = Math.min(1, (now - start.current) / ms)
    for (let i = 0; i < PIECES; i++) {
      const q = pieces[i]
      o.position.set(q.p.x + q.v.x * t, Math.max(0.02, q.p.y + q.v.y * t + 0.5 * GRAVITY * t * t), q.p.z + q.v.z * t)
      o.rotation.set(q.spin.x * t, q.spin.y * t, q.spin.z * t)
      o.updateMatrix()
      mesh.setMatrixAt(i, o.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    ;(mesh.material as THREE.MeshBasicMaterial).opacity = k < 0.8 ? 1 : (1 - k) / 0.2
  })
  return <primitive object={mesh} />
}
