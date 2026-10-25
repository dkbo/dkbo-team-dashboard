// 頁面物件（§4.6、§6.16、§1.8；AC7／AC8）：第二包，場景第一次 render 後才 import()。
// 盒子拼的部分全部用「單位方塊 InstancedMesh」按材質分組畫，六件物件＋所有白板只多十幾個 draw call。
import { forwardRef, memo, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { Html, Outlines } from '@react-three/drei'
import * as THREE from 'three'
import { Archive, GitBranch, Monitor, Presentation, Zap, type LucideIcon } from 'lucide-react'
import { ObjectLabel, TaskBoardLabel, type LabelDensity, type LabelYield } from '@/components/app/office'
import type { BoardStat, ObjectStat, OfficeObjects } from '@/features/office/sceneTypes'
import { useBoardFlash } from '../director/boardFx'
import type { OfficeLayout } from '../layout'
import { InstancedModel, type Placement } from '../InstancedModel'
import { furnitureMaterial, type SceneMaterials } from '../materials'
import { assetUrl, type OfficeManifest } from '../model-map'
import type { ScenePalette, Token } from '../palette'
import { labelBox, labelDensity, LAMP_H, OBJECT_LIFT, objectPlacements, resolveLabelYield, boardYield, textW, type Box, type FixedKind, type ObjectPlace, type Vec3 } from './placement'

/** 物件標籤在區牌之上、一般標記之下（E16 三層） */
const Z_OBJECT: [number, number] = [199, 100]
/** drei <Html> 非 transform 模式只認 style（pointerEvents prop 只用在 transform 模式） */
const NO_POINTER = { pointerEvents: 'none' } as const
/** office-object 定位點（e2e 量座標用，不擋指標）放最底 */
const Z_PROBE: [number, number] = [0, 0]

const META: Record<FixedKind, { icon: LucideIcon; page: string }> = {
  monitor: { icon: Monitor, page: 'herdr' },
  archive: { icon: Archive, page: '檔案室' },
  git: { icon: GitBranch, page: 'git' },
  notice: { icon: Presentation, page: '總覽' },
  meter: { icon: Zap, page: '趨勢' },
}
const FIXED: FixedKind[] = ['monitor', 'archive', 'git', 'notice', 'meter']

export interface SettledView {
  distance: number
  fitDistance: number
  camera: THREE.Camera
  size: { width: number; height: number }
}

export interface LobbyProps {
  layout: OfficeLayout
  objects: OfficeObjects | null
  manifest: OfficeManifest
  palette: ScenePalette
  mats: SceneMaterials
  /** 鏡頭最近一次停下（null＝還沒停過） */
  view: SettledView | null
  /** 角色標記與區牌的螢幕框（物件標籤讓位用） */
  markerBoxes: Box[]
  onOpenObject(href: string): void
}

// ---------- 材質（色值引用色盤，主題切換只改值） ----------

function useLobbyMaterials(p: ScenePalette) {
  const mats = useMemo(() => {
    const list: THREE.Material[] = []
    const basic = (t: Token, opacity?: number) => {
      const m = new THREE.MeshBasicMaterial()
      m.color = p.color[t]
      if (opacity != null) {
        m.transparent = true
        m.opacity = opacity
        m.depthWrite = false
      }
      list.push(m)
      return m
    }
    const std = (t: Token) => {
      const m = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 })
      m.color = p.color[t]
      list.push(m)
      return m
    }
    const out = {
      board: std('--scene-board'),
      boardDanger: std('--status-danger-soft'),
      boardWarn: std('--status-warn-soft'),
      danger: basic('--status-danger'),
      warn: basic('--status-warn'),
      ok: basic('--status-ok'),
      okSoft: basic('--status-ok', 0.4),
      wallTop: basic('--scene-wall-top'),
      cork: std('--scene-cork'),
      lampOff: basic('--scene-lamp-off'),
      glowDanger: basic('--status-danger', 0.22),
      glowWarn: basic('--status-warn', 0.22),
      frame: basic('--scene-cabinet-side'),
      post: basic('--scene-monitor'),
      screenOn: (() => {
        const m = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0 })
        m.color = p.color['--scene-screen-on']
        m.emissive = p.color['--scene-screen-on']
        list.push(m)
        return m
      })(),
      screenOff: basic('--scene-screen-off'),
      mat: basic('--scene-couch'),
    }
    return { ...out, dispose: () => list.forEach((m) => m.dispose()) }
  }, [p])
  useLayoutEffect(() => {
    const sync = () => void (mats.screenOn.emissiveIntensity = p.light.screen)
    sync()
    const off = p.subscribe(sync)
    return () => {
      off()
      mats.dispose()
    }
  }, [mats, p])
  return mats
}
type LobbyMats = ReturnType<typeof useLobbyMaterials>

