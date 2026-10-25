// 房間（地板、牆、窗、區地毯合併成少數幾個靜態 mesh）與家具（instanced），§4.3、§4.7。
import { useEffect, useMemo } from 'react'
import { useGLTF } from './gltf'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { Substate } from '@dash/shared'
import type { OfficeLayout } from './layout'
import { furnitureMaterial, type SceneMaterials } from './materials'
import { assetUrl, type OfficeManifest } from './model-map'
import { InstancedModel, modelParts, type Placement } from './InstancedModel'

const WALL_H = 2.4
const WALL_T = 0.16
const FLOOR_T = 0.2
const RUG_T = 0.02

function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z)
}

function merged(geos: THREE.BufferGeometry[]) {
  if (geos.length === 0) return null
  const g = mergeGeometries(geos)
  for (const x of geos) x.dispose()
  return g
}

/** 螢幕亮著的細狀態（閒置、完成、下班、空位＝暗） */
export const SCREEN_ON: ReadonlySet<Substate> = new Set(['thinking', 'running', 'writing', 'waiting', 'error', 'interrupted'])

export function RoomShell({ layout, mats }: { layout: OfficeLayout; mats: SceneMaterials }) {
  const { w, d } = layout.room
  const geo = useMemo(() => {
    const zones = layout.zones.filter((z) => z.kind !== 'lounge')
    const lounge = layout.zones.find((z) => z.kind === 'lounge')!
    // 後牆窗：辦公區每 3.2 格一扇
    const windows: THREE.BufferGeometry[] = []
    for (let x = 1.6; x + 1.4 < layout.officeW; x += 3.2) windows.push(box(1.6, 0.9, 0.02, x + 0.8, 1.45, 0.005))
    return {
      floor: box(w, FLOOR_T, d, w / 2, -FLOOR_T / 2, d / 2),
      wallBack: box(w, WALL_H, WALL_T, w / 2, WALL_H / 2, -WALL_T / 2),
      wallLeft: box(WALL_T, WALL_H, d + WALL_T, -WALL_T / 2, WALL_H / 2, d / 2 - WALL_T / 2),
      wallTop: merged([box(w, 0.04, WALL_T, w / 2, WALL_H + 0.02, -WALL_T / 2), box(WALL_T, 0.04, d + WALL_T, -WALL_T / 2, WALL_H + 0.02, d / 2 - WALL_T / 2)]),
      windows: merged(windows),
      rugs: merged(zones.map((z) => box(z.rect.w, RUG_T, z.rect.d, z.rect.x + z.rect.w / 2, RUG_T / 2, z.rect.z + z.rect.d / 2))),
      lounge: box(lounge.rect.w, RUG_T, lounge.rect.d, lounge.rect.x + lounge.rect.w / 2, RUG_T / 2, lounge.rect.z + lounge.rect.d / 2),
    }
  }, [layout, w, d])
  useEffect(() => () => Object.values(geo).forEach((g) => g?.dispose()), [geo])
  return (
    <group>
      <mesh geometry={geo.floor} material={mats.floor} receiveShadow />
      <mesh geometry={geo.wallBack} material={mats.wallR} receiveShadow />
      <mesh geometry={geo.wallLeft} material={mats.wallL} receiveShadow />
      {geo.wallTop && <mesh geometry={geo.wallTop} material={mats.wallTop} />}
      {geo.windows && <mesh geometry={geo.windows} material={mats.window} />}
      {geo.rugs && <mesh geometry={geo.rugs} material={mats.zone} receiveShadow />}
      <mesh geometry={geo.lounge} material={mats.lounge} receiveShadow />
    </group>
  )
}

export function Furniture({
  layout,
  mats,
  manifest,
  substates,
}: {
  layout: OfficeLayout
  mats: SceneMaterials
  manifest: OfficeManifest
  /** session id → 有效細狀態（決定螢幕亮暗） */
  substates: Record<string, Substate>
}) {
  const f = manifest.furniture
  const deskUrl = assetUrl(f.desk)
  const desk = useGLTF(deskUrl)
  const deskTop = modelParts(desk.scene, 1.4).size.y

  const p = useMemo(() => {
    const member: Placement[] = []
    const leader: Placement[] = []
    const chairs: Placement[] = []
    const on: Placement[] = []
    const off: Placement[] = []
    for (const dk of layout.desks) {
      ;(dk.kind === 'leader' ? leader : member).push({ x: dk.x, z: dk.z, rotY: dk.rotY })
      // 人坐在面向的反方向那側；螢幕在桌子另一側、面向人
      const dir = dk.rotY === 0 ? 1 : -1
      const seatOff = dk.d / 2 + 0.35
      chairs.push({ x: dk.x, z: dk.z - dir * seatOff, rotY: dk.rotY + Math.PI })
      const lit = dk.occupant != null && SCREEN_ON.has(substates[dk.occupant])
      const screens = dk.kind === 'leader' ? [-0.42, 0.42] : [0]
      for (const sx of screens) (lit ? on : off).push({ x: dk.x + sx, z: dk.z + dir * 0.18, y: deskTop, rotY: dk.rotY + Math.PI })
    }
    const lounge = layout.zones.find((z) => z.kind === 'lounge')!.rect
    const plants: Placement[] = [
      { x: lounge.x + 0.5, z: lounge.z + 0.5, rotY: 0 },
      { x: lounge.x + lounge.w - 0.5, z: lounge.z + lounge.d - 0.5, rotY: 0 },
      { x: 0.5, z: layout.room.d - 0.5, rotY: 0 },
      { x: layout.officeW - 0.5, z: 0.5, rotY: 0 },
    ]
    return {
      member,
      leader,
      chairs,
      on,
      off,
      plants,
      sofa: [{ x: lounge.x + 6.35, z: lounge.z + 0.55, rotY: 0 }],
      table: [{ x: lounge.x + 6.35, z: lounge.z + 2.0, rotY: 0 }],
      coffee: [{ x: lounge.x + 2.05, z: lounge.z + 0.45, rotY: 0 }],
    }
  }, [layout, substates, deskTop])

  const mat = (model: string) => (name: string) => furnitureMaterial(mats, model, name)
  const url = (k: string) => assetUrl(f[k])
  return (
    <group>
      <InstancedModel url={deskUrl} width={1.4} placements={p.member} material={mat('desk')} castShadow />
      <InstancedModel url={deskUrl} width={1.9} placements={p.leader} material={mat('desk')} castShadow />
      <InstancedModel url={url('chairDesk')} width={0.5} placements={p.chairs} material={mat('chairDesk')} />
      <InstancedModel url={url('computerScreen')} width={0.55} placements={[...p.on, ...p.off]} material={mat('computerScreen')} only={(n) => n !== 'metal'} />
      <InstancedModel url={url('computerScreen')} width={0.55} placements={p.on} material={() => mats.screenOn} only={(n) => n === 'metal'} />
      <InstancedModel url={url('computerScreen')} width={0.55} placements={p.off} material={() => mats.screenOff} only={(n) => n === 'metal'} />
      <InstancedModel url={url('loungeSofa')} width={2.4} placements={p.sofa} material={mat('loungeSofa')} />
      <InstancedModel url={url('tableCoffee')} width={1.1} placements={p.table} material={mat('tableCoffee')} />
      <InstancedModel url={url('kitchenCoffeeMachine')} width={0.5} placements={p.coffee} material={mat('kitchenCoffeeMachine')} />
      <InstancedModel url={url('pottedPlant')} width={0.5} placements={p.plants} material={mat('pottedPlant')} />
    </group>
  )
}
