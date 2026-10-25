// qa BUG-3 再驗：氣泡「掛上的那一個 commit」就要排好（useLayoutEffect 同步），不能等事後去抖
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { PlacedBubble } from '@/features/office-scene/director/PlacedBubble'
import { createBubbleRegistry } from '@/features/office-scene/director/bubbleLayout'
import type { BubbleState } from '@/features/office-scene/director/runtime'

beforeAll(() => {
  // jsdom 不排版：氣泡固定 94x24
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 94 })
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 24 })
})
afterEach(cleanup)

const bubble = (key: string): BubbleState =>
  ({ key, kind: 'review-fix', until: Date.now() + 3000, spec: { emoji: '😓', label: '要修 2 條', tone: 'warn' } }) as unknown as BubbleState
const BOUNDS = { x: 0, y: 0, w: 1000, h: 700 }

function mount(id: string, ax: number, ay: number, registry = createBubbleRegistry(), obstacles = () => [] as { x: number; y: number; w: number; h: number }[]) {
  const r = render(<PlacedBubble id={id} bubble={bubble(id)} anchor={() => ({ x: ax, y: ay })} bounds={() => BOUNDS} obstacles={obstacles} registry={registry} tick={0} />)
  return r.container.querySelector('[data-testid="event-bubble"]') as HTMLElement
}

describe('PlacedBubble（首繪就排好）', () => {
  it('第一個 commit 後就帶著 placement：並肩兩位 dev 的氣泡不相交', () => {
    const registry = createBubbleRegistry()
    const a = mount('wE:p2', 400, 300, registry)
    const b = mount('wE:p3', 430, 314, registry)
    // 一顆在右一顆在左，或不同列：data-side／data-row 在同步 render 完就存在
    const pa = [a.dataset.side, a.dataset.row]
    const pb = [b.dataset.side, b.dataset.row]
    expect(pa[0]).toBeDefined()
    expect(pb[0]).toBeDefined()
    expect(pa).not.toEqual(pb)
  })

  it('沒有衝突：維持預設（右側第 0 列）', () => {
    const a = mount('a', 100, 100)
    expect([a.dataset.side, a.dataset.row]).toEqual(['right', '0'])
  })

  it('避開障礙物（別人的標記）', () => {
    const a = mount('a', 400, 300, createBubbleRegistry(), () => [{ x: 424, y: 300, w: 100, h: 28 }])
    expect([a.dataset.side, a.dataset.row]).not.toEqual(['right', '0'])
  })
})
