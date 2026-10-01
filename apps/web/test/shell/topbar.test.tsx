import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TopBar } from '@/features/topbar/TopBar'
import { resetDashStore, useDashStore } from '@/store/store'
import { overview } from './builders'

const NOW = Date.UTC(2026, 8, 25, 0, 0)

beforeEach(() => {
  resetDashStore()
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
})

const kd = (kind: string, until_epoch: number) => ({
  kind, until: '', until_epoch, exact: true, recorded_at: '', from_task: '', agent: '', reason: '', project: 'p',
})

function renderBar() {
  return render(
    <MemoryRouter>
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
    expect(screen.getByText('codex 熔斷 · 還剩 15 天 22 小時')).toBeInTheDocument()
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
})
