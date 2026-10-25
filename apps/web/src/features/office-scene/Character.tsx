// 一個角色（§6.4、E15）：模型 useGLTF 只載一次、每人 SkeletonUtils.clone（共用 geometry 與 material）；
// 狀態改變（即時）播 6 秒後停在關鍵影格、hover／選取中持續動；位置變了（即時）走過去，否則直接出現在目的地。
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useGLTF } from './gltf'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { Substate } from '@dash/shared'
import { addClothMask } from './cloth'
import type { Place } from './layout'
import type { SceneMaterials } from './materials'
import type { ClipName } from './model-map'
import { ANIMATION_MS, actionFor, GESTURE_MS, gestureAction, overrideSeated, shouldAnimate, type Action } from './motion'
import { pathMs, registerCharacterHead, samplePath, useCharacterOverride, walkPath, type CharacterOverride, type Vec3 } from './anchors'
import { animatedBones, applyProcedural, captureRest } from './procedural'
import type { Tickets } from './tickets'

/** 角色身高（格）；Kenney Mini Characters 原始約 0.55 */
export const CHAR_HEIGHT = 1.05
/** Kenney 的 sit clip 是坐在地上（root 下沉）；坐椅子時整個人抬高到椅面 */
export const SEAT_LIFT = 0.3
/** 頭頂（標記錨點）：站著／坐著 */
/** 離細狀態位置這麼近（格）才算「還在座位上」 */
const AT_SEAT = 0.05
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
    // mixer 還沒動過，此刻的 head／torso 就是 rest pose（見 procedural.ts）
    return { root, bones, meshes, mixer, rest: captureRest(bones) }
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
    /** 走路中：沿 pts 走，ms 走完；toOverride＝走完擺覆寫的動作，否則擺細狀態姿勢 */
    walk: null as null | { pts: Vec3[]; start: number; ms: number; toOverride: boolean },
    /** 目前生效的覆寫（共用契約「場景錨點」） */
    ov: null as CharacterOverride | null,
    prevSub: undefined as Substate | undefined,
    prevPlace: null as Place | null,
    group: null as THREE.Group | null,
    t: 0,
    /** 目前這個姿勢的 clip 有軌道的骨頭（procedural 不去動它們） */
    animated: new Set<string>(),
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
    state.current.action = action
    state.current.playing = playing
    state.current.animated = animatedBones(layers.map((l) => l.c))
    mixer.update(0)
    procedural(action, 0)
  }

  /** clip 沒有的動作用骨頭補：趴桌、托下巴左右看、打瞌睡（絕對偏移，見 procedural.ts） */
  const procedural = (action: Action, t: number) => {
    const st = state.current
    applyProcedural(action, rig.bones, rig.rest, t, st.playing, st.animated)
  }

  const live = () => isLive() && !reducedMotion && document.visibilityState === 'visible'

  /** 走路中、或覆寫要站著（離座、比讚、跳…）：不套坐姿的抬高與後移 */
  const [standing, setStanding] = useState(false)

  /** 沿 pts 走（直線就是兩點）；走路期間拿票 */
  const startWalk = (pts: Vec3[], ms: number, toOverride: boolean) => {
    const st = state.current
    setStanding(true)
    ms = ms || pathMs(pts)
    st.walk = { pts, start: performance.now(), ms, toOverride }
    st.group!.rotation.y = samplePath(pts, 0).rotY
    const w = clip('walk')
    rig.mixer.stopAllAction()
    if (w) rig.mixer.clipAction(w).reset().setLoop(THREE.LoopRepeat, Infinity).play()
    st.playing = true
    tickets.holdFor(ms + 50)
  }

  /**
   * 覆寫的動作：人還在座位上、且動作可以坐著做才用坐姿版本（審查 I2：看人現在在哪，不是只看細狀態的 place.pose；
   * 比讚、跳、拿板子、揮手一律站起來）；靜態姿勢（stand／hold-board）不拿票
   */
  const applyGesture = (o: CharacterOverride) => {
    const st = state.current
    const g = st.group!
    const gesture = o.gesture ?? 'stand'
    const away = Math.hypot(g.position.x - place.x, g.position.z - place.z) > AT_SEAT
    const seated = overrideSeated({ gesture, hasPath: (o.path?.length ?? 0) > 0, away, placePose: place.pose })
    setStanding(!seated)
    if (o.rotY != null) g.rotation.y = o.rotY
    if (seated && gesture === 'stand') {
      pose(actionFor(substate, place.area), false)
      return
    }
    const ms = reducedMotion ? 0 : GESTURE_MS[gesture]
    if (ms > 0) {
      st.playUntil = performance.now() + ms
      tickets.holdFor(ms)
    }
    pose(gestureAction(gesture, seated), ms > 0)
  }

  /** 放到細狀態該在的位置與姿勢 */
  const settle = (animate: boolean) => {
    const st = state.current
    const g = st.group!
    setStanding(false)
    g.position.set(place.x, 0, place.z)
    g.rotation.y = place.rotY
    onMoved(id, place.x, place.z, true)
    if (animate) {
      st.playUntil = performance.now() + ANIMATION_MS
      tickets.holdFor(ANIMATION_MS)
    }
    pose(actionFor(substate, place.area), animate || (focused && !reducedMotion) || performance.now() < st.playUntil)
  }

  // 覆寫（motion 寫）：走到路徑終點擺動作；清掉時走回（或直接回）細狀態的位置與姿勢
  const ov = useCharacterOverride(id)
  useLayoutEffect(() => {
    const st = state.current
    const g = st.group
    if (!g) return
    const prev = st.ov
    st.ov = ov
    if (ov) {
      const path = ov.path?.length ? ov.path : null
      if (path && !ov.instant && !reducedMotion) {
        const pts: Vec3[] = [[g.position.x, 0, g.position.z], ...path]
        startWalk(pts, pathMs(pts, ov.walkMaxMs), true)
      } else {
        st.walk = null
        if (path) {
          const [x, , z] = path[path.length - 1]
          g.position.set(x, 0, z)
          if (path.length > 1) g.rotation.y = samplePath(path, 1).rotY
          onMoved(id, x, z, true)
        }
        applyGesture(ov)
      }
    } else if (prev) {
      const away = Math.hypot(g.position.x - place.x, g.position.z - place.z) > 1e-3
      if (away && live()) startWalk(walkPath([g.position.x, 0, g.position.z], [place.x, 0, place.z]), 0, false)
      else {
        st.walk = null
        settle(false)
      }
    }
    invalidate()
  }, [ov, rig])

  // 細狀態或位置變了
  useLayoutEffect(() => {
    const st = state.current
    const g = st.group
    if (!g) return
    const prev = st.prevPlace
    const moved = prev != null && (Math.abs(prev.x - place.x) > 1e-3 || Math.abs(prev.z - place.z) > 1e-3)
    const isLiveNow = live()
    if (st.ov) {
      // 覆寫期間位置與姿勢歸 motion；細狀態只記下來，覆寫清掉時再套
    } else if (moved && isLiveNow) {
      const from: Vec3 = [g.position.x, 0, g.position.z]
      const to: Vec3 = [place.x, 0, place.z]
      startWalk([from, to], 0, false)
    } else {
      st.walk = null
      settle(shouldAnimate({ prev: st.prevSub, next: substate, live: isLiveNow }))
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
      const w = st.walk
      const k = Math.min(1, (now - w.start) / Math.max(w.ms, 1))
      const p = samplePath(w.pts, k)
      g.position.set(p.x, 0, p.z)
      g.rotation.y = p.rotY
      rig.mixer.update(dt)
      onMoved(id, p.x, p.z, k >= 1)
      if (k >= 1) {
        st.walk = null
        if (w.toOverride && st.ov) applyGesture(st.ov)
        else {
          g.rotation.y = place.rotY
          setStanding(false)
          pose(actionFor(substate, place.area), focused && !reducedMotion)
        }
      }
      return
    }
    if (!st.playing || !st.action) return
    st.t += dt
    rig.mixer.update(dt)
    procedural(st.action, st.t)
    if (!(focused && !reducedMotion) && now >= st.playUntil) pose(st.action, false)
  })

  // 頭頂 group 給 motion 掛 EventBubble／EventBadge（createPortal）
  const head = useRef<THREE.Group>(null)
  useLayoutEffect(() => {
    registerCharacterHead(id, head.current)
    return () => registerCharacterHead(id, null)
  }, [id])

  const sitting = place.pose === 'sit' && !standing
  const headY = sitting ? HEAD_Y.sit : HEAD_Y.stand
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
      <primitive object={rig.root} scale={prepared.scale} position-y={sitting ? SEAT_LIFT : 0} position-z={sitting ? -0.08 : 0} />
      {selected && (
        <mesh geometry={alert ? RING.selectInner : RING.select} material={mats.ringSelect} position-y={0.014} rotation-x={-Math.PI / 2} renderOrder={4} />
      )}
      <group ref={head} position-y={headY}>
        {props.children}
      </group>
    </group>
  )
}