// ---------- 單位方塊 instancing ----------

interface BoxPart {
  /** 中心 */
  p: Vec3
  /** 尺寸 */
  s: Vec3
  rotY?: number
}

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)
const UNIT_CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 16)
const UNIT_DISC = new THREE.CircleGeometry(0.5, 32).rotateX(-Math.PI / 2)
const m4 = new THREE.Matrix4()
const q = new THREE.Quaternion()
const up = new THREE.Vector3(0, 1, 0)

const Boxes = memo(function Boxes({ parts, material, geometry = UNIT_BOX, shadow = false }: { parts: BoxPart[]; material: THREE.Material; geometry?: THREE.BufferGeometry; shadow?: boolean }) {
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(geometry, material, Math.max(1, parts.length))
    m.castShadow = shadow
    return m
  }, [geometry, material, parts.length, shadow])
  useLayoutEffect(() => {
    parts.forEach((b, i) => {
      q.setFromAxisAngle(up, b.rotY ?? 0)
      mesh.setMatrixAt(i, m4.compose(new THREE.Vector3(...b.p), q, new THREE.Vector3(...b.s)))
    })
    mesh.count = parts.length
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [mesh, parts])
  useLayoutEffect(() => () => mesh.dispose(), [mesh])
  if (parts.length === 0) return null
  return <primitive object={mesh} />
})

/** 依材質分組的方塊 */
type Groups = Map<THREE.Material, BoxPart[]>
const add = (g: Groups, m: THREE.Material, part: BoxPart) => g.set(m, [...(g.get(m) ?? []), part])

// ---------- 幾何（純計算） ----------

function boardParts(g: Groups, lm: LobbyMats, place: ObjectPlace, stat: BoardStat | null) {
  const [x, , z] = place.center
  const [w, h, d] = place.size
  const y0 = OBJECT_LIFT.board
  const tone = stat?.tone ?? null
  // 立架：兩支腳＋框
  for (const sx of [-1, 1]) add(g, lm.frame, { p: [x + sx * (w / 2 - 0.04), (y0 + h) / 2, z - 0.03], s: [0.05, y0 + h, 0.05] })
  add(g, lm.frame, { p: [x, y0 + h / 2, z - d / 2 - 0.01], s: [w + 0.08, h + 0.08, 0.02] })
  // 板面（§1.8：異常時 status-X-soft）＋下緣色條（status-X，無異常 wall-top）
  add(g, tone === 'danger' ? lm.boardDanger : tone === 'warn' ? lm.boardWarn : lm.board, { p: [x, y0 + h / 2, z], s: [w, h, d] })
  add(g, tone === 'danger' ? lm.danger : tone === 'warn' ? lm.warn : lm.wallTop, { p: [x, y0 + 0.04, z + d / 2 + 0.006], s: [w, 0.08, 0.012] })
  // 進度格：已關 ok、進行中 ok 40%、未開 wall-top
  const planned = stat?.planned ?? 0
  if (planned > 0) {
    const closed = stat!.closedState === 'done' ? planned : Math.min(stat!.closed, planned)
    const gap = 0.04
    const cw = (w - 0.2 - gap * (planned - 1)) / planned
    for (let i = 0; i < planned; i++) {
      const m = i < closed ? lm.ok : i === closed && !stat!.closedState ? lm.okSoft : lm.wallTop
      add(g, m, { p: [x - w / 2 + 0.1 + cw / 2 + i * (cw + gap), y0 + h - 0.16, z + d / 2 + 0.006], s: [cw, 0.12, 0.012] })
    }
  }
}

