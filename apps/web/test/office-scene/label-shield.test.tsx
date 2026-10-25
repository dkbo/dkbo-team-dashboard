// BUG-1（qa）：物件標籤的 pointerdown／click 冒泡到 R3F 事件源（wrap）——
// click 觸發 onPointerMissed→onSelect(null) 把導頁蓋回 /office；pointerdown 被 OrbitControls 抓去 capture，標籤收回、pointerup 落到 canvas。
import { act, fireEvent } from '@testing-library/react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LabelShield } from '@/features/office-scene/objects/LabelShield'

// 真實結構：事件源（wrap）底下，drei <Html> 另開一個 React root 放標籤
function mount(onOpen = vi.fn()) {
  const outer = vi.fn()
  const source = document.createElement('div')
  const html = document.createElement('div')
  source.append(html)
  document.body.append(source)
  for (const t of ['pointerdown', 'pointerup', 'click']) source.addEventListener(t, outer)
  const root = createRoot(html)
  act(() =>
    root.render(
      <LabelShield>
        <a href="/herdr" onClick={(e) => (e.preventDefault(), onOpen())}>
          herdr
        </a>
      </LabelShield>,
    ),
  )
  cleanups.push(() => (act(() => root.unmount()), source.remove()))
  return { outer, onOpen, link: html.querySelector('a')! }
}
const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((f) => f()))

describe('LabelShield', () => {
  it.each([
    ['pointerDown', 'pointerdown'],
    ['pointerUp', 'pointerup'],
    ['click', 'click'],
  ] as const)('%s 不冒泡到事件源', (fire, type) => {
    const { outer, link } = mount()
    fireEvent[fire](link)
    expect(outer.mock.calls.filter(([e]) => e.type === type)).toHaveLength(0)
  })

  it('click 仍交給標籤自己的 onClick（開頁）', () => {
    const { onOpen, link } = mount()
    fireEvent.click(link)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })
})
