import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import type { AgentLive } from '@dash/shared'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TopBar } from '@/features/topbar/TopBar'
import { usageTone } from '@/features/topbar/model'
import { resetDashStore, useDashStore } from '@/store/store'
import { overview } from './builders'

const NOW = Date.UTC(2026, 8, 25, 0, 0)

beforeEach(() => {
  resetDashStore()
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => vi.unstubAllGlobals())

const kd = (kind: string, until_epoch: number) => ({
  kind, until: '', until_epoch, exact: true, recorded_at: '', from_task: '', agent: '', reason: '', project: 'p',
})

const agent = (id: string, status: AgentLive['status']): AgentLive => ({
  paneId: id, tabId: 'w:t', workspaceId: 'w', name: id, agent: 'claude', status, cwd: '/p', model: null, effort: null, cost: null,
  ctxPct: null, usage5hPct: null, usageWkPct: null, taskDir: null, member: null, project: null,
})

const cls = (el: Element | null) => el?.getAttribute('class') ?? ''

function renderBar(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TooltipProvider>
        <TopBar now={NOW} />
      </TooltipProvider>
    </MemoryRouter>,
  )
}

describe('TopBar', () => {
  it('熔斷倒數、額度 %（缺值 —）、兩顆燈、最後更新', () => {
    const generatedAt = new Date(2026, 8, 25, 9, 8, 7).getTime()
    useDashStore.setState({
      sse: 'open',
      overview: overview({
        generatedAt,
        kindsDown: [kd('codex', NOW / 1000 + (15 * 24 + 22) * 3600 + 60), kd('codex', NOW / 1000 + 60)],
        usage: { claude: { fiveHourPct: 42, weekPct: null } },
        herdr: { state: 'polling', lastAt: null },
      }),
    })
    renderBar()
    expect(screen.getByText('codex 熔斷 · 15 天 22 小時')).toBeInTheDocument()
    expect(screen.getByTestId('usage-claude')).toHaveTextContent('claude5h 42%週 —')
    expect(screen.getByTestId('light-sse')).toHaveAttribute('data-state', 'ok')
    expect(screen.getByTestId('light-herdr')).toHaveAttribute('data-state', 'down')
    expect(screen.getByText(/最後更新 09:08:07/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '總覽' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: '歷史' })).toHaveAttribute('href', '/history')
    expect(screen.getByRole('link', { name: '趨勢' })).toHaveAttribute('href', '/trends')
  })

  it('沒有 overview 時燈號未知、沒有額度資料顯示「—」', () => {
    useDashStore.setState({ sse: 'connecting' })
    renderBar()
    expect(screen.getByTestId('light-sse')).toHaveAttribute('data-state', 'down')
    expect(screen.getByTestId('light-herdr')).toHaveAttribute('data-state', 'unknown')
    expect(screen.getByTestId('usage-none')).toHaveTextContent('額度 —')
  })

  it('外框：sticky、≥ lg 高 h-14、內容 max-w-page＋page-x；Logo 連到 /', () => {
    renderBar()
    const header = screen.getByRole('banner')
    expect(cls(header)).toContain('sticky')
    expect(cls(header)).toContain('bg-background/80')
    expect(cls(header)).toContain('shadow-soft')
    const inner = header.firstElementChild!
    expect(cls(inner)).toContain('max-w-page')
    expect(cls(inner)).toContain('lg:h-14')
    expect(cls(inner)).toContain('px-4')
    expect(cls(inner)).toContain('lg:px-6')
    const logo = screen.getByRole('link', { name: /dkbo 儀表板/ })
    expect(logo).toHaveAttribute('href', '/')
    expect(cls(logo.querySelector('svg'))).toContain('size-6')
  })

  it('NavLink：高 control、inset-control、radius-full、body-strong；選中 selected-solid＋aria-current', () => {
    renderBar('/history')
    const nav = screen.getByRole('navigation', { name: '主要導覽' })
    expect(cls(nav)).toContain('overflow-x-auto')
    const active = within(nav).getByRole('link', { name: '歷史' })
    expect(active).toHaveAttribute('aria-current', 'page')
    for (const c of ['h-8', 'px-3.5', 'rounded-full', 'text-sm', 'font-semibold', 'bg-primary', 'text-primary-foreground', 'focus-visible:ring-3'])
      expect(cls(active)).toContain(c)
    const other = within(nav).getByRole('link', { name: '趨勢' })
    expect(cls(other)).toContain('text-muted-foreground')
    expect(cls(other)).toContain('hover:bg-muted')
  })

  it('UsageChip（Q12）：任一值 ≥ 80% 變 warn、永不變紅；正常框 brand-blue/70', () => {
    useDashStore.setState({
      overview: overview({ usage: { claude: { fiveHourPct: 42, weekPct: 10 }, codex: { fiveHourPct: 12, weekPct: 80 }, agy: { fiveHourPct: 100, weekPct: 100 } } }),
    })
    renderBar()
    const chips = screen.getAllByTestId('usage-chip')
    expect(chips.map((c) => c.getAttribute('data-kind'))).toEqual(['agy', 'claude', 'codex'])
    const [agy, claude, codex] = chips
    expect(claude).toHaveAttribute('data-tone', 'normal')
    expect(cls(claude)).toContain('border-brand-blue/70')
    expect(cls(claude)).toContain('border-(length:--border-w-pill)')
    expect(cls(claude)).toContain('rounded-full')
    expect(codex).toHaveAttribute('data-tone', 'warn')
    expect(cls(codex)).toContain('border-status-warn')
    expect(cls(codex)).toContain('text-status-warn-fg')
    expect(agy).toHaveAttribute('data-tone', 'warn')
    for (const c of chips) expect(cls(c)).not.toMatch(/danger/)
    expect(usageTone({ fiveHourPct: 79.9, weekPct: null })).toBe('normal')
    expect(usageTone({ fiveHourPct: null, weekPct: 80 })).toBe('warn')
  })

  it('kind 熔斷膠囊 warn（data-kind），blocked 膠囊 danger', () => {
    useDashStore.setState({
      overview: overview({ kindsDown: [kd('codex', NOW / 1000 + 3600)], agents: [agent('w:p1', 'blocked')] }),
    })
    renderBar()
    const br = screen.getByTestId('breaker-pill')
    expect(br).toHaveAttribute('data-kind', 'codex')
    expect(br).toHaveAttribute('data-color', 'warn')
    expect(cls(br)).toContain('border-status-warn')
    const blocked = screen.getByTestId('blocked-badge')
    expect(blocked).toHaveTextContent('1 個 agent 卡住')
    expect(blocked.querySelector('[data-slot="status-pill"]')).toHaveAttribute('data-color', 'danger')
    expect(cls(blocked)).toContain('focus-visible:ring-3')
  })

  it('ConnectionChip：兩個 StatusDot（ok／warn=輪詢／danger=斷／idle=未知）＋「SSE · herdr」', () => {
    useDashStore.setState({ sse: 'open', overview: overview({ herdr: { state: 'polling', lastAt: null } }) })
    const { unmount } = renderBar()
    const chip = screen.getByTestId('connection-chip')
    expect(chip).toHaveTextContent('SSE · herdr')
    expect(cls(chip)).toContain('bg-muted')
    expect(cls(chip)).toContain('h-6')
    expect(cls(chip)).toContain('focus-visible:ring-3')
    expect(screen.getByTestId('light-sse')).toHaveAttribute('data-tone', 'ok')
    expect(screen.getByTestId('light-sse')).toHaveClass('bg-status-ok')
    expect(screen.getByTestId('light-herdr')).toHaveAttribute('data-tone', 'warn')
    expect(screen.getByTestId('light-herdr')).toHaveClass('bg-status-warn')
    expect(chip).toHaveAccessibleName(/SSE 已連線.*herdr 訂閱斷線，每 5 秒輪詢中/)
    unmount()
    useDashStore.setState({ sse: 'closed', overview: overview({ herdr: { state: 'down', lastAt: null } }) })
    renderBar()
    expect(screen.getByTestId('light-sse')).toHaveAttribute('data-tone', 'danger')
    expect(screen.getByTestId('light-herdr')).toHaveAttribute('data-tone', 'danger')
    expect(screen.getByTestId('light-herdr')).toHaveAttribute('data-state', 'down')
  })

  it('最後更新 < xl 隱藏（改進 ConnectionChip Tooltip）', () => {
    useDashStore.setState({ overview: overview({ generatedAt: new Date(2026, 8, 25, 9, 8, 7).getTime() }) })
    renderBar()
    expect(cls(screen.getByText(/最後更新 09:08:07/))).toContain('max-xl:hidden')
    expect(cls(screen.getByText(/最後更新 09:08:07/))).toContain('tabular-nums')
  })

  it('狀態群放不下時收成 +N，點開列出全部', async () => {
    const user = userEvent.setup()
    // jsdom 沒有版面：讓第 3 個起的狀態項「換到第二行」（被裁掉）
    const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetTop')
    Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
      configurable: true,
      get(this: HTMLElement) {
        const i = this.dataset.statusIndex
        return i != null && Number(i) >= 2 ? 30 : 0
      },
    })
    try {
      useDashStore.setState({
        overview: overview({
          kindsDown: [kd('codex', NOW / 1000 + 3600)],
          agents: [agent('w:p1', 'blocked')],
          usage: { claude: { fiveHourPct: 42, weekPct: 10 }, agy: { fiveHourPct: 1, weekPct: 2 } },
        }),
      })
      renderBar()
      const more = screen.getByTestId('status-overflow')
      expect(more).toHaveTextContent('+2')
      const hidden = document.querySelectorAll('[data-status-index][data-overflow]')
      expect(hidden).toHaveLength(2)
      for (const h of hidden) expect(h).toHaveAttribute('aria-hidden', 'true')
      await user.click(more)
      const list = await screen.findByTestId('status-overflow-list')
      expect(list).toHaveTextContent('1 個 agent 卡住')
      const link = within(list).getByRole('link', { name: '1 個 agent 卡住' })
      expect(link.className).toContain('outline-none')
      expect(link.className).toContain('focus-visible:ring-3')
      expect(link.className).toContain('focus-visible:ring-ring/50')
      expect(list).toHaveTextContent('codex 熔斷')
      expect(list).toHaveTextContent('agy')
      expect(list).toHaveTextContent('claude')
    } finally {
      if (desc) Object.defineProperty(HTMLElement.prototype, 'offsetTop', desc)
    }
  })
})
