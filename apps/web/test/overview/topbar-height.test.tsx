import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TopBar } from '@/features/topbar/TopBar'
import { resetDashStore } from '@/store/store'

// 活動欄的 sticky top 要等於它的自然位置（頂部列高 + 1rem），頂部列在窄一點的寬度會換行，所以由 TopBar 量高度寫進 --topbar-h
let observed: { cb: ResizeObserverCallback; el: Element } | null = null
class FakeRO {
  constructor(private cb: ResizeObserverCallback) {}
  observe(el: Element) {
    observed = { cb: this.cb, el }
  }
  unobserve() {}
  disconnect() {
    observed = null
  }
}

beforeEach(() => {
  resetDashStore()
  observed = null
  vi.stubGlobal('ResizeObserver', FakeRO)
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  document.documentElement.style.removeProperty('--topbar-h')
})

describe('TopBar 高度變數', () => {
  it('頂部列尺寸變化時把高度寫進 <html> 的 --topbar-h，卸載時停止觀察', () => {
    const { unmount } = render(
      <MemoryRouter>
        <TooltipProvider>
          <TopBar now={0} />
        </TooltipProvider>
      </MemoryRouter>,
    )
    expect(observed?.el.tagName).toBe('HEADER')
    const header = observed!.el
    vi.spyOn(header, 'getBoundingClientRect').mockReturnValue({ height: 68 } as DOMRect)
    act(() => observed!.cb([], {} as ResizeObserver))
    expect(document.documentElement.style.getPropertyValue('--topbar-h')).toBe('68px')
    unmount()
    expect(observed).toBeNull()
  })
})
