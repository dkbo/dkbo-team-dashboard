// AC2：SegmentedControl、SidebarList／SidebarItem、PaneHeader
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { Card } from '@/components/ui/card'
import { PaneBody, PaneHeader } from '@/components/app/PaneHeader'
import { SegmentedControl } from '@/components/app/SegmentedControl'
import { SidebarItem, SidebarList, SidebarSection } from '@/components/app/SidebarList'
import { Tag } from '@/components/app/Tag'

const cls = (el: Element | null) => el?.getAttribute('class') ?? ''
const ITEMS = [
  { value: 'all', label: '全部', count: 12 },
  { value: 'attention', label: '需處理', count: 3 },
  { value: 'off', label: '停用', disabled: true },
]

function Seg(props: { size?: 'default' | 'sm'; kind?: 'tablist' | 'group'; onChange?: (v: string) => void }) {
  const [v, setV] = useState('all')
  return (
    <SegmentedControl
      aria-label="篩選"
      data-testid="seg"
      size={props.size}
      kind={props.kind}
      items={ITEMS}
      value={v}
      onChange={(n) => {
        setV(n)
        props.onChange?.(n)
      }}
    />
  )
}

describe('SegmentedControl', () => {
  it('default：軌 h-9 p-1 bg-muted rounded-full、項 h-7 px-3.5 body-strong、count caption opacity-70', () => {
    render(<Seg />)
    const track = screen.getByTestId('seg')
    expect(track).toHaveAttribute('role', 'tablist')
    expect(track).toHaveAttribute('data-size', 'default')
    expect(cls(track)).toMatch(/\bh-9\b/)
    expect(cls(track)).toMatch(/\bp-1\b/)
    expect(cls(track)).toContain('bg-muted')
    expect(cls(track)).toMatch(/\brounded-full\b/)
    expect(cls(track)).toContain('overflow-x-auto')
    const tab = screen.getByRole('tab', { name: /全部/ })
    expect(cls(tab)).toMatch(/\bh-7\b/)
    expect(cls(tab)).toMatch(/\bpx-3\.5\b/)
    expect(cls(tab)).toMatch(/\btext-sm\b/)
    expect(cls(tab)).toMatch(/\bfont-semibold\b/)
    expect(cls(tab)).toContain('focus-visible:ring-3')
    expect(cls(tab)).toContain('disabled:opacity-50')
    expect(cls(screen.getByText('12'))).toContain('opacity-70')
    expect(cls(screen.getByText('12'))).toContain('tabular-nums')
  })

  it('sm：軌 h-8 p-0.5、項 px-3 caption-strong', () => {
    render(<Seg size="sm" />)
    const track = screen.getByTestId('seg')
    expect(cls(track)).toMatch(/\bh-8\b/)
    expect(cls(track)).toMatch(/\bp-0\.5\b/)
    const tab = screen.getByRole('tab', { name: /需處理/ })
    expect(cls(tab)).toMatch(/\bpx-3\b/)
    expect(cls(tab)).toMatch(/\btext-xs\b/)
  })

  it('tablist：aria-selected＋roving tabindex；選中項 selected-seg；← → Home End 切換並略過 disabled', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Seg onChange={onChange} />)
    const all = screen.getByRole('tab', { name: /全部/ })
    const att = screen.getByRole('tab', { name: /需處理/ })
    expect(all).toHaveAttribute('aria-selected', 'true')
    expect(all).toHaveAttribute('tabindex', '0')
    expect(att).toHaveAttribute('tabindex', '-1')
    expect(all).toHaveAttribute('data-value', 'all')
    expect(cls(all)).toContain('bg-card')
    expect(cls(all)).toContain('shadow-soft')
    expect(cls(all)).toContain('dark:bg-secondary')
    expect(screen.getByRole('tab', { name: /停用/ })).toBeDisabled()
    await user.click(att)
    expect(onChange).toHaveBeenLastCalledWith('attention')
    expect(att).toHaveAttribute('aria-selected', 'true')
    att.focus()
    await user.keyboard('{ArrowRight}')
    expect(onChange).toHaveBeenLastCalledWith('all')
    expect(document.activeElement).toBe(all)
    await user.keyboard('{ArrowLeft}')
    expect(onChange).toHaveBeenLastCalledWith('attention')
    await user.keyboard('{Home}')
    expect(onChange).toHaveBeenLastCalledWith('all')
    await user.keyboard('{End}')
    expect(onChange).toHaveBeenLastCalledWith('attention')
  })

  it('group：role=group＋aria-pressed', async () => {
    const user = userEvent.setup()
    render(<Seg kind="group" />)
    expect(screen.getByTestId('seg')).toHaveAttribute('role', 'group')
    const b = screen.getByRole('button', { name: /需處理/ })
    expect(b).toHaveAttribute('aria-pressed', 'false')
    await user.click(b)
    expect(b).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('SidebarList', () => {
  it('容器 inset-list、項之間 stack-3xs；段標題 caption-bold＋Tag 計數；段之間頂線', () => {
    render(
      <MemoryRouter>
        <SidebarList data-testid="list" aria-label="清單">
          <SidebarSection title="專案" count={<Tag>4</Tag>}>
            <SidebarItem title="teamflow" />
          </SidebarSection>
          <SidebarSection title="Worktree">
            <SidebarItem title="unify" />
          </SidebarSection>
        </SidebarList>
      </MemoryRouter>,
    )
    const list = screen.getByTestId('list')
    expect(cls(list)).toMatch(/\bp-2\b/)
    const head = screen.getByText('專案')
    expect(cls(head.closest('[data-slot="sidebar-section-title"]'))).toContain('font-bold')
    expect(cls(head.closest('[data-slot="sidebar-section-title"]'))).toMatch(/\btext-xs\b/)
    expect(screen.getByText('4')).toHaveAttribute('data-slot', 'tag')
    const sections = list.querySelectorAll('[data-slot="sidebar-section"]')
    expect(sections).toHaveLength(2)
    expect(cls(sections[1])).toContain('not-first:border-t')
    expect(cls(sections[0].querySelector('[data-slot="sidebar-section-items"]'))).toMatch(/\bgap-0\.5\b/)
  })

  it('SidebarItem：min-h-10、radius-lg、hover-fill、focus-ring-inset；選中 selected-soft；編號、狀態點、第二行、尾端', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <MemoryRouter>
        <SidebarItem index={1} title="space-a" subtitle="3 tabs" trailing={<Tag>2</Tag>} onClick={onClick} data-testid="i1" />
        <SidebarItem dot="danger" pulse title="agent-b" subtitle="卡住" selected data-testid="i2" />
        <SidebarItem title="broken" error="路徑不存在" data-testid="i3" />
        <SidebarItem title="link" href="/git?p=x" data-testid="i4" />
      </MemoryRouter>,
    )
    const i1 = screen.getByTestId('i1')
    expect(i1.tagName).toBe('BUTTON')
    expect(cls(i1)).toMatch(/\bmin-h-10\b/)
    expect(cls(i1)).toMatch(/\brounded-lg\b/)
    expect(cls(i1)).toContain('hover:bg-muted')
    expect(cls(i1)).toContain('focus-visible:ring-inset')
    expect(cls(i1)).toContain('focus-visible:ring-3')
    expect(cls(screen.getByText('1'))).toMatch(/\bw-4\b/)
    expect(cls(screen.getByText('space-a'))).toContain('truncate')
    expect(cls(screen.getByText('3 tabs'))).toContain('text-muted-foreground')
    await user.click(i1)
    expect(onClick).toHaveBeenCalled()
    const i2 = screen.getByTestId('i2')
    expect(i2).toHaveAttribute('aria-current', 'true')
    expect(cls(i2)).toContain('bg-accent')
    expect(cls(i2)).toContain('text-accent-foreground')
    expect(cls(screen.getByText('卡住'))).toContain('text-accent-foreground/80')
    expect(i2.querySelector('[data-slot="status-dot"]')).toHaveClass('bg-status-danger')
    expect(cls(screen.getByText('路徑不存在'))).toContain('text-status-danger-fg')
    expect(screen.getByTestId('i4').tagName).toBe('A')
    expect(screen.getByTestId('i4')).toHaveAttribute('href', '/git?p=x')
  })
})

