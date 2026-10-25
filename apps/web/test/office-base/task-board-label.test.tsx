// lobby AC3：TaskBoardLabel（§5.3、§6.14）—— full 卡／compact 膠囊、進度條段落、tone 框、結案保留、yielded、a11y
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { TaskBoardLabel, type TaskBoardLabelProps } from '@/components/app/office/TaskBoardLabel'

const cls = (el: Element | null) => el?.getAttribute('class') ?? ''
const root = (c: HTMLElement) => c.querySelector('[data-slot="task-board-label"]')!
const segs = (c: HTMLElement) => [...c.querySelectorAll('[data-seg]')]
const base: TaskBoardLabelProps = {
  task: '結帳流程改版',
  wavesClosed: 2,
  wavesPlanned: 5,
  chips: [],
  density: 'full',
  href: '/tasks/atlas/2026-10-25-checkout',
}
const escalate = { label: 'ESCALATE', tone: 'warn' as const }
const waiting = { label: '1 人等你', tone: 'danger' as const }

describe('TaskBoardLabel · full', () => {
  it('卡：w-50、rounded-lg、bg-popover、shadow-soft、px-3 py-2；第一行任務名＋「波 2/5」', () => {
    const { container } = render(<TaskBoardLabel {...base} />)
    const card = container.querySelector('[data-slot="task-board-card"]')!
    for (const c of ['w-50', 'rounded-lg', 'bg-popover', 'shadow-soft', 'px-3', 'py-2']) expect(cls(card)).toContain(c)
    expect(card).toHaveTextContent('結帳流程改版')
    expect(card).toHaveTextContent('波 2/5')
    expect(container.querySelector('svg.lucide-list-checks')).not.toBeNull()
  })

  it('進度條：每段 h-1.5 rounded-full、段距 gap-0.75；已關 bg-status-ok、進行中 bg-status-ok/40、未開 bg-muted', () => {
    const { container } = render(<TaskBoardLabel {...base} />)
    const s = segs(container)
    expect(s).toHaveLength(5)
    expect(s.map((e) => e.getAttribute('data-seg'))).toEqual(['closed', 'closed', 'active', 'todo', 'todo'])
    for (const e of s) for (const c of ['h-1.5', 'rounded-full', 'flex-1']) expect(cls(e)).toContain(c)
    expect(cls(s[0])).toContain('bg-status-ok')
    expect(cls(s[2])).toContain('bg-status-ok/40')
    expect(cls(s[3])).toContain('bg-muted')
    expect(cls(container.querySelector('[data-slot="task-board-bar"]'))).toContain('gap-0.75')
  })

  it('全部關完：沒有 active 段', () => {
    const { container } = render(<TaskBoardLabel {...base} wavesClosed={5} />)
    expect(segs(container).map((e) => e.getAttribute('data-seg'))).toEqual(['closed', 'closed', 'closed', 'closed', 'closed'])
  })

  it('flashIndex：該段外框 ring-2 ring-status-ok-fg 並套 animate-wave-fill（reduced motion 關動畫）', () => {
    const { container } = render(<TaskBoardLabel {...base} flashIndex={1} />)
    const s = segs(container)
    for (const c of ['ring-2', 'ring-status-ok-fg', 'animate-wave-fill', 'motion-reduce:animate-none']) expect(cls(s[1])).toContain(c)
    expect(cls(s[0])).not.toContain('ring-2')
  })

  it('第三行 chip（有才畫）', () => {
    const { container, rerender } = render(<TaskBoardLabel {...base} />)
    expect(container.querySelector('[data-slot="tag"]')).toBeNull()
    rerender(<TaskBoardLabel {...base} chips={[waiting, escalate]} tone="danger" />)
    expect([...container.querySelectorAll('[data-slot="tag"]')].map((t) => t.textContent)).toEqual(['1 人等你', 'ESCALATE'])
  })

  it('沒有波次表（wavesPlanned 0）：只顯示任務名，不畫進度條與「波」', () => {
    const { container } = render(<TaskBoardLabel {...base} wavesClosed={0} wavesPlanned={0} />)
    expect(container.querySelector('[data-slot="task-board-bar"]')).toBeNull()
    expect(root(container)).not.toHaveTextContent('波')
    expect(root(container)).toHaveTextContent('結帳流程改版')
  })
})

