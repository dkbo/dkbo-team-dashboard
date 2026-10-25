// lobby AC3：EventBubble（§6.15、§6.17）—— 高 h-6、soft 底＋status 框、shadow-soft、淡入停留淡出、到 until 自己隱藏
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { EventBubble } from '@/components/app/office/EventBubble'

const cls = (el: Element | null) => el?.getAttribute('class') ?? ''
const bubble = (c: HTMLElement) => c.querySelector('[data-slot="event-bubble"]')!
const NOW = 1_800_000_000_000

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => vi.useRealTimers())

describe('EventBubble', () => {
  it.each(['ok', 'warn', 'info', 'danger'] as const)('%s：bg-status-%s-soft、border-status-%s、文字 fg', (tone) => {
    const { container } = render(<EventBubble emoji="👍" label="通過" tone={tone} until={NOW + 3000} />)
    const el = bubble(container)
    expect(el).toHaveAttribute('data-tone', tone)
    for (const c of [`bg-status-${tone}-soft`, `border-status-${tone}`, `text-status-${tone}-fg`]) expect(cls(el)).toContain(c)
  })

  it('尺寸與外觀：h-6、px-3、rounded-full、border-(length:--border-w-pill)、shadow-soft', () => {
    const { container } = render(<EventBubble emoji="🔍" label="審查 波 2" tone="info" until={NOW + 3000} />)
    for (const c of ['h-6', 'px-3', 'rounded-full', 'border-(length:--border-w-pill)', 'shadow-soft']) expect(cls(bubble(container))).toContain(c)
  })

  it('emoji 是裝飾（aria-hidden），label 是文字；整顆 role=status 不另報讀（live region 由頁面播）', () => {
    const { container } = render(<EventBubble emoji="😓" label="要修 2 條" tone="warn" until={NOW + 3000} />)
    expect(screen.getByText('要修 2 條')).toBeInTheDocument()
    expect(container.querySelector('[data-slot="event-bubble-emoji"]')).toHaveAttribute('aria-hidden', 'true')
    expect(bubble(container)).not.toHaveAttribute('aria-live')
  })

  it('淡入停留淡出：animate-event-bubble＋motion-reduce:animate-none；動畫時長取剩餘毫秒', () => {
    const { container } = render(<EventBubble emoji="✅" label="波 3 關閉" tone="ok" until={NOW + 3000} />)
    expect(cls(bubble(container))).toContain('animate-event-bubble')
    expect(cls(bubble(container))).toContain('motion-reduce:animate-none')
    expect((bubble(container) as HTMLElement).style.animationDuration).toBe('3000ms')
  })

  it('pointer-events-none（不擋住角色與標記的 hover）、不換行', () => {
    const { container } = render(<EventBubble emoji="👍" label="通過" tone="ok" until={NOW + 3000} />)
    expect(cls(bubble(container))).toContain('pointer-events-none')
    expect(cls(bubble(container))).toContain('whitespace-nowrap')
  })

  it('到 until 自己隱藏；until 給 Date 與 epoch ms 同義', () => {
    const { container } = render(<EventBubble emoji="👍" label="通過" tone="ok" until={new Date(NOW + 3000)} />)
    expect(bubble(container)).not.toBeNull()
    act(() => void vi.advanceTimersByTime(2999))
    expect(bubble(container)).not.toBeNull()
    act(() => void vi.advanceTimersByTime(2))
    expect(bubble(container)).toBeNull()
  })

  it('until 已過：一開始就不渲染', () => {
    const { container } = render(<EventBubble emoji="👍" label="通過" tone="ok" until={NOW - 1} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('until 延後（新事件頂替）會重新計時，不會被舊計時器提前隱藏', () => {
    const { container, rerender } = render(<EventBubble emoji="👍" label="通過" tone="ok" until={NOW + 3000} />)
    act(() => void vi.advanceTimersByTime(2000))
    rerender(<EventBubble emoji="👍" label="通過" tone="ok" until={NOW + 8000} />)
    act(() => void vi.advanceTimersByTime(4000))
    expect(bubble(container)).not.toBeNull()
    act(() => void vi.advanceTimersByTime(2100))
    expect(bubble(container)).toBeNull()
  })
})
