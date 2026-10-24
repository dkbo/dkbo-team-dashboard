// <Canvas> 裡的一切：色盤與材質、燈光、房間、家具、角色、標記、鏡頭、render 量測（§4.3、§4.7）。
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { AdaptiveDpr, Html, PerformanceMonitor } from '@react-three/drei'
import * as THREE from 'three'
import type { OfficeSession, Substate } from '@dash/shared'
import { sessionName } from '@/components/app/SessionRow'
import { rankOf, type Rank } from '@/lib/rank'
import { effectiveSubstate, SUBSTATE_META } from '@/lib/substate'
import { useNow } from '@/hooks/useNow'
import { useDashStore } from '@/store'
import { CameraRig, type CameraView } from './CameraRig'
import { Character, HEAD_Y } from './Character'
import { makeRankMaterial } from './cloth'
import { computeLayout, type OfficeLayout, type TaskInfo } from './layout'
import { AgentMarker, ZoneSign } from './Marker'
import { markerPriority, markerScale, resolveCollisions, type MarkerBox } from './markers'
import { Decor } from './Decor'
import { useGLTF } from './gltf'
import { createLiveGate } from './live'
import { createMaterials } from './materials'
import { assetUrl, characterKey, type OfficeManifest } from './model-map'
import { THEME_LERP_MS } from './motion'
import { ScenePalette, type Theme } from './palette'
import { Furniture, RoomShell } from './Room'
import { createTickets } from './tickets'
import { useVisibilityFrameloop } from './visibility'

export interface OffscreenAlert {
  id: string
  name: string
  /** canvas 內座標（px），已夾在邊上 */
  x: number
  y: number
}

/** hover 卡：場景投影出角色頭部的畫面座標，由 OfficeScene 在 canvas 上層畫（drei <Html> 剛掛上時不更新 z-index） */
export interface HoverCardAnchor {
  id: string
  x: number
  y: number
  flip: boolean
  below: boolean
}

export interface SceneRootProps {
  sessions: OfficeSession[]
  tasks: Record<string, TaskInfo>
  selectedId: string | null
  hoveredId: string | null
  onSelect(id: string | null): void
  onHover(id: string | null): void
  focusRequest: { id: string; nonce: number } | null
  resetRequest: number
  theme: Theme
  reducedMotion: boolean
  onUserMovedCamera(moved: boolean): void
  manifest: OfficeManifest
  onOffscreen(alerts: OffscreenAlert[]): void
  onHoverCard(anchor: HoverCardAnchor | null): void
}

declare global {
  interface Window {
    /** AC11 量測：frames＝累計 render 次數 */
    __dashOffice?: { frames: number; drawCalls: number; quality: 'high' | 'low' }
  }
}

const Z_ALERT: [number, number] = [399, 300]
const Z_MARKER: [number, number] = [299, 200]
const Z_SIGN: [number, number] = [99, 0]
const RANKS: Rank[] = ['senior', 'mid', 'junior', 'visitor']
/** 估計標記尺寸（px），碰撞用 */
const MARKER_SIZE = { alert: [96, 34], line: [104, 30], bubble: [56, 34], soft: [72, 30] } as const

/** hover 150ms 後開、離開 100ms 後關（§6.8） */
function useDelayedHover(id: string | null) {
  const [shown, setShown] = useState<string | null>(null)
  useEffect(() => {
    const t = setTimeout(() => setShown(id), id ? 150 : 100)
    return () => clearTimeout(t)
  }, [id])
  return shown
}

/** 用 priority 1 的 useFrame 自己 render，才數得到 frames 與 drawCalls */
function RenderStats({ quality }: { quality: 'high' | 'low' }) {
  const frames = useRef(0)
  const q = useRef(quality)
  q.current = quality
  useEffect(() => {
    window.__dashOffice = { frames: 0, drawCalls: 0, quality: q.current }
    return () => void delete window.__dashOffice
  }, [])
  const shadowCalls = useRef(0)
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    // 陰影 pass（座位變了才重算）的 draw call 另計，drawCalls 只記一般畫面
    const sm = gl.shadowMap as THREE.WebGLShadowMap & { render: (...a: unknown[]) => void }
    const orig = sm.render
    sm.render = function (...a: unknown[]) {
      const before = gl.info.render.calls
      orig.apply(this, a)
      shadowCalls.current += gl.info.render.calls - before
    }
    return () => void (sm.render = orig)
  }, [gl])
  useFrame(({ gl, scene, camera }) => {
    shadowCalls.current = 0
    gl.render(scene, camera)
    frames.current++
    window.__dashOffice = { frames: frames.current, drawCalls: gl.info.render.calls - shadowCalls.current, quality: q.current }
  }, 1)
  return null
}

