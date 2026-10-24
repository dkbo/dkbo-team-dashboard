// 共用材質（§4.7）：每種用途一份，顏色物件直接引用色盤，主題切換只改色值。
import * as THREE from 'three'
import type { ScenePalette, Token } from './palette'

export type SceneMaterials = ReturnType<typeof createMaterials>

export function createMaterials(p: ScenePalette) {
  const disposables: THREE.Material[] = []
  const track = <M extends THREE.Material>(m: M) => (disposables.push(m), m)
  const std = (t: Token) => {
    const m = track(new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 }))
    m.color = p.color[t]
    return m
  }
  const basic = (t: Token, opacity?: number) => {
    const m = track(new THREE.MeshBasicMaterial())
    m.color = p.color[t]
    if (opacity != null) {
      m.transparent = true
      m.opacity = opacity
      m.depthWrite = false
    }
    return m
  }
  const screenOn = track(new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0 }))
  screenOn.color = p.color['--scene-screen-on']
  screenOn.emissive = p.color['--scene-screen-on']
  const shadow = basic('--scene-shadow', 1)
  const glow = basic('--scene-screen-on', 0.16)
  const mats = {
    floor: std('--scene-floor'),
    floorEdge: std('--scene-floor-edge'),
    zone: std('--scene-zone'),
    zoneEdge: std('--scene-zone-edge'),
    lounge: std('--scene-lounge'),
    wallL: std('--scene-wall-l'),
    wallR: std('--scene-wall-r'),
    wallTop: std('--scene-wall-top'),
    window: std('--scene-window'),
    desk: basic('--scene-desk'),
    deskSide: basic('--scene-desk-side'),
    monitor: basic('--scene-monitor'),
    screenOff: basic('--scene-screen-off'),
    screenOn,
    couch: basic('--scene-couch'),
    plant: basic('--scene-plant'),
    cabinet: basic('--scene-cabinet'),
    cabinetSide: basic('--scene-cabinet-side'),
    board: std('--scene-board'),
    shadow,
    glow,
    ringDanger: basic('--status-danger', 1),
    ringDangerOuter: basic('--status-danger', 0.4),
    ringDangerFill: basic('--status-danger', 0.14),
    ringSelect: basic('--ring', 1),
    smokeA: basic('--status-danger', 0.35),
    smokeB: basic('--status-danger', 0.2),
  }
  // 透明度與 emissive 強度跟著色盤走
  const sync = () => {
    shadow.opacity = p.alpha['--scene-shadow']
    screenOn.emissiveIntensity = p.light.screen
  }
  sync()
  const unsubscribe = p.subscribe(sync)
  return Object.assign(mats, {
    dispose() {
      unsubscribe()
      for (const m of disposables) m.dispose()
    },
  })
}

/** Kenney 家具材質名 → 場景材質（只對家具乘場景色，§1.3） */
export function furnitureMaterial(mats: SceneMaterials, model: string, name: string): THREE.Material {
  switch (model) {
    case 'desk':
      return name === 'wood' ? mats.desk : mats.deskSide
    case 'chairDesk':
      return name === 'carpet' ? mats.couch : mats.monitor
    case 'computerScreen':
      return name === 'metal' ? mats.screenOff : mats.monitor
    case 'loungeSofa':
    case 'loungeChair':
      return name === 'carpet' ? mats.couch : mats.deskSide
    case 'tableCoffee':
      return mats.desk
    case 'pottedPlant':
    case 'plantSmall1':
      return name === 'plant' ? mats.plant : mats.deskSide
    case 'kitchenCoffeeMachine':
      return name === 'metal' ? mats.cabinet : name === 'carpetWhite' ? mats.board : mats.monitor
    default:
      return name.startsWith('wood') ? mats.cabinet : mats.cabinetSide
  }
}
