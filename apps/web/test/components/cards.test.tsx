// AC2：SummaryTile、ChartCard
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { Coins, Gauge, Rocket, Siren } from 'lucide-react'
import { ChartCard, ChartShowAll, chartBarHeight, CHART_ROW_LIMIT } from '@/components/app/ChartCard'
import { SummaryTile } from '@/components/app/SummaryTile'

const cls = (el: Element | null) => el?.getAttribute('class') ?? ''

describe('SummaryTile', () => {
  it.each([
    ['ok', Rocket],
    ['warn', Gauge],
    ['danger', Siren],
    ['brand', Coins],
  ] as const)('%s：漸層 grad-%s、shadow-pop、白字、裝飾圖示 alpha-12', (variant, icon) => {
    render(<SummaryTile data-testid="t" variant={variant} icon={icon} label="標籤" value={3} />)
    const t = screen.getByTestId('t')
    expect(t).toHaveAttribute('data-variant', variant)
    expect(cls(t)).toContain(`from-(--grad-${variant}-from)`)
    expect(cls(t)).toContain(`to-(--grad-${variant}-to)`)
    expect(cls(t)).toContain('bg-linear-to-br')
    expect(cls(t)).toContain('shadow-pop')
    expect(cls(t)).toContain('text-white')
    const deco = t.querySelector('svg[aria-hidden="true"]')!
    expect(cls(deco)).toContain('opacity-12')
    expect(cls(deco)).toContain('size-18')
    expect(cls(deco)).toContain('sm:size-28')
  })

  it('quiet：card 底、shadow-soft、值 muted-foreground、裝飾 status-idle alpha-15', () => {
    render(
      <SummaryTile data-testid="t" variant="quiet" icon={Siren} label="卡住的 agent" value={0}>
        <span className="text-status-ok-fg">大家都很順 ✨</span>
      </SummaryTile>,
    )
    const t = screen.getByTestId('t')
    expect(cls(t)).toContain('bg-card')
    expect(cls(t)).toContain('shadow-soft')
    expect(cls(t)).not.toContain('bg-linear-to-br')
    expect(cls(screen.getByText('0'))).toContain('text-muted-foreground')
    const deco = t.querySelector('svg[aria-hidden="true"]')!
    expect(cls(deco)).toContain('text-status-idle')
    expect(cls(deco)).toContain('opacity-15')
    expect(screen.getByText('大家都很順 ✨')).toBeInTheDocument()
  })

  it('尺寸與字級：min-h-28 sm:min-h-32、p-4 sm:p-5、radius-xl、label body-bold、value display／title-lg、副行 truncate', () => {
    render(
      <SummaryTile data-testid="t" variant="ok" icon={Rocket} label="進行中任務" value={2}>
        副行很長很長
      </SummaryTile>,
    )
    const t = screen.getByTestId('t')
    for (const c of ['min-h-28', 'sm:min-h-32', 'p-4', 'sm:p-5', 'rounded-xl', 'overflow-hidden']) expect(cls(t)).toContain(c)
    expect(cls(screen.getByText('進行中任務'))).toContain('font-bold')
    const v = screen.getByText('2')
    expect(cls(v)).toContain('text-2xl')
    expect(cls(v)).toContain('sm:text-3xl')
    expect(cls(v)).toContain('tabular-nums')
    expect(cls(screen.getByText('副行很長很長'))).toContain('truncate')
  })

  it('href：整張是 Link、motion-lift＋motion-reduce；漸層 focus-ring-on-color、quiet focus-ring', async () => {
    render(
      <MemoryRouter>
        <SummaryTile data-testid="g" variant="danger" icon={Siren} label="卡住" value={1} href="/herdr" />
        <SummaryTile data-testid="q" variant="quiet" icon={Siren} label="卡住" value={0} href="/herdr" />
      </MemoryRouter>,
    )
    const g = screen.getByTestId('g')
    expect(g.tagName).toBe('A')
    expect(g).toHaveAttribute('href', '/herdr')
    expect(cls(g)).toContain('hover:-translate-y-0.5')
    expect(cls(g)).toContain('motion-reduce:hover:translate-y-0')
    expect(cls(g)).toContain('focus-visible:ring-white/70')
    const q = screen.getByTestId('q')
    expect(cls(q)).toContain('focus-visible:ring-ring/50')
    expect(cls(q)).toContain('hover:bg-muted/40')
  })
})