describe('PaneHeader＋Card pane', () => {
  it('PaneHeader 高 bar、px-4、底線、標題 body-bold、次要資訊 body-medium muted、action 靠右', () => {
    render(
      <Card variant="pane" data-testid="pane">
        <PaneHeader title="歷史" info="master · 120 commits" actions={<button type="button">放大</button>} />
        <PaneBody data-testid="body">內容</PaneBody>
      </Card>,
    )
    const header = screen.getByText('歷史').closest('[data-slot="pane-header"]')!
    expect(cls(header)).toMatch(/\bh-10\b/)
    expect(cls(header)).toMatch(/\bpx-4\b/)
    expect(cls(header)).toMatch(/\bborder-b\b/)
    expect(cls(screen.getByText('歷史'))).toContain('font-bold')
    expect(cls(screen.getByText('master · 120 commits'))).toContain('font-medium')
    expect(cls(screen.getByText('master · 120 commits'))).toContain('text-muted-foreground')
    expect(cls(screen.getByRole('button', { name: '放大' }).parentElement)).toContain('ml-auto')
    const body = screen.getByTestId('body')
    expect(cls(body)).toContain('min-h-0')
    expect(cls(body)).toContain('flex-1')
    expect(cls(body)).toContain('overflow-auto')
  })

  it('PaneHeader terminal：terminal-chrome 底、terminal-line 分隔、micro terminal-fg', () => {
    render(<PaneHeader variant="terminal" title="claude · p1" />)
    const header = screen.getByText('claude · p1').closest('[data-slot="pane-header"]')!
    expect(cls(header)).toContain('bg-terminal-chrome')
    expect(cls(header)).toContain('border-terminal-line')
    expect(cls(header)).toContain('text-terminal-fg')
  })
})