describe('TaskBoardLabel · tone 框', () => {
  it('danger／warn：border-(length:--border-w-pill) border-status-X，底不變；null 用 transparent', () => {
    const { container, rerender } = render(<TaskBoardLabel {...base} tone="danger" />)
    const card = () => container.querySelector('[data-slot="task-board-card"]')!
    expect(cls(card())).toContain('border-(length:--border-w-pill)')
    expect(cls(card())).toContain('border-status-danger')
    expect(cls(card())).toContain('bg-popover')
    expect(root(container)).toHaveAttribute('data-tone', 'danger')
    rerender(<TaskBoardLabel {...base} tone="warn" />)
    expect(cls(card())).toContain('border-status-warn')
    rerender(<TaskBoardLabel {...base} tone={null} />)
    expect(cls(card())).toContain('border-transparent')
    expect(root(container)).not.toHaveAttribute('data-tone')
  })
})

describe('TaskBoardLabel · compact', () => {
  it('膠囊 h-7、px-3、rounded-full：ListChecks＋「2/5」，不畫進度條與任務名', () => {
    const { container } = render(<TaskBoardLabel {...base} density="compact" />)
    const pill = container.querySelector('[data-slot="task-board-pill"]')!
    for (const c of ['h-7', 'px-3', 'gap-1.5', 'rounded-full', 'bg-popover', 'shadow-soft']) expect(cls(pill)).toContain(c)
    expect(pill).toHaveTextContent('2/5')
    expect(pill).not.toHaveTextContent('結帳流程改版')
    expect(container.querySelector('[data-slot="task-board-bar"]')).toBeNull()
  })

  it('沒有 chip：不加；danger chip 照 Tag；warn（ESCALATE）縮成 size-4.5 實心 warn 圓「!」', () => {
    const { container, rerender } = render(<TaskBoardLabel {...base} density="compact" />)
    expect(container.querySelector('[data-slot="tag"]')).toBeNull()
    expect(container.querySelector('[data-slot="board-escalate"]')).toBeNull()
    rerender(<TaskBoardLabel {...base} density="compact" chips={[waiting]} tone="danger" />)
    expect(container.querySelector('[data-slot="tag"]')).toHaveTextContent('1 人等你')
    rerender(<TaskBoardLabel {...base} density="compact" chips={[escalate]} tone="warn" />)
    const bang = container.querySelector('[data-slot="board-escalate"]')!
    for (const c of ['size-4.5', 'rounded-full', 'bg-status-warn', 'text-on-color']) expect(cls(bang)).toContain(c)
    expect(bang).toHaveTextContent('!')
    expect(container.querySelector('[data-slot="tag"]')).toBeNull()
  })

  it('tone 框同 full；neutral chip 不畫', () => {
    const { container } = render(<TaskBoardLabel {...base} density="compact" tone="warn" chips={[{ label: '備註', tone: 'neutral' }]} />)
    expect(cls(container.querySelector('[data-slot="task-board-pill"]'))).toContain('border-status-warn')
    expect(container.querySelector('[data-slot="tag"]')).toBeNull()
  })
})

describe('TaskBoardLabel · 結案保留（E8）', () => {
  it('done：「🎉 結案 ✓」取代波數，進度條全滿', () => {
    const { container } = render(<TaskBoardLabel {...base} wavesClosed={5} closed="done" />)
    expect(root(container)).toHaveAttribute('data-closed', 'done')
    expect(root(container)).toHaveTextContent('🎉 結案 ✓')
    expect(root(container)).not.toHaveTextContent('波 5/5')
    expect(segs(container).every((e) => e.getAttribute('data-seg') === 'closed')).toBe(true)
  })

  it('abandoned：「已放棄」idle 色、任務名刪除線、不畫 active 段', () => {
    const { container } = render(<TaskBoardLabel {...base} closed="abandoned" />)
    expect(root(container)).toHaveAttribute('data-closed', 'abandoned')
    expect(root(container)).toHaveTextContent('已放棄')
    expect(cls(screen.getByText('已放棄'))).toContain('text-status-idle-fg')
    expect(cls(screen.getByText('結帳流程改版'))).toContain('line-through')
    expect(segs(container).some((e) => e.getAttribute('data-seg') === 'active')).toBe(false)
  })

  it('compact 的 done：「🎉 結案 ✓」取代 2/5', () => {
    const { container } = render(<TaskBoardLabel {...base} density="compact" closed="done" />)
    expect(container.querySelector('[data-slot="task-board-pill"]')).toHaveTextContent('🎉 結案 ✓')
  })
})

