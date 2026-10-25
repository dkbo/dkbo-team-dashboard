// 頭頂的 EventBubble：掛上的那個 commit 就用 useLayoutEffect 同步排好（bubbleLayout），首繪不會疊。
// 住在 drei <Html> 的另一個 React root，拿不到 r3f／React context：一切靠 props（錨點、障礙物、登記簿都是函式或物件）。
import { useLayoutEffect, useRef, useState } from 'react'
import { EventBubble } from '@/components/app/office'
import { BUBBLE_DY, BUBBLE_ROW, type BubbleRegistry, type Placement, type Rect } from './bubbleLayout'
import type { BubbleState } from './runtime'

const DEFAULT_PLACEMENT: Placement = { side: 'right', row: 0 }

export interface PlacedBubbleProps {
  id: string
  bubble: BubbleState
  /** 頭頂錨點（視窗座標）；用 3D 位置投影算，不讀 <Html> 的 DOM（它掛上當下可能還沒定位） */
  anchor(): { x: number; y: number } | null
  bounds(): Rect
  /** 標記、徽章等障礙物（視窗座標） */
  obstacles(): Rect[]
  registry: BubbleRegistry
  /** 相機停下／標記縮放後 +1，重排一次 */
  tick: number
}

export function PlacedBubble(props: PlacedBubbleProps) {
  const { id, bubble, registry, tick } = props
  const ref = useRef<HTMLSpanElement>(null)
  const latest = useRef(props)
  latest.current = props
  const [placement, setPlacement] = useState<Placement>(DEFAULT_PLACEMENT)
  useLayoutEffect(() => {
    const el = ref.current
    const p = latest.current
    const a = p.anchor()
    if (!el || !a) return
    const next = registry.place({ id, ax: a.x, ay: a.y, w: el.offsetWidth, h: el.offsetHeight }, p.obstacles(), p.bounds())
    setPlacement((prev) => (prev.side === next.side && prev.row === next.row ? prev : next))
  }, [id, registry, tick, bubble.key])
  useLayoutEffect(() => () => registry.release(id), [id, registry])
  return (
    <span
      ref={ref}
      data-testid="event-bubble"
      data-kind={bubble.kind}
      data-side={placement.side}
      data-row={placement.row}
      className={placement.side === 'left' ? 'absolute right-6' : 'absolute left-6'}
      style={{ top: BUBBLE_DY + placement.row * BUBBLE_ROW }}
    >
      <EventBubble emoji={bubble.spec.emoji} label={bubble.spec.label} tone={bubble.spec.tone} until={bubble.until} />
    </span>
  )
}