function lampMat(lm: LobbyMats, lamp: ObjectStat['lamp']) {
  return lamp === 'danger' ? lm.danger : lamp === 'warn' ? lm.warn : lm.lampOff
}

function fixedParts(g: Groups, cyl: Groups, discs: Groups, lm: LobbyMats, fx: Record<FixedKind, ObjectPlace>, objects: OfficeObjects | null, models: OfficeManifest['objects']) {
  // 監控牆：背板；沒有模型時 3 × 2 螢幕用方塊
  {
    const { center: [x, , z], size: [w, h] } = fx.monitor
    const y0 = OBJECT_LIFT.monitor
    add(g, lm.post, { p: [x, y0 + h / 2, z - 0.02], s: [w + 0.1, h + 0.1, 0.03] })
    if (!models?.screen) {
      const on = objects?.monitor.value !== '—' && objects != null
      for (let r = 0; r < 2; r++)
        for (let c = 0; c < 3; c++) add(g, on ? lm.screenOn : lm.screenOff, { p: [x - w / 3 + c * (w / 3), y0 + h / 4 + r * (h / 2), z], s: [w / 3 - 0.08, h / 2 - 0.08, 0.02] })
    }
  }
  // 檔案室：沒有書櫃模型時用方塊
  if (!models?.bookcase) {
    const { center: [x, , z], size: [w, h, d] } = fx.archive
    add(g, lm.frame, { p: [x, h / 2, z], s: [w, h, d] })
  }
  // git 櫃：底座＋（模型或方塊）櫃身＋櫃頂燈＋地面光暈
  {
    const { center: [x, , z], size: [w, h, d] } = fx.git
    const lamp = objects?.git.lamp ?? null
    if (!models?.cabinet) add(g, lm.frame, { p: [x, h / 2, z], s: [w, h, d] })
    else add(g, lm.frame, { p: [x, GIT_PLINTH / 2, z], s: [w, GIT_PLINTH, d] })
    add(cyl, lampMat(lm, lamp), { p: [x, h + LAMP_H / 2, z], s: [0.16, LAMP_H, 0.16] })
    if (lamp === 'danger' || lamp === 'warn') add(discs, lamp === 'danger' ? lm.glowDanger : lm.glowWarn, { p: [x, 0.008, z], s: [1.6, 1, 1.6] })
  }
  // 公告板（軟木，盒子拼）＋入口地墊
  {
    const { center: [x, , z], size: [w, h, d] } = fx.notice
    const y0 = OBJECT_LIFT.notice
    for (const sx of [-1, 1]) add(g, lm.frame, { p: [x + sx * (w / 2 - 0.05), (y0 + h) / 2, z - 0.03], s: [0.05, y0 + h, 0.05] })
    add(g, lm.frame, { p: [x, y0 + h / 2, z - d / 2 - 0.01], s: [w + 0.1, h + 0.1, 0.02] })
    add(g, lm.cork, { p: [x, y0 + h / 2, z], s: [w, h, d] })
    add(g, lm.mat, { p: [x + 1.4, 0.01, z + 1.2], s: [1.4, 0.02, 0.9] })
  }
  // 電表：立柱＋（模型或方塊）錶箱＋錶面（跳電暗）＋斷路燈
  {
    const { center: [x, , z], size: [w, h, d] } = fx.meter
    const y0 = OBJECT_LIFT.meter
    const tripped = objects?.meter.lamp === 'warn'
    add(cyl, lm.post, { p: [x, y0 / 2, z], s: [0.08, y0, 0.08] })
    if (!models?.meter) add(g, lm.frame, { p: [x, y0 + h / 2, z], s: [w, h, d] })
    add(g, tripped ? lm.screenOff : lm.screenOn, { p: [x, y0 + h * 0.62, z + d / 2 + 0.012], s: [w * 0.6, h * 0.3, 0.01] })
    add(cyl, tripped ? lm.warn : lm.lampOff, { p: [x + w * 0.32, y0 + h + 0.05, z], s: [0.08, 0.1, 0.08] })
  }
}

