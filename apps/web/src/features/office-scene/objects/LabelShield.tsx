import type { ComponentProps, SyntheticEvent } from 'react'

// 標籤是 DOM（drei <Html> 掛在事件源 wrap 底下）：它的指標事件會冒泡到 R3F／OrbitControls 的監聽，
// click 變成 onPointerMissed（選取清空、導頁被蓋回）、pointerdown 被 OrbitControls capture（標籤收回、pointerup 落到 canvas）。
// React 的 stopPropagation 會連原生事件一起停在 Html 的 root，不會再往上。
const stop = (e: SyntheticEvent) => e.stopPropagation()

export function LabelShield(props: ComponentProps<'div'>) {
  return <div {...props} onPointerDown={stop} onPointerUp={stop} onClick={stop} />
}