describe('ChartCard', () => {
  it('Header（標題、說明、右上 action 槽）＋摘要列＋圖區 chart-h-md＋圖例', () => {
    render(
      <ChartCard
        data-testid="cc"
        title="每日花費"
        description="近 7 天"
        action={<button type="button">顯示全部</button>}
        summary={<span>合計 $12</span>}
        legend={[{ key: 'a', label: 'claude', color: 'var(--chart-1)' }]}
      >
        <div>圖</div>
      </ChartCard>,
    )
    const cc = screen.getByTestId('cc')
    expect(cc).toHaveAttribute('data-slot', 'card')
    expect(cc).toHaveAttribute('data-state', 'ready')
    expect(screen.getByText('每日花費')).toHaveAttribute('data-slot', 'card-title')
    expect(screen.getByRole('button', { name: '顯示全部' }).closest('[data-slot="card-action"]')).not.toBeNull()
    expect(cls(screen.getByText('合計 $12').parentElement)).toMatch(/\bgap-4\b/)
    expect(cls(screen.getByText('圖').parentElement)).toContain('h-(--chart-h-md)')
    const sw = cc.querySelector('[data-slot="chart-swatch"]') as HTMLElement
    expect(cls(sw)).toMatch(/\bsize-2\.5\b/)
    expect(cls(sw)).toMatch(/\brounded-full\b/)
    expect(sw.style.backgroundColor).toBe('var(--chart-1)')
    expect(screen.queryByTestId('chart-empty')).toBeNull()
  })

  it('height sm／lg／auto', () => {
    render(
      <>
        <ChartCard title="a" height="sm"><div>A</div></ChartCard>
        <ChartCard title="b" height="lg"><div>B</div></ChartCard>
        <ChartCard title="c" height="auto"><div>C</div></ChartCard>
      </>,
    )
    expect(cls(screen.getByText('A').parentElement)).toContain('h-(--chart-h-sm)')
    expect(cls(screen.getByText('B').parentElement)).toContain('h-(--chart-h-lg)')
    expect(cls(screen.getByText('C').parentElement)).not.toContain('h-(--chart-h')
  })

  it('loading：圖區換 Skeleton（chart-h-md、radius-lg），不畫 children', () => {
    render(
      <ChartCard data-testid="cc" title="t" loading>
        <div>圖</div>
      </ChartCard>,
    )
    expect(screen.getByTestId('cc')).toHaveAttribute('data-state', 'loading')
    const sk = screen.getByTestId('cc').querySelector('[data-slot="skeleton"]')!
    expect(cls(sk)).toContain('h-(--chart-h-md)')
    expect(cls(sk)).toContain('rounded-lg')
    expect(screen.queryByText('圖')).toBeNull()
  })

  it('empty：整卡 min-h-36、Header 保留、EmptyState inline 置中、容器 data-testid=chart-empty、不畫 children', () => {
    render(
      <ChartCard data-testid="cc" title="額度 agy" empty={{ icon: Gauge, title: '這段期間沒有 agy 額度資料', hint: '換個時間區間，或等 agy 下次回報' }}>
        <div>圖</div>
      </ChartCard>,
    )
    const cc = screen.getByTestId('cc')
    expect(cc).toHaveAttribute('data-state', 'empty')
    expect(cls(cc)).toContain('min-h-36')
    expect(screen.getByText('額度 agy')).toBeInTheDocument()
    const box = screen.getByTestId('chart-empty')
    expect(cls(box)).toContain('justify-center')
    expect(box.querySelector('[data-slot="empty-state"]')).toHaveAttribute('data-size', 'inline')
    expect(screen.getByText('這段期間沒有 agy 額度資料')).toBeInTheDocument()
    expect(screen.queryByText('圖')).toBeNull()
  })

  it('ChartShowAll：超過 15 件才出現；顯示全部 N 件 ⇄ 只看最近 15 件', async () => {
    const user = userEvent.setup()
    let expanded = false
    const { rerender } = render(<ChartShowAll total={10} expanded={false} onToggle={() => {}} data-testid="sa" />)
    expect(screen.queryByTestId('sa')).toBeNull()
    rerender(<ChartShowAll total={39} expanded={expanded} onToggle={() => (expanded = !expanded)} data-testid="sa" />)
    expect(screen.getByTestId('sa')).toHaveTextContent('顯示全部 39 件')
    expect(screen.getByTestId('sa')).toHaveAttribute('data-variant', 'ghost')
    expect(screen.getByTestId('sa')).toHaveAttribute('data-size', 'sm')
    await user.click(screen.getByTestId('sa'))
    expect(expanded).toBe(true)
    rerender(<ChartShowAll total={39} expanded onToggle={() => {}} data-testid="sa" />)
    expect(screen.getByTestId('sa')).toHaveTextContent('只看最近 15 件')
    expect(screen.getByTestId('sa')).toHaveAttribute('aria-pressed', 'true')
  })

  it('chartBarHeight = max(chart-h-sm 176, 列數 × 28 + 64)；CHART_ROW_LIMIT = 15', () => {
    expect(CHART_ROW_LIMIT).toBe(15)
    expect(chartBarHeight(1)).toBe(176)
    expect(chartBarHeight(15)).toBe(15 * 28 + 64)
  })
})