/** 指向三角（含間隙）的高，DOM 量到的高要扣掉才是膠囊 */
const POINTER_PX = 6

/** git 櫃模型放在這個高的底座上，湊到 §4.6 的 1.2 高 */
const GIT_PLINTH = 0.36

// ---------- 標籤尺寸估計（碰撞用；只在鏡頭停下後算） ----------


function objectLabelSize(stat: ObjectStat, page: string, density: LabelDensity): { w: number; h: number } {
  const full = density === 'full'
  const abnormal = stat.lamp === 'danger' || stat.lamp === 'warn' || (stat.chip != null && stat.chip.tone !== 'neutral')
  let w = 24 + 14 + textW(stat.value) + 6
  if (stat.lamp) w += 8 + 6
  if (full) w += textW(page) + 6 + (stat.unit ? textW(stat.unit) + 6 : 0)
  if (stat.chip && (full ? true : abnormal && stat.chip.tone !== 'neutral')) w += textW(stat.chip.label) + 28
  return { w, h: 28 }
}

function boardLabelSize(b: BoardStat, density: 'full' | 'compact'): { w: number; h: number } {
  if (density === 'full') return { w: 200, h: b.planned > 0 ? 64 + (b.chips.length ? 26 : 0) : 40 }
  let w = 24 + 14 + 6 + textW(`${b.closed}/${b.planned}`)
  if (b.tone) w += b.chips.some((c) => c.tone === 'danger') ? 70 : 24
  if (b.closedState) w += 70
  return { w, h: 28 }
}

// ---------- 元件 ----------

/** 命中盒不畫（raycast 不看 material.visible） */
const HIT = new THREE.MeshBasicMaterial({ visible: false })

/** 可點的透明命中盒：hover 描邊（Outlines 0.04 格 ring 色）、cursor-pointer、點了開頁 */
function HitBox({ place, lift = 0, extra = 0, active, ring, onHover, onOpen }: { place: ObjectPlace; lift?: number; extra?: number; active: boolean; ring: THREE.Color; onHover(on: boolean): void; onOpen(): void; }) {
  const gl = useThree((s) => s.gl)
  const [w, h, d] = place.size
  const [x, , z] = place.center
  const height = lift + h + extra
  return (
    <mesh
      position={[x, height / 2, z]}
      scale={[w + 0.06, height + 0.04, Math.max(d, 0.1) + 0.06]}
      geometry={UNIT_BOX}
      material={HIT}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()
        gl.domElement.style.cursor = 'pointer'
        onHover(true)
      }}
      onPointerOut={() => {
        gl.domElement.style.cursor = ''
        onHover(false)
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        onOpen()
      }}
    >
      {active && <Outlines thickness={0.04} color={ring} screenspace={false} />}
    </mesh>
  )
}

/** e2e 定位點：物件中心的投影位置（pointer-events-none，點擊會落到 canvas 上的物件） */
function Probe({ at, object, task }: { at: Vec3; object: string; task?: string }) {
  return (
    <Html position={at} zIndexRange={Z_PROBE} style={NO_POINTER}>
      <span data-testid="office-object" data-object={object} data-task={task} aria-hidden className="pointer-events-none block size-px" />
    </Html>
  )
}

const LabelSlot = forwardRef<HTMLDivElement, { at: Vec3; object: string; task?: string; density: string; tone: string | null; children: ReactNode }>(function LabelSlot(
  { at, object, task, density, tone, children },
  ref,
) {
  return (
    // 外層不吃指標：標籤只是視覺位移，版面框還留在錨點上，會蓋住底下的 3D 物件（只有標籤本身 pointer-events-auto）
    <Html position={at} zIndexRange={Z_OBJECT} style={NO_POINTER}>
      <div ref={ref} data-testid="object-label" data-object={object} data-task={task} data-density={density} data-tone={tone ?? undefined}>
        {children}
      </div>
    </Html>
  )
})

