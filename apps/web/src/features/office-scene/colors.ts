// 場景色一律從 CSS 變數讀（office 規格 How to use 1），不在 JS 寫色值。

export interface Rgba {
  /** sRGB 0–1 */
  r: number
  g: number
  b: number
  a: number
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const RGB = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i

export function parseCssColor(raw: string | null | undefined): Rgba | null {
  const v = raw?.trim() ?? ''
  const h = HEX.exec(v)
  if (h) {
    let s = h[1]
    if (s.length <= 4) s = [...s].map((c) => c + c).join('')
    const n = (i: number) => parseInt(s.slice(i, i + 2), 16) / 255
    return { r: n(0), g: n(2), b: n(4), a: s.length === 8 ? n(6) : 1 }
  }
  const m = RGB.exec(v)
  if (m) {
    const a = m[4] == null ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])
    return { r: +m[1] / 255, g: +m[2] / 255, b: +m[3] / 255, a }
  }
  return null
}

/** 讀 :root（或 .dark）上的 CSS 變數 */
export function readCssVar(name: string, el: Element = document.documentElement): Rgba | null {
  return parseCssColor(getComputedStyle(el).getPropertyValue(name))
}
