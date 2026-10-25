// 事件氣泡的跨角色排版（AC10 頭頂不打架）：bubble 與 bubble、標記、徽章兩兩不相交
import { describe, expect, it } from 'vitest'
import { placeBubbles, bubbleRect, type BubbleReq, type Rect } from '@/features/office-scene/director/bubbleLayout'

const BOUNDS: Rect = { x: 0, y: 0, w: 1000, h: 700 }
const W = 94
const H = 24
const req = (id: string, ax: number, ay: number): BubbleReq => ({ id, ax, ay, w: W, h: H })
const hit = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

describe('placeBubbles', () => {
  it('沒有衝突：全部維持頭部右側、標記下一列（預設）', () => {
    const p = placeBubbles([req('a', 100, 100), req('b', 600, 100)], [], BOUNDS)
    expect(p.a).toEqual({ side: 'right', row: 0 })
    expect(p.b).toEqual({ side: 'right', row: 0 })
  })

  it('並肩的兩位 dev（頭相距 30px，bubble 各 94 寬）：排開後兩顆不相交', () => {
    const reqs = [req('wE:p2', 400, 300), req('wE:p3', 430, 314)]
    const p = placeBubbles(reqs, [], BOUNDS)
    const [a, b] = reqs.map((r) => bubbleRect(r, p[r.id]))
    expect(hit(a, b)).toBe(false)
  })

  it('三位擠在一起也全部不相交，且結果與輸入順序無關', () => {
    const reqs = [req('c', 410, 305), req('a', 400, 300), req('b', 430, 314)]
    const p1 = placeBubbles(reqs, [], BOUNDS)
    const p2 = placeBubbles([...reqs].reverse(), [], BOUNDS)
    expect(p2).toEqual(p1)
    const rects = reqs.map((r) => bubbleRect(r, p1[r.id]))
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(hit(rects[i], rects[j])).toBe(false)
  })

  it('避開別人的標記與徽章（障礙物）', () => {
    const marker: Rect = { x: 424, y: 300, w: 100, h: 28 } // 蓋住 a 預設位置
    const r = req('a', 400, 300)
    const p = placeBubbles([r], [marker], BOUNDS)
    expect(hit(bubbleRect(r, p.a), marker)).toBe(false)
  })

  it('碰 canvas 右緣：翻到左側，且不出界', () => {
    const r = req('a', 940, 100)
    const p = placeBubbles([r], [], BOUNDS)
    expect(p.a.side).toBe('left')
    const b = bubbleRect(r, p.a)
    expect(b.x).toBeGreaterThanOrEqual(0)
    expect(b.x + b.w).toBeLessThanOrEqual(1000)
  })

  it('四面都被擋住：退回衝突面積最小的位置，不丟例外', () => {
    const wall: Rect = { x: 0, y: 0, w: 1000, h: 700 }
    const p = placeBubbles([req('a', 400, 300)], [wall], BOUNDS)
    expect(p.a).toEqual({ side: 'right', row: 0 })
  })

  it('同樣輸入每次結果相同（相機停下重算不閃）', () => {
    const reqs = [req('a', 400, 300), req('b', 430, 314)]
    expect(placeBubbles(reqs, [], BOUNDS)).toEqual(placeBubbles(reqs, [], BOUNDS))
  })
})
