// lobby AC3：EventBadge（§5.3、§6.15）—— 20 圓 status-warn 實心、2px popover 框、shadow-pop、「!」on-color、進場 badge-pop
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EventBadge } from '@/components/app/office/EventBadge'

const cls = (el: Element | null) => el?.getAttribute('class') ?? ''
const badge = (c: HTMLElement) => c.querySelector('[data-slot="event-badge"]')!

describe('EventBadge', () => {
  it('default：size-5 圓、bg-status-warn、2px popover 框、shadow-pop、「!」text-on-color', () => {
    const { container } = render(<EventBadge kind="escalate" />)
    const el = badge(container)
    expect(el).toHaveAttribute('data-kind', 'escalate')
    expect(el).toHaveAttribute('data-size', 'default')
    for (const c of ['size-5', 'rounded-full', 'bg-status-warn', 'border-2', 'border-popover', 'shadow-pop', 'text-on-color']) expect(cls(el)).toContain(c)
    expect(el).toHaveTextContent('!')
  })

  it('sm（找人清單）：比 default 小（size-4），其餘語意色不變', () => {
    const { container } = render(<EventBadge kind="escalate" size="sm" />)
    const el = badge(container)
    expect(el).toHaveAttribute('data-size', 'sm')
    expect(cls(el)).toContain('size-4')
    expect(cls(el)).not.toContain('size-5')
    expect(cls(el)).toContain('bg-status-warn')
  })

  it('進場套 animate-badge-pop 且帶 motion-reduce:animate-none（reduced motion 直接出現）', () => {
    const { container } = render(<EventBadge kind="escalate" />)
    expect(cls(badge(container))).toContain('animate-badge-pop')
    expect(cls(badge(container))).toContain('motion-reduce:animate-none')
  })

  it('有可讀的 aria-label，「!」本身不重複報讀', () => {
    const { container } = render(<EventBadge kind="escalate" />)
    expect(screen.getByRole('img', { name: 'ESCALATE 等待決策' })).toBeInTheDocument()
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('!')
  })

  it('className 併入、不吃掉基本 class', () => {
    const { container } = render(<EventBadge kind="escalate" className="absolute -top-2 -left-2" />)
    expect(cls(badge(container))).toContain('absolute')
    expect(cls(badge(container))).toContain('bg-status-warn')
  })
})
