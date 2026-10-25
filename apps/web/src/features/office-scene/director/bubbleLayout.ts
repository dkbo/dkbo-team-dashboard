// 事件氣泡的跨角色排版（§6.15、AC10「頭頂不打架」）：純函式，輸入螢幕座標。
// 預設位置＝頭部右側、標記下一列；撞到別顆氣泡、標記、徽章或 canvas 邊就依序換：另一側 → 往下一列 → …，
// 取第一個零衝突的；全都有衝突就取衝突面積最小的（同分取先試的）。
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}
export interface BubbleReq {
  id: string
  /** 頭頂錨點（event-stack 的左上角，螢幕座標） */
  ax: number
  ay: number
  /** 氣泡尺寸 */
  w: number
  h: number
}
export interface Placement {
  side: 'right' | 'left'
  /** 0＝標記下一列，每加 1 往下一個 ROW */
  row: number
}

/** 氣泡離頭部錨點的水平間距（= tailwind left-6／right-6）與垂直起點（= top-1） */
export const BUBBLE_DX = 24
export const BUBBLE_DY = 4
/** 往下錯開一列的高度（氣泡 24 + 間隙 2） */
export const BUBBLE_ROW = 26
export const MAX_ROW = 3
const GAP = 2

export function bubbleRect(r: BubbleReq, p: Placement): Rect {
  return {
    x: p.side === 'right' ? r.ax + BUBBLE_DX : r.ax - BUBBLE_DX - r.w,
    y: r.ay + BUBBLE_DY + p.row * BUBBLE_ROW,
    w: r.w,
    h: r.h,
  }
}

function overlapArea(a: Rect, b: Rect, gap = GAP): number {
  const w = Math.min(a.x + a.w, b.x + b.w + gap) - Math.max(a.x, b.x - gap)
  const h = Math.min(a.y + a.h, b.y + b.h + gap) - Math.max(a.y, b.y - gap)
  return w > 0 && h > 0 ? w * h : 0
}

/** 氣泡露在 bounds 外的面積 */
function outsideArea(a: Rect, bounds: Rect): number {
  const w = Math.min(a.x + a.w, bounds.x + bounds.w) - Math.max(a.x, bounds.x)
  const h = Math.min(a.y + a.h, bounds.y + bounds.h) - Math.max(a.y, bounds.y)
  return a.w * a.h - (w > 0 && h > 0 ? w * h : 0)
}

const CANDIDATES: Placement[] = Array.from({ length: MAX_ROW + 1 }, (_, row) => [
  { side: 'right', row } as Placement,
  { side: 'left', row } as Placement,
]).flat()

export function placeBubbles(reqs: BubbleReq[], obstacles: Rect[], bounds: Rect): Record<string, Placement> {
  const out: Record<string, Placement> = {}
  const placed: Rect[] = []
  // 依 id 排序：結果與輸入順序無關、相機停下重算也不會換邊閃動
  for (const r of [...reqs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    let best = CANDIDATES[0]
    let bestCost = Infinity
    for (const c of CANDIDATES) {
      const rect = bubbleRect(r, c)
      let cost = outsideArea(rect, bounds) * 4
      for (const o of obstacles) cost += overlapArea(rect, o)
      for (const o of placed) cost += overlapArea(rect, o)
      if (cost < bestCost) {
        best = c
        bestCost = cost
      }
      if (cost === 0) break
    }
    out[r.id] = best
    placed.push(bubbleRect(r, best))
  }
  return out
}

export interface BubbleRegistry {
  /** 排一顆：把已登記的別顆氣泡當障礙物，結果登記起來給後來的看 */
  place(req: BubbleReq, obstacles: Rect[], bounds: Rect): Placement
  release(id: string): void
}

/**
 * 同一時間存在的氣泡互相知道位置：每顆氣泡在自己掛上的那個 commit 同步排好（不等 DOM 量測或去抖），
 * 先掛的先佔位，後掛的讓開。位置用錨點＋placement 解析計算，不讀別顆氣泡的 DOM（它的 <Html> 可能還沒定位）。
 */
export function createBubbleRegistry(): BubbleRegistry {
  const rects = new Map<string, Rect>()
  return {
    place(req, obstacles, bounds) {
      const others = [...rects].filter(([id]) => id !== req.id).map(([, r]) => r)
      const p = placeBubbles([req], [...obstacles, ...others], bounds)[req.id]
      rects.set(req.id, bubbleRect(req, p))
      return p
    },
    release(id) {
      rects.delete(id)
    },
  }
}
