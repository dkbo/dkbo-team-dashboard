// 區牌讓疊層（§4.3 擺放驗收、AC8）：預設鏡頭下區牌不得被 FinderPanel 等疊層切到。純函式；只在鏡頭停下後、疊層尺寸變了才算。
export interface SignBox {
  key: string
  x: number
  y: number
  w: number
  h: number
}
export interface OverlayBox {
  x: number
  y: number
  w: number
  h: number
}

/** 推開後與疊層的間隙（px） */
const SIGN_GAP = 8

const hit = (a: OverlayBox, b: OverlayBox) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/**
 * 回傳每塊被疊層壓住的區牌要往右推多少 px（座標都相對 canvas 左上）。
 * 推到右緣出 canvas 就不推（回傳裡不列），沒壓到的也不列。
 */
export function signShifts(signs: SignBox[], overlays: OverlayBox[], canvas: { w: number; h: number }): Record<string, number> {
  const out: Record<string, number> = {}
  for (const s of signs) {
    let x = s.x
    // 推過一個疊層後可能撞到下一個：最多繞 overlays.length 圈
    for (let i = 0; i <= overlays.length; i++) {
      const o = overlays.find((o) => hit({ ...s, x }, o))
      if (!o) break
      x = o.x + o.w + SIGN_GAP
    }
    if (x === s.x) continue
    if (overlays.some((o) => hit({ ...s, x }, o)) || x + s.w > canvas.w) continue
    out[s.key] = x - s.x
  }
  return out
}

/** 場景上方會蓋住區牌的疊層（FinderPanel、StateCounts、圖例、視角控制） */
export const OVERLAY_SELECTOR = '[data-testid="office-finder"], [data-testid="office-state-counts"], [role="group"][aria-label="圖例"], [role="group"][aria-label="視角"]'

export const sameShift = (a: Record<string, number>, b: Record<string, number>) => {
  const ka = Object.keys(a)
  return ka.length === Object.keys(b).length && ka.every((k) => Math.abs(a[k] - b[k]) < 0.5)
}
