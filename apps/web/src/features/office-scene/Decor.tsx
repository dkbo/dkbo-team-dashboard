// 地面圈與桌前光暈（§1.4）：每一層一個 InstancedMesh，等你／錯誤再多也只多幾個 draw call。
// ring-alert 一律靜態雙圈（脈動在 DOM 標記上，E14）；error 頭上兩顆紅煙；暗色時螢幕亮著的桌前地面光暈。
import { useLayoutEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { Substate } from '@dash/shared'
import { HEAD_Y } from './Character'
import type { OfficeLayout } from './layout'
import type { SceneMaterials } from './materials'
import { SCREEN_ON } from './Room'

const GEO = {
  alertFill: new THREE.CircleGeometry(0.95, 40).rotateX(-Math.PI / 2),
  alertOuter: new THREE.RingGeometry(0.92, 0.95, 48).rotateX(-Math.PI / 2),
  alertInner: new THREE.RingGeometry(0.59, 0.65, 48).rotateX(-Math.PI / 2),
  smoke: new THREE.SphereGeometry(0.07, 10, 8),
  glow: new THREE.CircleGeometry(1.1, 32).rotateX(-Math.PI / 2),
}

const m4 = new THREE.Matrix4()

function Layer({ geometry, material, points, y, order, scale = 1 }: { geometry: THREE.BufferGeometry; material: THREE.Material; points: { x: number; y?: number; z: number }[]; y: number; order: number; scale?: number }) {
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(geometry, material, Math.max(1, points.length))
    m.renderOrder = order
    return m
  }, [geometry, material, points.length, order])
  useLayoutEffect(() => {
    points.forEach((p, i) => mesh.setMatrixAt(i, m4.makeScale(scale, scale, scale).setPosition(p.x, (p.y ?? 0) + y, p.z)))
    mesh.count = points.length
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [mesh, points, y, scale])
  useLayoutEffect(() => () => mesh.dispose(), [mesh])
  return points.length > 0 ? <primitive object={mesh} /> : null
}

export function Decor({ layout, subs, mats, dark }: { layout: OfficeLayout; subs: Record<string, Substate>; mats: SceneMaterials; dark: boolean }) {
  const pts = useMemo(() => {
    const alert: { x: number; z: number }[] = []
    const smoke: { x: number; y: number; z: number }[] = []
    for (const [id, p] of Object.entries(layout.places)) {
      const sub = subs[id]
      if (sub !== 'waiting' && sub !== 'error') continue
      alert.push({ x: p.x, z: p.z })
      if (sub === 'error') smoke.push({ x: p.x + 0.12, y: HEAD_Y[p.pose] + 0.08, z: p.z })
    }
    const glow = layout.desks
      .filter((d) => d.occupant != null && SCREEN_ON.has(subs[d.occupant]))
      .map((d) => ({ x: d.x, z: d.z + (d.rotY === 0 ? -0.5 : 0.5) }))
    return { alert, smoke, smoke2: smoke.map((s) => ({ x: s.x - 0.14, y: s.y + 0.12, z: s.z })), glow }
  }, [layout, subs])
  return (
    <>
      <Layer geometry={GEO.alertFill} material={mats.ringDangerFill} points={pts.alert} y={0.012} order={2} />
      <Layer geometry={GEO.alertOuter} material={mats.ringDangerOuter} points={pts.alert} y={0.013} order={3} />
      <Layer geometry={GEO.alertInner} material={mats.ringDanger} points={pts.alert} y={0.013} order={3} />
      <Layer geometry={GEO.smoke} material={mats.smokeA} points={pts.smoke} y={0} order={5} />
      <Layer geometry={GEO.smoke} material={mats.smokeB} points={pts.smoke2} y={0} order={5} scale={0.8} />
      {dark && <Layer geometry={GEO.glow} material={mats.glow} points={pts.glow} y={0.008} order={1} />}
    </>
  )
}
