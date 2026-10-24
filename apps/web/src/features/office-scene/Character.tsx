// 一個角色（§6.4、E15）：模型 useGLTF 只載一次、每人 SkeletonUtils.clone（共用 geometry 與 material）；
// 狀態改變（即時）播 6 秒後停在關鍵影格、hover／選取中持續動；位置變了（即時）走過去，否則直接出現在目的地。
import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useGLTF } from './gltf'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { Substate } from '@dash/shared'
import { addClothMask } from './cloth'
import type { Place } from './layout'
import type { SceneMaterials } from './materials'
import type { ClipName } from './model-map'
import { ANIMATION_MS, actionFor, shouldAnimate, walkMs, type Action } from './motion'
import type { Tickets } from './tickets'

/** 角色身高（格）；Kenney Mini Characters 原始約 0.55 */
export const CHAR_HEIGHT = 1.05
/** Kenney 的 sit clip 是坐在地上（root 下沉）；坐椅子時整個人抬高到椅面 */
export const SEAT_LIFT = 0.3
/** 頭頂（標記錨點）：站著／坐著 */
export const HEAD_Y = { stand: CHAR_HEIGHT + 0.08, sit: CHAR_HEIGHT * 0.78 + SEAT_LIFT }

interface Prepared {
  scale: number
  /** 只動手臂的打字 clip（坐著打字：sit 疊手臂） */
  armsType: THREE.AnimationClip | null
}

function prepare(gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }, typeName: string | null): Prepared {
  const ud = gltf.scene.userData as { prepared?: Prepared }
  if (ud.prepared) return ud.prepared
  gltf.scene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh && o.name === 'body-mesh') addClothMask(o as THREE.SkinnedMesh)
  })
  const box = new THREE.Box3().setFromObject(gltf.scene)
  const type = typeName ? gltf.animations.find((a) => a.name === typeName) : undefined
  const armsType = type ? new THREE.AnimationClip(`${type.name}-arms`, type.duration, type.tracks.filter((t) => t.name.startsWith('arm-'))) : null
  ud.prepared = { scale: CHAR_HEIGHT / Math.max(box.max.y - box.min.y, 1e-6), armsType }
  return ud.prepared
}

export interface CharacterProps {
  id: string
  url: string
  clips: Record<ClipName, string | null>
  substate: Substate
  place: Place
  bodyMaterial: THREE.Material
  headMaterial: THREE.Material
  mats: SceneMaterials
  focused: boolean
  selected: boolean
  alert: boolean
  visitor: boolean
  reducedMotion: boolean
  /** 現在的變化是不是即時的（首次載入、切回分頁＝false，E7） */
  isLive(): boolean
  tickets: Tickets
  /** 位置更新後通知（接觸陰影 instanced、陰影重算） */
  onMoved(id: string, x: number, z: number, settled: boolean): void
  onSelect(id: string): void
  onHover(id: string | null): void
  children?: ReactNode
}

// 等你／錯誤的地面圈與紅煙是 instanced（Decor.tsx），這裡只畫選取圈（同時最多一個）
const RING = {
  select: new THREE.RingGeometry(0.57, 0.67, 48),
  selectInner: new THREE.RingGeometry(0.4, 0.5, 48),
  badge: new THREE.BoxGeometry(0.05, 0.07, 0.01),
}