function BoardLabel({ dir, stat, density, placement, yielded, onOpen, onActive }: { dir: string; stat: BoardStat; density: 'full' | 'compact'; placement: 'above' | 'below'; yielded: LabelYield; onOpen(href: string): void; onActive(on: boolean): void }) {
  const flash = useBoardFlash(dir)
  return (
    <TaskBoardLabel
      task={stat.display}
      wavesClosed={stat.closed}
      wavesPlanned={stat.planned}
      tone={stat.tone}
      chips={stat.chips}
      closed={stat.closedState}
      density={density}
      placement={placement}
      flashIndex={flash}
      yielded={yielded}
      href={stat.href}
      onOpen={onOpen}
      onActiveChange={onActive}
    />
  )
}

export default function Lobby({ layout, objects, manifest, palette, mats, view, markerBoxes, onOpenObject }: LobbyProps) {
  const invalidate = useThree((s) => s.invalidate)
  const lm = useLobbyMaterials(palette)
  const place = useMemo(() => objectPlacements(layout), [layout])
  const models = manifest.objects

  // 方塊幾何：只有物件資料或座標變了才重組
  const groups = useMemo(() => {
    const g: Groups = new Map()
    const cyl: Groups = new Map()
    const discs: Groups = new Map()
    for (const [dir, p] of Object.entries(place.boards)) boardParts(g, lm, p, objects?.boards[dir] ?? null)
    fixedParts(g, cyl, discs, lm, place.fixed, objects, models)
    return { g: [...g], cyl: [...cyl], discs: [...discs] }
  }, [place, objects, lm, models])
  useLayoutEffect(() => invalidate(), [groups, invalidate])

  // 模型件（instanced）
  const modelPlacements = useMemo(() => {
    const fx = place.fixed
    const screens: Placement[] = []
    if (models?.screen) {
      const { center: [x, , z], size: [w] } = fx.monitor
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) screens.push({ x: x - w / 3 + c * (w / 3), z: z + 0.05, y: OBJECT_LIFT.monitor - 0.08 + r * 0.6, rotY: 0 })
    }
    const books: Placement[] = []
    if (models?.bookcase) {
      const { center: [x, , z], size: [w] } = fx.archive
      for (let i = 0; i < 4; i++) books.push({ x: x - w / 2 + w / 8 + i * (w / 4), z, rotY: 0 })
    }
    const cab: Placement[] = models?.cabinet ? [{ x: fx.git.center[0], z: fx.git.center[2], y: GIT_PLINTH, rotY: 0 }] : []
    const meter: Placement[] = models?.meter ? [{ x: fx.meter.center[0], z: fx.meter.center[2], y: OBJECT_LIFT.meter, rotY: 0 }] : []
    return { screens, books, cab, meter }
  }, [place, models])
  const monitorOn = objects != null && objects.monitor.value !== '—'

  // 標籤密度與讓位：鏡頭停下（view 換新）或資料變了才算
  const [active, setActive] = useState<string | null>(null)
  const density: LabelDensity = view ? labelDensity({ distance: view.distance, fitDistance: view.fitDistance, base: layout.markerScale }) : 'compact'
  const boardDensity: 'full' | 'compact' = density === 'full' ? 'full' : 'compact'
  // 標籤實際尺寸（DOM 量到的膠囊＋三角，依 id＋密度快取）；沒量過先用估計
  const slots = useRef(new Map<string, HTMLDivElement>())
  const sizes = useRef(new Map<string, { w: number; h: number }>())
  const [measured, setMeasured] = useState(0)
  const gl = useThree((st) => st.gl)
  const [yields, setYields] = useState<Record<string, LabelYield>>({})
  useLayoutEffect(() => {
    if (!view || !objects) return setYields({})
    const v = new THREE.Vector3()
    const project = (p: Vec3) => {
      v.set(...p).project(view.camera)
      return { x: ((v.x + 1) / 2) * view.size.width, y: ((1 - v.y) / 2) * view.size.height }
    }
    const sized = (id: string, d: string, est: { w: number; h: number }) => {
      const m = sizes.current.get(`${id}|${d}`)
      return m ? { w: m.w, h: m.h - POINTER_PX } : est
    }
    const items: (Box & { id: string; dot: Box; abnormal: boolean })[] = []
    // 異常的先排（同撞時保留有異常的）
    const ordered = [
      ...Object.keys(place.boards)
        .filter((d) => objects.boards[d])
        .map((d) => ({ id: `board:${d}`, p: place.boards[d], size: sized(`board:${d}`, boardDensity, boardLabelSize(objects.boards[d], boardDensity)), bad: objects.boards[d].tone != null })),
      ...FIXED.map((k) => ({ id: k, p: place.fixed[k], size: sized(k, density, objectLabelSize(objects[k], META[k].page, density)), bad: objects[k].lamp != null || (objects[k].chip?.tone ?? 'neutral') !== 'neutral' })),
    ].sort((a, b) => Number(b.bad) - Number(a.bad))
    for (const o of ordered) {
      const a = project(o.p.label)
      items.push({ id: o.id, abnormal: o.bad, ...labelBox(a, o.size, o.p.placement, o.p.align), dot: labelBox(a, { w: 12, h: 12 }, o.p.placement, 'center') })
    }
    // 區牌位置固定（E2），直接量 DOM
    const origin = gl.domElement.getBoundingClientRect()
    const root = gl.domElement.closest('[data-slot="office-scene"]') ?? document
    const signs: Box[] = [...root.querySelectorAll('[data-slot="zone-sign"]')].map((e) => {
      const r = e.getBoundingClientRect()
      return { x: r.x - origin.x, y: r.y - origin.y, w: r.width, h: r.height }
    })
    const next = resolveLabelYield(items, markerBoxes, signs)
    setYields((prev) => (Object.keys(next).length === Object.keys(prev).length && Object.entries(next).every(([k, y]) => prev[k] === y) ? prev : next))
  }, [view, objects, place, markerBoxes, density, boardDensity, measured, gl])
  // 正常顯示中的標籤量一次實際尺寸（drei <Html> 的內容晚一拍掛上，等一下再量）；尺寸變了才重算讓位
  useLayoutEffect(() => {
    const t = setTimeout(() => {
      let changed = false
      for (const [id, el] of slots.current) {
        const label = el.firstElementChild as HTMLElement | null
        if (!label || label.dataset.yielded !== 'none' || label.classList.contains('sr-only')) continue
        const r = label.getBoundingClientRect()
        const key = `${id}|${el.dataset.density}`
        const old = sizes.current.get(key)
        if (r.width > 2 && (!old || Math.abs(old.w - r.width) > 1 || Math.abs(old.h - r.height) > 1)) {
          sizes.current.set(key, { w: r.width, h: r.height })
          changed = true
        }
      }
      if (changed) setMeasured((n) => n + 1)
    }, 80)
    return () => clearTimeout(t)
  }, [yields, objects, density, boardDensity])
  const slotRef = (id: string) => (el: HTMLDivElement | null) => void (el ? slots.current.set(id, el) : slots.current.delete(id))
  useLayoutEffect(() => invalidate(), [yields, active, invalidate])

  const ring = palette.color['--ring']
  const open = (href: string) => onOpenObject(href)
  const hover = (id: string) => (on: boolean) => setActive((cur) => (on ? id : cur === id ? null : cur))
  // hover 或 focus 中的物件：標籤恢復 full、不讓位（§6.14）
  const yieldOf = (id: string): LabelYield => (active === id ? 'none' : (yields[id] ?? 'none'))
  const densityOf = (id: string): LabelDensity => (active === id ? 'full' : density)

  return (
    <group>
      {groups.g.map(([m, parts]) => (
        <Boxes key={m.uuid} material={m} parts={parts} />
      ))}
      {groups.cyl.map(([m, parts]) => (
        <Boxes key={m.uuid} material={m} parts={parts} geometry={UNIT_CYL} />
      ))}
      {groups.discs.map(([m, parts]) => (
        <Boxes key={m.uuid} material={m} parts={parts} geometry={UNIT_DISC} />
      ))}
      {models?.screen && (
        <InstancedModel url={assetUrl(models.screen)} width={0.92} placements={modelPlacements.screens} material={() => (monitorOn ? lm.screenOn : lm.screenOff)} />
      )}
      {models?.bookcase && <InstancedModel url={assetUrl(models.bookcase)} width={0.85} placements={modelPlacements.books} material={(n) => furnitureMaterial(mats, 'bookcase', n)} castShadow />}
      {models?.cabinet && <InstancedModel url={assetUrl(models.cabinet)} width={0.8} placements={modelPlacements.cab} material={(n) => furnitureMaterial(mats, 'cabinet', n)} />}
      {models?.meter && <InstancedModel url={assetUrl(models.meter)} width={0.5} placements={modelPlacements.meter} material={() => mats.cabinet} />}

      {/* 命中盒、描邊、定位點與標籤 */}
      {Object.entries(place.boards).map(([dir, p]) => {
        const stat = objects?.boards[dir]
        if (!stat) return null
        const id = `board:${dir}`
        // 審查 I4：遠到 alert-only 時沒異常的白板收掉（hover／focus 中照樣恢復）
        const y = active === id ? 'none' : boardYield(density, stat.tone, yieldOf(id))
        const d = active === id ? 'full' : boardDensity
        return (
          <group key={dir}>
            <HitBox place={p} lift={OBJECT_LIFT.board} active={active === id} ring={ring} onHover={hover(id)} onOpen={() => open(stat.href)} />
            <Probe at={[p.center[0], OBJECT_LIFT.board + p.size[1] / 2, p.center[2]]} object="board" task={dir} />
            <LabelSlot ref={slotRef(id)} at={p.label} object="board" task={dir} density={d} tone={stat.tone}>
              <BoardLabel dir={dir} stat={stat} density={d} placement={p.placement} yielded={y} onOpen={open} onActive={hover(id)} />
            </LabelSlot>
          </group>
        )
      })}
      {objects &&
        FIXED.map((k) => {
          const p = place.fixed[k]
          const stat = objects[k]
          const extra = k === 'git' ? LAMP_H : 0
          const lift = k === 'monitor' ? OBJECT_LIFT.monitor : k === 'notice' ? OBJECT_LIFT.notice : k === 'meter' ? OBJECT_LIFT.meter : 0
          const tone = stat.lamp === 'danger' || stat.chip?.tone === 'danger' ? 'danger' : stat.lamp === 'warn' || stat.chip?.tone === 'warn' ? 'warn' : null
          return (
            <group key={k}>
              <HitBox place={p} lift={lift} extra={extra} active={active === k} ring={ring} onHover={hover(k)} onOpen={() => open(stat.href)} />
              <Probe at={[p.center[0], lift + p.size[1] / 2, p.center[2]]} object={k} />
              <LabelSlot ref={slotRef(k)} at={p.label} object={k} density={densityOf(k)} tone={tone}>
                <ObjectLabel
                  icon={META[k].icon}
                  page={META[k].page}
                  value={stat.value}
                  unit={stat.unit}
                  chip={stat.chip}
                  lamp={stat.lamp}
                  density={densityOf(k)}
                  placement={p.placement}
                  align={p.align}
                  yielded={yieldOf(k)}
                  empty={stat.value === '—' || (k === 'notice' && stat.value === '0')}
                  href={stat.href}
                  onOpen={open}
                  onActiveChange={hover(k)}
                />
              </LabelSlot>
            </group>
          )
        })}
    </group>
  )
}