describe('TaskBoardLabel · yielded', () => {
  it('dot：size-3 圓，框＝tone 色，無 tone 用 border；hidden：sr-only', () => {
    const { container, rerender } = render(<TaskBoardLabel {...base} yielded="dot" tone="warn" />)
    const dot = () => container.querySelector('[data-slot="task-board-dot"]')!
    for (const c of ['size-3', 'rounded-full', 'border-2', 'border-status-warn']) expect(cls(dot())).toContain(c)
    rerender(<TaskBoardLabel {...base} yielded="dot" />)
    expect(cls(dot())).toContain('border-border')
    rerender(<TaskBoardLabel {...base} yielded="hidden" />)
    expect(cls(root(container))).toContain('sr-only')
  })
})

describe('TaskBoardLabel · 互動與 a11y', () => {
  it('aria-label：「任務：波 2／5，chip…，開任務詳情」', () => {
    render(<TaskBoardLabel {...base} chips={[waiting]} tone="danger" />)
    expect(screen.getByRole('link', { name: '結帳流程改版：波 2／5，1 人等你，開任務詳情' })).toBeInTheDocument()
  })

  it('結案與無波次表的 aria-label', () => {
    const { rerender } = render(<TaskBoardLabel {...base} closed="done" wavesClosed={5} />)
    expect(screen.getByRole('link')).toHaveAttribute('aria-label', '結帳流程改版：已結案，開任務詳情')
    rerender(<TaskBoardLabel {...base} closed="abandoned" />)
    expect(screen.getByRole('link')).toHaveAttribute('aria-label', '結帳流程改版：已放棄，開任務詳情')
    rerender(<TaskBoardLabel {...base} wavesPlanned={0} wavesClosed={0} />)
    expect(screen.getByRole('link')).toHaveAttribute('aria-label', '結帳流程改版，開任務詳情')
  })

  it('title（Tooltip）：「任務詳情 · 波 3 進行中」', () => {
    const { container } = render(<TaskBoardLabel {...base} />)
    expect(root(container)).toHaveAttribute('title', '任務詳情 · 波 3 進行中')
  })

  it('是 <a href>；左鍵走 onOpen，修飾鍵交給瀏覽器；hover／focus 通知 onActiveChange', () => {
    const onOpen = vi.fn()
    const onActiveChange = vi.fn()
    render(<TaskBoardLabel {...base} onOpen={onOpen} onActiveChange={onActiveChange} />)
    const a = screen.getByRole('link')
    expect(a).toHaveAttribute('href', '/tasks/atlas/2026-10-25-checkout')
    expect(fireEvent.click(a)).toBe(false)
    expect(onOpen).toHaveBeenCalledWith('/tasks/atlas/2026-10-25-checkout')
    onOpen.mockClear()
    expect(fireEvent.click(a, { ctrlKey: true })).toBe(true)
    expect(onOpen).not.toHaveBeenCalled()
    fireEvent.mouseEnter(a)
    expect(onActiveChange).toHaveBeenLastCalledWith(true)
    fireEvent.blur(a)
    expect(onActiveChange).toHaveBeenLastCalledWith(false)
  })

  it('進度條有 progressbar 語意', () => {
    const { container } = render(<TaskBoardLabel {...base} />)
    const bar = within(container).getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '2')
    expect(bar).toHaveAttribute('aria-valuemax', '5')
  })
})
