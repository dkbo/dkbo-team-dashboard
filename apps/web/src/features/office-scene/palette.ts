// 場景色盤：所有 3D 色從 CSS 變數讀（How to use 1）；主題切換時 400ms 線性過渡（theme-lerp，reduced motion 直接切）。
// 材質共用同一個 THREE.Color 物件，過渡時只改色值、不換材質。
import * as THREE from 'three'
import { parseCssColor } from './colors'

export const TOKENS = [
  '--scene-sky',
  '--scene-floor',
  '--scene-floor-edge',
  '--scene-zone',
  '--scene-zone-edge',
  '--scene-lounge',
  '--scene-wall-l',
  '--scene-wall-r',
  '--scene-wall-top',
  '--scene-window',
  '--scene-desk',
  '--scene-desk-side',
  '--scene-monitor',
  '--scene-screen-off',
  '--scene-screen-on',
  '--scene-couch',
  '--scene-plant',
  '--scene-shadow',
  '--scene-cabinet',
  '--scene-cabinet-side',
  '--scene-board',
  '--status-danger',
  '--ring',
  '--rank-senior',
  '--rank-mid',
  '--rank-junior',
  '--rank-visitor',
  '--light-hemi-sky',
  '--light-hemi-ground',
  '--light-key',
] as const
export type Token = (typeof TOKENS)[number]

/** 燈光 token 還沒有時的退路（同樣是 token，不寫色值） */
const FALLBACK: Partial<Record<Token, Token>> = {
  '--light-hemi-sky': '--scene-wall-l',
  '--light-hemi-ground': '--scene-floor',
  '--light-key': '--scene-wall-l',
}

/** §1.5 燈光強度（數值 token，規格值） */
const SPEC_LIGHT = {
  light: { hemi: 0.9, key: 1.2, screen: 0.4 },
  dark: { hemi: 0.35, key: 0.4, screen: 0.9 },
} as const
/** 主光方向 (-5, 10, 4) 照在地板上的 cos */
const KEY_COS = 10 / Math.hypot(5, 10, 4)
/**
 * three r155 之後燈光是物理單位（舊版會在 shader 裡乘 π）；規格的強度比照舊版。
 * 這裡把兩組強度各自正規化成「地板朝上的總照度＝π」，地板看起來就是 `scene-floor` 本色，
 * 亮暗的差別留在 token 的色值與燈光色（暖白日光／冷藍月光）與比例上。
 */
function normalize(l: { hemi: number; key: number; screen: number }) {
  const k = Math.PI / (l.hemi + l.key * KEY_COS)
  return { hemi: l.hemi * k, key: l.key * k, screen: l.screen }
}
export const LIGHT = { light: normalize(SPEC_LIGHT.light), dark: normalize(SPEC_LIGHT.dark) }

export type Theme = 'light' | 'dark'

export class ScenePalette {
  readonly color = {} as Record<Token, THREE.Color>
  readonly alpha = {} as Record<Token, number>
  readonly light = { hemi: LIGHT.light.hemi as number, key: LIGHT.light.key as number, screen: LIGHT.light.screen as number }
  private from = new Map<Token, THREE.Color>()
  private to = new Map<Token, THREE.Color>()
  private lightFrom = { ...this.light }
  private lightTo = { ...this.light }
  private start = 0
  private duration = 0
  private listeners = new Set<() => void>()

  constructor() {
    for (const t of TOKENS) {
      this.color[t] = new THREE.Color()
      this.alpha[t] = 1
    }
  }

  private readRaw(style: CSSStyleDeclaration, t: Token) {
    const raw = style.getPropertyValue(t)
    return parseCssColor(raw) ?? (FALLBACK[t] ? parseCssColor(style.getPropertyValue(FALLBACK[t]!)) : null)
  }

  /** 讀目前 CSS 變數；durationMs > 0 時從現值過渡過去 */
  read(theme: Theme, durationMs: number, now = performance.now()) {
    const style = getComputedStyle(document.documentElement)
    for (const t of TOKENS) {
      const c = this.readRaw(style, t)
      if (!c) continue
      const target = new THREE.Color().setRGB(c.r, c.g, c.b, THREE.SRGBColorSpace)
      this.alpha[t] = c.a
      this.from.set(t, this.color[t].clone())
      this.to.set(t, target)
    }
    this.lightFrom = { ...this.light }
    this.lightTo = { ...LIGHT[theme] }
    this.start = now
    this.duration = durationMs
    this.step(now)
  }

  /** 推進過渡；回傳是否還在過渡中 */
  step(now = performance.now()): boolean {
    const k = this.duration > 0 ? Math.min(1, (now - this.start) / this.duration) : 1
    for (const [t, to] of this.to) this.color[t].copy(this.from.get(t)!).lerp(to, k)
    for (const key of ['hemi', 'key', 'screen'] as const) this.light[key] = this.lightFrom[key] + (this.lightTo[key] - this.lightFrom[key]) * k
    for (const l of this.listeners) l()
    return k < 1
  }

  /** 色值變了要同步的東西（透明度、emissive）訂閱這裡 */
  subscribe(fn: () => void) {
    this.listeners.add(fn)
    return () => void this.listeners.delete(fn)
  }
}