export function Character(props: CharacterProps) {
  const { id, url, clips, substate, place, bodyMaterial, headMaterial, mats, focused, selected, alert, visitor, reducedMotion, isLive, tickets, onMoved } = props
  const gltf = useGLTF(url)
  const prepared = prepare(gltf, clips.type)
  const invalidate = useThree((s) => s.invalidate)

  const rig = useMemo(() => {
    const root = cloneSkinned(gltf.scene)
    const bones: Record<string, THREE.Object3D> = {}
    const meshes: THREE.SkinnedMesh[] = []
    root.traverse((o) => {
      if ((o as THREE.Bone).isBone || o.name === 'torso' || o.name === 'head') bones[o.name] = o
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) {
        const m = o as THREE.SkinnedMesh
        m.castShadow = true
        m.frustumCulled = false
        meshes.push(m)
      }
    })
    const mixer = new THREE.AnimationMixer(root)
    return { root, bones, meshes, mixer }
  }, [gltf])

  useLayoutEffect(() => {
    for (const m of rig.meshes) m.material = m.name === 'body-mesh' ? bodyMaterial : headMaterial
    invalidate()
  }, [rig, bodyMaterial, headMaterial, invalidate])

  // 訪客：胸前白色識別證（不只靠衣服顏色分辨，§1.6）
  useLayoutEffect(() => {
    const torso = rig.bones.torso
    if (!visitor || !torso) return
    const badge = new THREE.Mesh(RING.badge, mats.board)
    badge.position.set(0, 0.07, 0.095)
    torso.add(badge)
    invalidate()
    return () => void torso.remove(badge)
  }, [rig, visitor, mats.board, invalidate])

  const clip = (name: ClipName) => {
    const real = clips[name] ?? clips.idle
    return real ? gltf.animations.find((a) => a.name === real) ?? null : null
  }

  const state = useRef({
    action: null as Action | null,
    playing: false,
    playUntil: 0,
    walk: null as null | { from: THREE.Vector3; to: THREE.Vector3; start: number; ms: number },
    prevSub: undefined as Substate | undefined,
    prevPlace: null as Place | null,
    group: null as THREE.Group | null,
    t: 0,
  })

  /** 擺姿勢：playing＝讓 mixer 跑，否則停在關鍵影格 */
  const pose = (action: Action, playing: boolean) => {
    const { mixer } = rig
    mixer.stopAllAction()
    const layers: { c: THREE.AnimationClip; k: number }[] = []
    if (action.seated) {
      const sit = clip('sit')
      if (sit) layers.push({ c: sit, k: 0 })
      if (action.clip === 'type' && prepared.armsType) layers.push({ c: prepared.armsType, k: action.keyframe })
    } else {
      const c = clip(action.clip)
      if (c) layers.push({ c, k: action.keyframe })
    }
    for (const { c, k } of layers) {
      const a = mixer.clipAction(c)
      a.reset()
      a.setLoop(action.loop || playing ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
      a.clampWhenFinished = true
      a.timeScale = action.speed
      a.time = k * c.duration
      a.paused = !playing
      a.play()
    }
    mixer.update(0)
    procedural(action, 0)
    state.current.action = action
    state.current.playing = playing
  }

  /** clip 沒有的動作用骨頭補：趴桌、托下巴左右看、打瞌睡 */
  const procedural = (action: Action, t: number) => {
    const head = rig.bones.head
    const torso = rig.bones.torso
    if (action.slump) {
      torso?.rotateX(0.35)
      head?.rotateX(0.45)
    }
    if (action.think) head?.rotateY((8 * Math.PI) / 180 * (state.current.playing ? Math.sin(t * 2) : 1))
    if (action.doze) head?.rotateX(0.3)
  }

  const live = () => isLive() && !reducedMotion && document.visibilityState === 'visible'

  // 細狀態或位置變了
  useLayoutEffect(() => {
    const st = state.current
    const g = st.group
    if (!g) return
    const action = actionFor(substate, place.area)
    const prev = st.prevPlace
    const moved = prev != null && (Math.abs(prev.x - place.x) > 1e-3 || Math.abs(prev.z - place.z) > 1e-3)
    const isLiveNow = live()
    if (moved && isLiveNow) {
      const from = g.position.clone()
      const to = new THREE.Vector3(place.x, 0, place.z)
      const ms = walkMs({ x: from.x, z: from.z }, { x: to.x, z: to.z })
      st.walk = { from, to, start: performance.now(), ms }
      g.rotation.y = Math.atan2(to.x - from.x, to.z - from.z)
      const w = clip('walk')
      rig.mixer.stopAllAction()
      if (w) rig.mixer.clipAction(w).reset().setLoop(THREE.LoopRepeat, Infinity).play()
      st.playing = true
      tickets.holdFor(ms + 50)
    } else {
      st.walk = null
      g.position.set(place.x, 0, place.z)
      g.rotation.y = place.rotY
      onMoved(id, place.x, place.z, true)
      const animate = shouldAnimate({ prev: st.prevSub, next: substate, live: isLiveNow })
      if (animate) {
        st.playUntil = performance.now() + ANIMATION_MS
        tickets.holdFor(ANIMATION_MS)
      }
      pose(action, animate || (focused && !reducedMotion) || performance.now() < st.playUntil)
    }
    st.prevSub = substate
    st.prevPlace = place
    invalidate()
  }, [substate, place.x, place.z, place.rotY, place.pose, place.area, rig])

  // hover／選取中持續動（E15）
  useEffect(() => {
    if (!focused || reducedMotion) return
    const st = state.current
    const release = tickets.hold()
    if (!st.walk && st.action) pose(st.action, true)
    return () => {
      release()
      if (!st.walk && st.action && performance.now() >= st.playUntil) pose(st.action, false)
      invalidate()
    }
  }, [focused, reducedMotion, rig])

  useEffect(() => () => void rig.mixer.stopAllAction(), [rig])

  useFrame((_, dt) => {
    const st = state.current
    const g = st.group
    if (!g) return
    const now = performance.now()
    if (st.walk) {
      const k = Math.min(1, (now - st.walk.start) / Math.max(st.walk.ms, 1))
      g.position.lerpVectors(st.walk.from, st.walk.to, k)
      rig.mixer.update(dt)
      onMoved(id, g.position.x, g.position.z, k >= 1)
      if (k >= 1) {
        st.walk = null
        g.rotation.y = place.rotY
        const action = actionFor(substate, place.area)
        pose(action, focused && !reducedMotion)
      }
      return
    }
    if (!st.playing || !st.action) return
    st.t += dt
    rig.mixer.update(dt)
    procedural(st.action, st.t)
    if (!(focused && !reducedMotion) && now >= st.playUntil) pose(st.action, false)
  })

  const headY = place.pose === 'sit' ? HEAD_Y.sit : HEAD_Y.stand
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    props.onSelect(id)
  }
  return (
    <group
      ref={(g) => void (state.current.group = g)}
      onClick={click}
      onPointerOver={(e) => {
        e.stopPropagation()
        props.onHover(id)
      }}
      onPointerOut={() => props.onHover(null)}
    >
      <primitive object={rig.root} scale={prepared.scale} position-y={place.pose === 'sit' ? SEAT_LIFT : 0} position-z={place.pose === 'sit' ? -0.08 : 0} />
      {selected && (
        <mesh geometry={alert ? RING.selectInner : RING.select} material={mats.ringSelect} position-y={0.014} rotation-x={-Math.PI / 2} renderOrder={4} />
      )}
      <group position-y={headY}>{props.children}</group>
    </group>
  )
}
