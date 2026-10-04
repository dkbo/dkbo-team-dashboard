// AC2：PageHeader、Breadcrumb、Banner、EmptyState、IconBlock、ProgressBar
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { FolderX, History } from 'lucide-react'
import { Banner, BannerAction } from '@/components/app/Banner'
import { Breadcrumb } from '@/components/app/Breadcrumb'
import { EmptyState } from '@/components/app/EmptyState'
import { IconBlock } from '@/components/app/IconBlock'
import { PageHeader } from '@/components/app/PageHeader'
import { ProgressBar } from '@/components/app/ProgressBar'
import { StatusPill } from '@/components/app/StatusPill'

const cls = (el: Element | null) => el?.getAttribute('class') ?? ''

describe('IconBlock', () => {
  it('icon-block（size-10）radius-lg、accent 底、圖示 icon-md', () => {
    const { container } = render(<IconBlock icon={History} />)
    const el = container.querySelector('[data-slot="icon-block"]')!
    expect(cls(el)).toMatch(/\bsize-10\b/)
    expect(cls(el)).toMatch(/\brounded-lg\b/)
    expect(cls(el)).toContain('bg-accent')
    expect(cls(el)).toContain('text-accent-foreground')
    expect(el.querySelector('svg')).toHaveClass('size-5')
    expect(el).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('PageHeader', () => {
  it('default：IconBlock＋h1 title-lg tracking-tight＋副標＋meta＋工具列', () => {
    render(
      <PageHeader
        icon={History}
        title="歷史與分析"
        subtitle="共 39 件已結案"
        meta={<StatusPill tone="ok" label="進行中" />}
        actions={<button type="button">清除篩選</button>}
      />,
    )
    const h1 = screen.getByRole('heading', { level: 1, name: '歷史與分析' })
    expect(cls(h1)).toMatch(/\btext-2xl\b/)
    expect(cls(h1)).toMatch(/\bfont-extrabold\b/)
    expect(cls(h1)).toMatch(/\btracking-tight\b/)
    const header = h1.closest('[data-slot="page-header"]')!
    expect(header).toHaveAttribute('data-size', 'default')
    expect(header.querySelector('[data-slot="icon-block"]')).not.toBeNull()
    expect(cls(screen.getByText('共 39 件已結案'))).toContain('text-muted-foreground')
    expect(cls(screen.getByText('共 39 件已結案'))).toContain('truncate')
    expect(screen.getByText('進行中')).toBeInTheDocument()
    const actions = screen.getByRole('button', { name: '清除篩選' }).closest('[data-slot="page-header-actions"]')!
    expect(cls(actions)).toMatch(/\bgap-2\b/)
    expect(cls(actions)).toContain('max-sm:overflow-x-auto')
  })

  it('compact：高 bar、h1 title-md（不再 sr-only）、副標前接「·」且帶 title、無圖示', () => {
    render(<PageHeader size="compact" icon={History} title="herdr" subtitle="唯讀鏡像：不會送任何按鍵" />)
    const h1 = screen.getByRole('heading', { level: 1, name: 'herdr' })
    expect(cls(h1)).toMatch(/\btext-lg\b/)
    expect(cls(h1)).not.toContain('sr-only')
    const header = h1.closest('[data-slot="page-header"]')!
    expect(cls(header)).toMatch(/\bh-10\b/)
    expect(header.querySelector('[data-slot="icon-block"]')).toBeNull()
    const sub = screen.getByText(/唯讀鏡像/)
    expect(sub).toHaveAttribute('title', '唯讀鏡像：不會送任何按鍵')
    expect(sub.textContent).toMatch(/^· /)
    expect(cls(sub)).toContain('max-sm:hidden')
  })
})

describe('Breadcrumb', () => {
  it('連結＋ChevronRight 分隔、最後一段 body-strong mono 且 aria-current', () => {
    render(
      <MemoryRouter>
        <Breadcrumb items={[{ label: '總覽', href: '/' }, { label: 'teamflow', href: '/?p=teamflow' }, { label: '2026-10-04-unify' }]} />
      </MemoryRouter>,
    )
    const nav = screen.getByRole('navigation', { name: '路徑' })
    expect(nav.querySelectorAll('svg')).toHaveLength(2)
    const link = screen.getByRole('link', { name: '總覽' })
    expect(link).toHaveAttribute('href', '/')
    expect(cls(link)).toContain('hover:text-foreground')
    expect(cls(link)).toContain('focus-visible:ring-3')
    const last = screen.getByText('2026-10-04-unify')
    expect(last).toHaveAttribute('aria-current', 'page')
    expect(cls(last)).toContain('font-mono')
    expect(cls(last)).toContain('font-semibold')
    expect(cls(last)).toContain('truncate')
  })
})

describe('Banner', () => {
  it.each([
    ['danger', 'alert'],
    ['warn', 'alert'],
    ['info', 'status'],
    ['ok', 'status'],
  ] as const)('%s：soft 底、radius-xl、role=%s、title 用 fg 色', (tone, role) => {
    render(<Banner tone={tone} title={`標題-${tone}`} />)
    const el = screen.getByRole(role)
    expect(el).toHaveAttribute('data-tone', tone)
    expect(cls(el)).toContain(`bg-status-${tone}-soft`)
    expect(cls(el)).toMatch(/\brounded-xl\b/)
    expect(cls(el)).not.toMatch(/border-l/)
    expect(cls(screen.getByText(`標題-${tone}`))).toContain(`text-status-${tone}-fg`)
    expect(el.querySelector('svg')).toHaveClass('size-5')
  })

  it('細節 foreground/80、action（BannerAction 框 status-X/60）、dismiss icon button', async () => {
    const user = userEvent.setup()
    const retry = vi.fn()
    const dismiss = vi.fn()
    render(
      <Banner tone="warn" title="更新失敗，顯示的是舊資料" action={<BannerAction onClick={retry} data-testid="b-retry">重試</BannerAction>} onDismiss={dismiss}>
        連線逾時
      </Banner>,
    )
    expect(cls(screen.getByText('連線逾時'))).toContain('text-foreground/80')
    const btn = screen.getByTestId('b-retry')
    expect(cls(btn)).toContain('border-status-warn/60')
    expect(btn).toHaveAttribute('data-size', 'sm')
    await user.click(btn)
    expect(retry).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '關閉' }))
    expect(dismiss).toHaveBeenCalled()
  })

  it('sm：radius-lg、圖示 icon-sm、只有 title（不顯示細節）、action 用 Button xs', () => {
    render(
      <Banner tone="warn" size="sm" title="暫時拿不到活動" action={<BannerAction onClick={() => {}}>重試</BannerAction>}>
        不顯示
      </Banner>,
    )
    const el = screen.getByRole('alert')
    expect(cls(el)).toMatch(/\brounded-lg\b/)
    expect(el.querySelector('svg')).toHaveClass('size-4')
    expect(screen.queryByText('不顯示')).toBeNull()
    expect(screen.getByRole('button', { name: '重試' })).toHaveAttribute('data-size', 'xs')
  })
})

describe('EmptyState', () => {
  it('page：empty-pad、圖示圓 size-16 accent、emoji emoji-lg、標題 title-sm、提示 measure-hint、action', () => {
    render(<EmptyState size="page" icon="📈" title="還沒有趨勢資料" hint="dashboard 開著時每分鐘記錄一次" action={<button type="button">重新整理</button>} />)
    const root = screen.getByText('還沒有趨勢資料').closest('[data-slot="empty-state"]')!
    expect(root).toHaveAttribute('data-size', 'page')
    expect(cls(root)).toMatch(/\bpy-12\b/)
    const circle = root.querySelector('[data-slot="empty-icon"]')!
    expect(cls(circle)).toMatch(/\bsize-16\b/)
    expect(cls(circle)).toContain('bg-accent')
    expect(cls(circle)).toMatch(/\brounded-full\b/)
    expect(cls(screen.getByText('📈'))).toMatch(/\btext-3xl\b/)
    expect(cls(screen.getByText('還沒有趨勢資料'))).toMatch(/\bfont-bold\b/)
    expect(cls(screen.getByText(/每分鐘/))).toContain('max-w-sm')
    expect(screen.getByRole('button', { name: '重新整理' })).toBeInTheDocument()
  })

  it('inline：empty-pad-inline、圖示圓 size-10 muted、lucide icon-md、標題 body-strong、提示 caption', () => {
    render(<EmptyState size="inline" icon={FolderX} title="找不到專案 x" hint="提示" />)
    const root = screen.getByText('找不到專案 x').closest('[data-slot="empty-state"]')!
    expect(cls(root)).toMatch(/\bpy-6\b/)
    const circle = root.querySelector('[data-slot="empty-icon"]')!
    expect(cls(circle)).toMatch(/\bsize-10\b/)
    expect(cls(circle)).toContain('bg-muted')
    expect(circle.querySelector('svg')).toHaveClass('size-5')
    expect(cls(screen.getByText('找不到專案 x'))).toMatch(/\bfont-semibold\b/)
    expect(cls(screen.getByText('提示'))).toMatch(/\btext-xs\b/)
  })
})

describe('ProgressBar', () => {
  it('軌 card、填 primary、radius-full、h-1.5、標籤 caption-strong tabular-nums、role=progressbar', () => {
    render(<ProgressBar value={1} max={3} label="1/3 波" />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '1')
    expect(bar).toHaveAttribute('aria-valuemax', '3')
    expect(cls(bar)).toContain('bg-card')
    expect(cls(bar)).toMatch(/\bh-1\.5\b/)
    expect(cls(bar)).toMatch(/\brounded-full\b/)
    const fill = bar.firstElementChild as HTMLElement
    expect(cls(fill)).toContain('bg-primary')
    expect(fill.style.width).toBe(`${(1 / 3) * 100}%`)
    expect(cls(screen.getByText('1/3 波'))).toContain('tabular-nums')
  })

  it('max 0 時寬 0%、超出時夾在 100%', () => {
    render(
      <>
        <ProgressBar value={0} max={0} data-testid="a" />
        <ProgressBar value={9} max={3} data-testid="b" />
      </>,
    )
    expect((screen.getByTestId('a').querySelector('[role=progressbar]')!.firstElementChild as HTMLElement).style.width).toBe('0%')
    expect((screen.getByTestId('b').querySelector('[role=progressbar]')!.firstElementChild as HTMLElement).style.width).toBe('100%')
  })
})
