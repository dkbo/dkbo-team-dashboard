// 鏡頭（§4.3）：OrbitControls 限制、自動 fit（使用者動過後不再自動）、飛到指定角色、重設視角；600ms 飛行（reduced motion 直接跳）。
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
// three 本身的 OrbitControls（不經 drei／three-stdlib，AC14 chunk 大小）
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { CAMERA, fitCamera, pendingFocus, type Fit } from './camera'
import { CAMERA_FLY_MS } from './motion'
import type { Tickets } from './tickets'

export interface CameraView {
  distance: number
  fitDistance: number
  camera: THREE.Camera
  size: { width: number; height: number }
}

interface Props {
  room: { w: number; d: number }
  /** 飛過去的目標（世界座標）；nonce 變了才飛 */
  focus: { x: number; z: number; nonce: number } | null
  resetRequest: number
  reducedMotion: boolean
  tickets: Tickets
  onUserMovedCamera(moved: boolean): void
  /** 鏡頭停下（使用者放開、飛完、fit 完）後呼叫一次 */
  onSettled(view: CameraView): void
}

const ease = (k: number) => 1 - Math.pow(1 - k, 3)

export function CameraRig({ room: roomProp, focus, resetRequest, reducedMotion, tickets, onUserMovedCamera, onSettled }: Props) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const gl = useThree((s) => s.gl)
  const eventTarget = useThree((s) => s.events.connected as HTMLElement | undefined)
  const orbit = useMemo(() => {
    const c = new OrbitControls(camera)
    c.enableDamping = false
    c.minPolarAngle = CAMERA.minPolar
    c.maxPolarAngle = CAMERA.maxPolar
    c.screenSpacePanning = false
    return c
  }, [camera])
  const controls = useRef<OrbitControls | null>(orbit)
  controls.current = orbit
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const st = useRef({
    moved: false,
    interacting: false,
    fit: null as Fit | null,
    fly: null as null | { fromPos: THREE.Vector3; fromTarget: THREE.Vector3; toPos: THREE.Vector3; toTarget: THREE.Vector3; start: number },
    lastReset: resetRequest,
    // null：掛上時已有的 focus（開頁帶 ?focus=）也要在 fit 之後飛一次
    lastFocus: null as number | null,
  })
  const cb = useRef({ onUserMovedCamera, onSettled })
  const room = useRef(roomProp)
  room.current = roomProp
  cb.current = { onUserMovedCamera, onSettled }

  const settle = () => {
    const c = controls.current
    const fit = st.current.fit
    if (!c || !fit) return
    cb.current.onSettled({ distance: camera.position.distanceTo(c.target), fitDistance: fit.distance, camera, size })
  }

  const flyTo = (pos: THREE.Vector3, target: THREE.Vector3) => {
    const c = controls.current
    if (!c) return
    if (reducedMotion) {
      camera.position.copy(pos)
      c.target.copy(target)
      c.update()
      invalidate()
      settle()
      return
    }
    st.current.fly = { fromPos: camera.position.clone(), fromTarget: c.target.clone(), toPos: pos, toTarget: target, start: performance.now() }
    tickets.holdFor(CAMERA_FLY_MS + 50)
    invalidate()
  }

  const fitAll = (animate: boolean) => {
    const fit = fitCamera({ minX: 0, maxX: roomProp.w, minZ: 0, maxZ: roomProp.d }, size.width / Math.max(size.height, 1))
    st.current.fit = fit
    const c = controls.current
    if (c) {
      c.minDistance = fit.minDistance
      c.maxDistance = fit.maxDistance
    }
    const pos = new THREE.Vector3(...fit.position)
    const target = new THREE.Vector3(...fit.target)
    if (!animate || !c) {
      camera.position.copy(pos)
      camera.lookAt(target)
      if (c) {
        c.target.copy(target)
        c.update()
      }
      invalidate()
      settle()
    } else flyTo(pos, target)
  }

  // 首次與房間大小、畫面比例變了：使用者沒動過才自動 fit
  const first = useRef(true)
  useLayoutEffect(() => {
    const fit = fitCamera({ minX: 0, maxX: roomProp.w, minZ: 0, maxZ: roomProp.d }, size.width / Math.max(size.height, 1))
    st.current.fit = fit
    if (controls.current) {
      controls.current.minDistance = fit.minDistance
      controls.current.maxDistance = fit.maxDistance
    }
    if (first.current || !st.current.moved) fitAll(!first.current)
    else settle()
    first.current = false
  }, [roomProp.w, roomProp.d, size.width, size.height])

  // 重設視角
  useEffect(() => {
    if (resetRequest === st.current.lastReset) return
    st.current.lastReset = resetRequest
    st.current.moved = false
    cb.current.onUserMovedCamera(false)
    fitAll(true)
  }, [resetRequest])

  // 飛到角色：保持目前方向，距離 fit 的 0.55 倍
  useEffect(() => {
    const f = pendingFocus(st.current.lastFocus, focus)
    const c = controls.current
    const fit = st.current.fit
    if (!f || !c || !fit) return
    st.current.lastFocus = f.nonce
    const target = new THREE.Vector3(f.x, 0, f.z)
    const dir = camera.position.clone().sub(c.target).normalize()
    const pos = target.clone().add(dir.multiplyScalar(Math.max(fit.minDistance, fit.distance * 0.55)))
    st.current.moved = true
    cb.current.onUserMovedCamera(true)
    flyTo(pos, target)
  }, [focus?.nonce])

  useFrame(() => {
    const f = st.current.fly
    const c = controls.current
    if (!f || !c) return
    const k = Math.min(1, (performance.now() - f.start) / CAMERA_FLY_MS)
    const e = ease(k)
    camera.position.lerpVectors(f.fromPos, f.toPos, e)
    c.target.lerpVectors(f.fromTarget, f.toTarget, e)
    c.update()
    if (k >= 1) {
      st.current.fly = null
      settle()
    }
  })

  const settleRef = useRef(settle)
  settleRef.current = settle

  // 掛上 DOM 事件；start／change／end 對應 drei 的 onStart／onChange／onEnd
  useEffect(() => {
    const c = orbit
    c.connect(eventTarget ?? gl.domElement)
    const onStart = () => {
      st.current.fly = null
      st.current.interacting = true
    }
    const onChange = () => {
      // 真的拖過或縮放過才算動過（單純點角色不算）
      if (st.current.interacting && !st.current.moved) {
        st.current.moved = true
        cb.current.onUserMovedCamera(true)
      }
      // 平移不出房間
      const t = c.target
      const cx = THREE.MathUtils.clamp(t.x, 0, room.current.w)
      const cz = THREE.MathUtils.clamp(t.z, 0, room.current.d)
      if (cx !== t.x || cz !== t.z || t.y !== 0) {
        camera.position.x += cx - t.x
        camera.position.z += cz - t.z
        camera.position.y -= t.y
        t.set(cx, 0, cz)
      }
      invalidate()
    }
    const onEnd = () => {
      st.current.interacting = false
      settleRef.current()
    }
    c.addEventListener('start', onStart)
    c.addEventListener('change', onChange)
    c.addEventListener('end', onEnd)
    return () => {
      c.removeEventListener('start', onStart)
      c.removeEventListener('change', onChange)
      c.removeEventListener('end', onEnd)
      c.dispose()
    }
  }, [orbit, eventTarget, gl])

  return null
}
