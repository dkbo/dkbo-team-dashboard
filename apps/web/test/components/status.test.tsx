// AC2：StatusDot、StatusPill（tone 狀態 token、Q11）、Tag
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusDot } from '@/components/app/StatusDot'
import { StatusPill, agentStatusPill, taskStatusPill } from '@/components/app/StatusPill'
import { Tag } from '@/components/app/Tag'

const cls = (el: Element | null) => el?.getAttribute('class') ?? ''
const pill = (text: string) => screen.getByText(text).closest('[data-slot="status-pill"]')!

describe('StatusDot', () => {
  it.each(['danger', 'warn', 'ok', 'idle', 'info'] as const)('tone %s → bg-status-%s、radius-full、aria-label', (tone) => {
    render(<StatusDot tone={tone} label={`狀態 ${tone}`} />)
    const dot = screen.getByLabelText(`狀態 ${tone}`)
    expect(cls(dot)).toContain(`bg-status-${tone}`)
    expect(cls(dot)).toMatch(/\brounded-full\b/)
    expect(cls(dot)).toMatch(/\bsize-2\b/)
  })

  it('sm 用 dot-sm；pulse 有 motion-pulse＋motion-reduce；沒 label 時 aria-hidden', () => {
    const { container } = render(<StatusDot tone="ok" size="sm" pulse />)
    const dot = container.querySelector('[data-slot="status-dot"]')!
    expect(cls(dot)).toMatch(/\bsize-1\.5\b/)
    expect(cls(dot)).toContain('animate-pulse')
    expect(cls(dot)).toContain('motion-reduce:animate-none')
    expect(dot).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('StatusPill', () => {
  it.each([
    ['danger', 'border-status-danger', 'text-status-danger-fg'],
    ['warn', 'border-status-warn', 'text-status-warn-fg'],
    ['ok', 'border-status-ok', 'text-status-ok-fg'],
    ['idle', 'border-status-idle', 'text-status-idle-fg'],
    ['info', 'border-status-info', 'text-status-info-fg'],
  ] as const)('tone %s 用狀態 token 框與字、有框無底、radius-full', (tone, border, text) => {
    render(<StatusPill tone={tone} label={`p-${tone}`} />)
    const el = pill(`p-${tone}`)
    expect(el).toHaveAttribute('data-tone', tone)
    expect(el).toHaveAttribute('data-color', tone)
    expect(cls(el)).toContain(border)
    expect(cls(el)).toContain(text)
    expect(cls(el)).toContain('border-(length:--border-w-pill)')
    expect(cls(el)).toContain('bg-transparent')
    expect(cls(el)).toMatch(/\brounded-full\b/)
    expect(el.querySelector('[data-slot="status-dot"]')).toHaveClass(`bg-status-${tone}`)
  })

  it('size：default pill（h-6 px-2.5 caption-strong）／sm pill-sm（h-5 px-2 micro）且 sm 不顯示 note', () => {
    render(
      <>
        <StatusPill tone="ok" label="大" note="附註" />
        <StatusPill tone="ok" size="sm" label="小" note="不顯示" />
      </>,
    )
    expect(cls(pill('大'))).toMatch(/\bh-6\b/)
    expect(cls(pill('大'))).toMatch(/\bpx-2\.5\b/)
    expect(cls(pill('大'))).toMatch(/\bfont-semibold\b/)
    expect(screen.getByText('附註')).toHaveClass('opacity-75')
    expect(cls(pill('小'))).toMatch(/\bh-5\b/)
    expect(cls(pill('小'))).toMatch(/\bpx-2\b/)
    expect(cls(pill('小'))).toMatch(/\btext-2xs\b/)
    expect(screen.queryByText('不顯示')).toBeNull()
  })

  it('dot 可換 Check／Ban；pulse 有 motion-reduce；dashed、strike', () => {
    render(
      <>
        <StatusPill tone="idle" dot="check" label="已完成" />
        <StatusPill tone="idle" dot="ban" strike label="已放棄" />
        <StatusPill tone="ok" pulse label="工作中" />
        <StatusPill tone="idle" dashed label="無 pane" />
      </>,
    )
    expect(pill('已完成').querySelector('svg')).not.toBeNull()
    expect(pill('已完成').querySelector('[data-slot="status-dot"]')).toBeNull()
    expect(pill('已放棄').querySelector('svg')).not.toBeNull()
    expect(screen.getByText('已放棄')).toHaveClass('line-through')
    const dot = pill('工作中').querySelector('[data-slot="status-dot"]')!
    expect(cls(dot)).toContain('animate-pulse')
    expect(cls(dot)).toContain('motion-reduce:animate-none')
    expect(cls(pill('無 pane'))).toContain('border-dashed')
  })

  it('terminal：底 on-color/alpha-5、套 .dark 讓 token 走暗色版', () => {
    render(<StatusPill tone="ok" terminal label="t" />)
    expect(pill('t')).toHaveClass('dark')
    expect(cls(pill('t'))).toContain('bg-white/5')
  })

  it('agent 狀態對照（Q11：done＝ok＋✓；blocked＝danger；unknown＝idle 虛線）', () => {
    expect(agentStatusPill('working')).toMatchObject({ tone: 'ok', label: '工作中', pulse: true })
    expect(agentStatusPill('blocked')).toMatchObject({ tone: 'danger', label: '卡住', pulse: true })
    expect(agentStatusPill('idle')).toMatchObject({ tone: 'idle', label: '閒置' })
    expect(agentStatusPill('done')).toMatchObject({ tone: 'ok', label: '完成', dot: 'check' })
    expect(agentStatusPill(null)).toMatchObject({ tone: 'idle', label: '不明', dashed: true })
    expect(agentStatusPill('reviewing')).toMatchObject({ tone: 'idle', label: 'reviewing', dashed: true })
  })

  it('任務狀態對照（Q11：已結案＝idle＋✓；abandoned＝idle＋Ban 刪除線；planning＝info）', () => {
    expect(taskStatusPill('running')).toMatchObject({ tone: 'ok', label: '進行中' })
    expect(taskStatusPill('planning')).toMatchObject({ tone: 'info', label: '規劃中' })
    expect(taskStatusPill('done')).toMatchObject({ tone: 'idle', label: '已完成', dot: 'check' })
    expect(taskStatusPill('abandoned')).toMatchObject({ tone: 'idle', label: '已放棄', dot: 'ban', strike: true })
  })

  it('沿用 status prop：data-tone 保留 agent 狀態名（相容既有測試），顏色走新 tone', () => {
    render(
      <>
        <StatusPill status="working" />
        <StatusPill status="blocked" />
        <StatusPill status="done" />
        <StatusPill status={null} />
        <StatusPill status="working" label="backend" note="無 pane" />
      </>,
    )
    expect(pill('工作中')).toHaveAttribute('data-tone', 'working')
    expect(pill('工作中')).toHaveAttribute('data-color', 'ok')
    expect(pill('卡住')).toHaveAttribute('data-color', 'danger')
    expect(cls(pill('卡住'))).toContain('border-status-danger')
    expect(pill('完成')).toHaveAttribute('data-color', 'ok')
    expect(pill('完成').querySelector('svg')).not.toBeNull()
    expect(pill('不明')).toHaveAttribute('data-tone', 'unknown')
    expect(screen.getByText('backend')).toBeInTheDocument()
    expect(screen.getByText('無 pane')).toBeInTheDocument()
  })
})

describe('Tag', () => {
  it.each([
    ['neutral', 'bg-muted', 'text-muted-foreground'],
    ['brand', 'bg-accent', 'text-accent-foreground'],
    ['info', 'bg-status-info-soft', 'text-status-info-fg'],
    ['ok', 'bg-status-ok-soft', 'text-status-ok-fg'],
    ['warn', 'bg-status-warn-soft', 'text-status-warn-fg'],
    ['danger', 'bg-status-danger-soft', 'text-status-danger-fg'],
  ] as const)('%s：有底無框、rounded-full、micro', (variant, bg, fg) => {
    render(<Tag variant={variant}>t-{variant}</Tag>)
    const el = screen.getByText(`t-${variant}`)
    expect(el).toHaveAttribute('data-slot', 'tag')
    expect(el).toHaveAttribute('data-variant', variant)
    expect(cls(el)).toContain(bg)
    expect(cls(el)).toContain(fg)
    expect(cls(el)).toMatch(/\brounded-full\b/)
    expect(cls(el)).toMatch(/\bh-5\b/)
    expect(cls(el)).toMatch(/\btext-2xs\b/)
    expect(cls(el)).not.toMatch(/\bborder\b/)
  })

  it('預設 neutral；mono 用 mono-2xs；count 0 不渲染', () => {
    render(
      <>
        <Tag mono>abc1234</Tag>
        <Tag variant="warn" count={0}>
          ESCALATE
        </Tag>
        <Tag variant="warn" count={2}>
          BUG
        </Tag>
      </>,
    )
    expect(screen.getByText('abc1234')).toHaveAttribute('data-variant', 'neutral')
    expect(cls(screen.getByText('abc1234'))).toContain('font-mono')
    expect(screen.queryByText(/ESCALATE/)).toBeNull()
    expect(screen.getByText(/BUG/)).toHaveTextContent('BUG 2')
  })
})
