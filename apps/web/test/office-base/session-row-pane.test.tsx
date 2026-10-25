// lobby AC2／AC12：SessionRow 依 paneId 傳 hasPane；選取列補 text-accent-foreground（BACKLOG SessionRow.tsx:64）
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { SessionRow } from '@/components/app/SessionRow'
import { officeSession } from '../shell/builders'

const NOW = 1_800_000_000_000
const MIN = 60_000
const cls = (el: Element | null) => el?.getAttribute('class') ?? ''
const row = (c: HTMLElement) => c.querySelector('[data-slot="session-row"]')!
const errored = (agoMs: number, paneId: string | null) =>
  officeSession({ substate: 'error', substateSince: NOW - agoMs, lastEventAt: NOW - agoMs, paneId })

describe('SessionRow × hasPane', () => {
  it('有 pane 的錯誤 11 分後仍是「錯誤」、danger 底、計時「11 分前」', () => {
    const { container } = render(<SessionRow now={NOW} onSelect={() => {}} session={errored(11 * MIN, 'p1')} />)
    expect(row(container)).toHaveAttribute('data-substate', 'error')
    expect(cls(row(container))).toContain('bg-status-danger-soft')
    expect(container.querySelector('[data-slot="session-timer"]')).toHaveTextContent('11 分前')
  })

  it('無 pane 的錯誤 11 分後轉「閒置」、不再是 danger 底、計時「閒置 11 分」', () => {
    const { container } = render(<SessionRow now={NOW} onSelect={() => {}} session={errored(11 * MIN, null)} />)
    expect(row(container)).toHaveAttribute('data-substate', 'idle')
    expect(cls(row(container))).not.toContain('bg-status-danger-soft')
    expect(container.querySelector('[data-slot="session-timer"]')).toHaveTextContent('閒置 11 分')
  })

  it('無 pane 的錯誤 3 分內仍顯示「錯誤」，但不算需要你（不上 danger 底）', () => {
    const { container } = render(<SessionRow now={NOW} onSelect={() => {}} session={errored(3 * MIN, null)} />)
    expect(row(container)).toHaveAttribute('data-substate', 'error')
    expect(cls(row(container))).not.toContain('bg-status-danger-soft')
  })

  it('等你不受 pane 影響：無 pane 的 waiting 仍是 danger 底', () => {
    const s = officeSession({ substate: 'waiting', substateSince: NOW - 3 * MIN, paneId: null })
    const { container } = render(<SessionRow now={NOW} onSelect={() => {}} session={s} />)
    expect(cls(row(container))).toContain('bg-status-danger-soft')
  })
})

describe('SessionRow selected', () => {
  it('選取列（bg-accent）文字補 text-accent-foreground', () => {
    const { container } = render(<SessionRow now={NOW} onSelect={() => {}} selected session={officeSession({ substate: 'running' })} />)
    expect(cls(row(container))).toContain('bg-accent')
    expect(cls(row(container))).toContain('text-accent-foreground')
  })

  it('未選取不加 text-accent-foreground', () => {
    const { container } = render(<SessionRow now={NOW} onSelect={() => {}} session={officeSession({ substate: 'running' })} />)
    expect(cls(row(container))).not.toContain('text-accent-foreground')
  })
})