export function SceneRoot(props: SceneRootProps) {
  const { sessions, tasks, selectedId, hoveredId, onSelect, onHover, theme, reducedMotion, manifest } = props
  const invalidate = useThree((s) => s.invalidate)
  const setFrameloop = useThree((s) => s.setFrameloop)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const size = useThree((s) => s.size)
  const camera = useThree((s) => s.camera)
  const [quality, setQuality] = useState<'high' | 'low'>('high')

  // 背景分頁停 render
  useVisibilityFrameloop({ setFrameloop, invalidate })

  // 動畫票：> 0 時連續 render
  const tickets = useMemo(() => createTickets((n) => n > 0 && invalidate()), [invalidate])
  useEffect(() => () => tickets.dispose(), [tickets])
  useFrame(() => {
    if (tickets.count() > 0) invalidate()
  })

  // 色盤與材質；主題切換 400ms 過渡（reduced motion 直接切）
  const palette = useMemo(() => new ScenePalette(), [])
  const mats = useMemo(() => createMaterials(palette), [palette])
  useEffect(() => () => mats.dispose(), [mats])
  const lerping = useRef(false)
  const firstTheme = useRef(true)
  const readTheme = useCallback(() => {
    const t: Theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
    const ms = firstTheme.current || reducedMotion ? 0 : THEME_LERP_MS
    firstTheme.current = false
    palette.read(t, ms)
    if (ms > 0) {
      lerping.current = true
      tickets.holdFor(ms + 50)
    }
    invalidate()
  }, [palette, reducedMotion, tickets, invalidate])
  useLayoutEffect(() => {
    readTheme()
    // theme prop 與 .dark class 可能不同步：class 變了再讀一次
    const mo = new MutationObserver(readTheme)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => mo.disconnect()
  }, [theme, readTheme])
  useLayoutEffect(() => {
    scene.background = palette.color['--scene-sky']
  }, [scene, palette])
  useFrame(() => {
    if (lerping.current) lerping.current = palette.step()
  })

  // 有效細狀態（Q3／Q7 轉閒置）與座位
  const now = useNow(15_000)
  // 每 15 秒的 now 只有在某人的有效細狀態真的變了才換新物件，避免座位重算觸發 render
  const subsRef = useRef<Record<string, Substate>>({})
  const subs = useMemo(() => {
    const out: Record<string, Substate> = {}
    for (const s of sessions) out[s.id] = effectiveSubstate(s, now)
    const prev = subsRef.current
    const same = Object.keys(out).length === Object.keys(prev).length && Object.entries(out).every(([k, v]) => prev[k] === v)
    if (!same) subsRef.current = out
    return subsRef.current
  }, [sessions, now])
  const layout: OfficeLayout = useMemo(
    () =>
      computeLayout({
        sessions: sessions.map((s) => ({ id: s.id, project: s.project, taskDir: s.taskDir, member: s.member, leader: s.leader, substateSince: s.substateSince, substate: subs[s.id] })),
        tasks,
      }),
    [sessions, tasks, subs],
  )

  // 即時與否（E7、review2 I2）：第一份資料、SSE 重連後補抓的第一份都直接畫最終狀態。
  // 契約不動：直接讀 store 的 SSE 狀態（zustand 跨 r3f root 可用）。
  const sse = useDashStore((s) => s.sse)
  const gate = useMemo(() => createLiveGate(), [])
  useEffect(() => void gate.update(sse, sessions), [gate, sse, sessions])
  const isLive = useCallback(() => gate.isLive(), [gate])

  // 陰影不自動更新；座位或人數變了才重算（§4.7）
  useLayoutEffect(() => {
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
    invalidate()
  }, [gl, layout, quality, invalidate])

  // 職等衣服：每職等一份共用 material（＋閒置 55% 的半透明變體）；頭用原 colormap
  const defaultUrl = assetUrl(manifest.characters.default?.url ?? Object.values(manifest.characters)[0].url)
  const base = useGLTF(defaultUrl)
  const charMats = useMemo(() => {
    let colormap: THREE.MeshStandardMaterial | null = null
    base.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh && !colormap) colormap = m.material as THREE.MeshStandardMaterial
    })
    const head = colormap! as THREE.MeshStandardMaterial
    const headDim = head.clone()
    headDim.transparent = true
    headDim.opacity = 0.55
    headDim.depthWrite = false
    const body = {} as Record<Rank, { normal: THREE.Material; dim: THREE.Material }>
    for (const r of RANKS) {
      const color = palette.color[`--rank-${r}`]
      body[r] = { normal: makeRankMaterial(head, color).material, dim: makeRankMaterial(head, color, { opacity: 0.55 }).material }
    }
    return { head, headDim, body }
  }, [base, palette])
  useEffect(
    () => () => {
      charMats.headDim.dispose()
      for (const r of RANKS) {
        charMats.body[r].normal.dispose()
        charMats.body[r].dim.dispose()
      }
    },
    [charMats],
  )

  // 接觸陰影：一個 InstancedMesh
  const contact = useMemo(() => {
    const m = new THREE.InstancedMesh(new THREE.CircleGeometry(0.32, 24).rotateX(-Math.PI / 2), mats.shadow, Math.max(1, sessions.length))
    m.renderOrder = 1
    return m
  }, [mats, sessions.length])
  const contactIndex = useMemo(() => new Map(sessions.map((s, i) => [s.id, i])), [sessions])
  useEffect(() => () => contact.geometry.dispose(), [contact])
  const tmp = useMemo(() => new THREE.Matrix4(), [])
  const onMoved = useCallback(
    (id: string, x: number, z: number, settled: boolean) => {
      const i = contactIndex.get(id)
      if (i == null) return
      contact.setMatrixAt(i, tmp.makeTranslation(x, 0.006, z))
      contact.count = sessions.length
      contact.instanceMatrix.needsUpdate = true
      if (settled) gl.shadowMap.needsUpdate = true
    },
    [contact, contactIndex, sessions.length, tmp, gl],
  )

  // 鏡頭停下後：標記縮放、互撞縮點、畫面外的 alert
  const [view, setView] = useState<{ distance: number; fitDistance: number; dots: Set<string> }>({ distance: 1, fitDistance: 1, dots: new Set() })
  const viewRef = useRef<CameraView | null>(null)
  const markerShown = useCallback(
    (s: OfficeSession) => !SUBSTATE_META[subs[s.id]].hiddenByDefault || s.id === selectedId || s.id === hoveredId,
    [subs, selectedId, hoveredId],
  )
  const recompute = useCallback(
    (v: CameraView) => {
      viewRef.current = v
      const boxes: MarkerBox[] = []
      const off: OffscreenAlert[] = []
      const p = new THREE.Vector3()
      for (const s of sessions) {
        const place = layout.places[s.id]
        if (!place) continue
        const sub = subs[s.id]
        const meta = SUBSTATE_META[sub]
        p.set(place.x, place.pose === 'sit' ? HEAD_Y.sit : HEAD_Y.stand, place.z).project(v.camera)
        const sx = ((p.x + 1) / 2) * v.size.width
        const sy = ((1 - p.y) / 2) * v.size.height
        const alert = meta.marker === 'alert'
        if (alert && (p.z > 1 || sx < 0 || sx > v.size.width || sy < 0 || sy > v.size.height)) {
          off.push({ id: s.id, name: sessionName(s), x: THREE.MathUtils.clamp(sx, 12, v.size.width - 120), y: THREE.MathUtils.clamp(sy, 12, v.size.height - 40) })
        }
        if (!markerShown(s)) continue
        const [w, h] = MARKER_SIZE[meta.marker]
        const focused = s.id === selectedId || s.id === hoveredId
        boxes.push({ id: s.id, x: sx - w / 2, y: sy - h, w, h, priority: markerPriority(sub, focused), alert })
      }
      setView({ distance: v.distance, fitDistance: v.fitDistance, dots: resolveCollisions(boxes) })
      // 同一邊的 chip 往下錯開，不疊在一起
      off.sort((a, b) => a.y - b.y)
      for (let i = 1; i < off.length; i++) if (Math.abs(off[i].x - off[i - 1].x) < 120 && off[i].y < off[i - 1].y + 34) off[i].y = off[i - 1].y + 34
      props.onOffscreen(off)
    },
    [sessions, layout, subs, markerShown, selectedId, hoveredId, props],
  )
  // 資料或選取變了也重算一次（不每幀算）
  useEffect(() => {
    if (viewRef.current) recompute({ ...viewRef.current, size })
  }, [layout, selectedId, hoveredId, size])

  // focusRequest → 角色座標
  const focus = useMemo(() => {
    const r = props.focusRequest
    const p = r ? layout.places[r.id] : null
    return r && p ? { x: p.x, z: p.z, nonce: r.nonce } : null
  }, [props.focusRequest, layout])

  const shownHover = useDelayedHover(hoveredId)
  // DOM 疊層新增或換內容時補畫一格：drei <Html> 的 z-index 只在 render 時更新
  useEffect(() => invalidate(), [view, subs, selectedId, hoveredId, invalidate])
  const onHoverCard = props.onHoverCard
  useEffect(() => {
    const place = shownHover ? layout.places[shownHover] : null
    if (!shownHover || !place) return onHoverCard(null)
    const p = new THREE.Vector3(place.x, place.pose === 'sit' ? HEAD_Y.sit : HEAD_Y.stand, place.z).project(camera)
    const x = ((p.x + 1) / 2) * size.width
    const y = ((1 - p.y) / 2) * size.height
    onHoverCard({ id: shownHover, x, y, flip: x + 16 + 280 > size.width, below: y < 240 })
  }, [shownHover, layout, view, camera, size, onHoverCard])

  // 燈光：顏色直接引用色盤，強度跟著過渡
  const hemi = useRef<THREE.HemisphereLight>(null)
  const key = useRef<THREE.DirectionalLight>(null)
  useLayoutEffect(() => {
    const sync = () => {
      if (hemi.current) {
        hemi.current.color = palette.color['--light-hemi-sky']
        hemi.current.groundColor = palette.color['--light-hemi-ground']
        hemi.current.intensity = palette.light.hemi
      }
      if (key.current) {
        key.current.color = palette.color['--light-key']
        key.current.intensity = palette.light.key
      }
    }
    sync()
    return palette.subscribe(sync)
  }, [palette])
  const cx = layout.room.w / 2
  const cz = layout.room.d / 2
  const span = Math.max(layout.room.w, layout.room.d) * 0.75
  useLayoutEffect(() => {
    const k = key.current
    if (!k) return
    k.target.position.set(cx, 0, cz)
    k.target.updateMatrixWorld()
    const sc = k.shadow.camera
    sc.left = -span
    sc.right = span
    sc.top = span
    sc.bottom = -span
    sc.far = 60
    sc.updateProjectionMatrix()
  }, [cx, cz, span])

  // 角色：依 §1.2 排序畫，標記的 tab 順序因此跟著狀態優先序
  const ordered = useMemo(
    () => [...sessions].sort((a, b) => SUBSTATE_META[subs[a.id]].order - SUBSTATE_META[subs[b.id]].order || (sessionName(a) < sessionName(b) ? -1 : 1)),
    [sessions, subs],
  )
  const keys = useMemo(() => Object.keys(manifest.characters), [manifest])
  const select = useCallback((id: string | null) => onSelect(id), [onSelect])

  return (
    <>
      <RenderStats quality={quality} />
      <PerformanceMonitor onDecline={() => setQuality('low')} />
      <AdaptiveDpr pixelated />
      <hemisphereLight ref={hemi} />
      <directionalLight
        ref={key}
        position={[cx - 5 * 1.5, 10 * 1.5, cz + 4 * 1.5]}
        castShadow={quality === 'high'}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0005}
      />
      <CameraRig
        room={layout.room}
        focus={focus}
        resetRequest={props.resetRequest}
        reducedMotion={reducedMotion}
        tickets={tickets}
        onUserMovedCamera={props.onUserMovedCamera}
        onSettled={recompute}
      />
      <RoomShell layout={layout} mats={mats} />
      <Furniture layout={layout} mats={mats} manifest={manifest} substates={subs} />
      <primitive object={contact} />
      <Decor layout={layout} subs={subs} mats={mats} dark={theme === 'dark'} />
      {layout.zones.map((z) => (
        <Html key={`${z.kind}:${z.key}`} position={z.sign} zIndexRange={Z_SIGN}>
          <ZoneSign kind={z.kind} title={z.title} subtitle={z.subtitle} count={z.count} needs={z.needs} />
        </Html>
      ))}
      {ordered.map((s) => {
        const sub = subs[s.id]
        const place = layout.places[s.id]
        const rank = rankOf(s.kind, s.model)
        const dim = sub === 'idle'
        const focused = s.id === selectedId || s.id === hoveredId
        const meta = SUBSTATE_META[sub]
        const ck = characterKey(s, keys)
        const ch = manifest.characters[ck] ?? manifest.characters.default
        const alert = meta.marker === 'alert'
        const task = s.taskDir ? tasks[s.taskDir] : undefined
        return (
          <Suspense key={s.id} fallback={null}>
            <Character
              id={s.id}
              url={assetUrl(ch.url)}
              clips={ch.clips}
              substate={sub}
              place={place}
              bodyMaterial={dim ? charMats.body[rank].dim : charMats.body[rank].normal}
              headMaterial={dim ? charMats.headDim : charMats.head}
              mats={mats}
              focused={focused}
              selected={s.id === selectedId}
              alert={alert}
              visitor={rank === 'visitor'}
              reducedMotion={reducedMotion}
              isLive={isLive}
              tickets={tickets}
              onMoved={onMoved}
              onSelect={select}
              onHover={onHover}
            >
              {markerShown(s) && (
                <Html zIndexRange={alert ? Z_ALERT : Z_MARKER}>
                  <AgentMarker
                    session={s}
                    substate={sub}
                    now={now}
                    scale={view.dots.has(s.id) ? 'dot' : markerScale({ base: layout.markerScale, fitDistance: view.fitDistance, distance: view.distance, alert })}
                    focused={focused}
                    reducedMotion={reducedMotion}
                    onSelect={select}
                    onHover={onHover}
                  />
                </Html>
              )}
            </Character>
          </Suspense>
        )
      })}
    </>
  )
}
