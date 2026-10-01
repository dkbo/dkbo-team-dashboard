// 用 shared 的 makeSampleFixture＋純函式組出 API 回應，驗 /trends 頁上的數字跟 fixture 註解的金額一致。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import {
  BUCKET_MS,
  costByDay,
  costByKind,
  ctxSeries,
  makeSampleFixture,
  parseDispatch,
  projections,
  RANGE_MS,
  spendDeltas,
  spendInRange,
  summarizeCosts,
  usageSeries,
  type CostsResponse,
  type TrendRange,
  type TrendsResponse,
} from '@dash/shared'
import { teamflowDetailBklog, teamflowDetailOps, teamflowTierConfig } from '../../../../packages/shared/fixtures/index.ts'
import { TooltipProvider } from '@/components/ui/tooltip'
import TrendsPage from '@/pages/trends/TrendsPage'
import { resetDashStore } from '@/store/store'

// 當天 14:00：24h 只含當天那一輪樣本（前一天的樣本在 12:00–13:50），7d 含兩天
const NOW = new Date(2026, 8, 26, 14, 0).getTime()
const samples = Object.values(makeSampleFixture(NOW)).flat()
const entries = spendDeltas(samples)

function trendsFor(range: TrendRange): TrendsResponse {
  const from = NOW - RANGE_MS[range]
  const inRange = spendInRange(entries, from, NOW)
  return {
    range,
    from,
    to: NOW,
    bucketMs: BUCKET_MS[range],
    generatedAt: NOW,
    skipped: 0,
    dataDir: '/tmp/dash-data',
    usage: usageSeries(samples, from, NOW, BUCKET_MS[range]),
    projection: projections(samples, NOW),
    ctx: ctxSeries(samples, from, NOW, BUCKET_MS[range]),
    costByDay: costByDay(inRange),
    costByKind: costByKind(inRange),
  }
}

// 派工索引：teamflow 兩個任務的 spawn 事件＋fixture 專案的 roles／kinds（server 組的是同一個形狀）
const dispatch = {
  teamflow: Object.fromEntries(
    [teamflowDetailBklog, teamflowDetailOps].map((d) => [d.task.dir, parseDispatch(d.task.events, d.task.short, teamflowTierConfig)]),
  ),
}

function costsFor(range: TrendRange): CostsResponse {
  const from = NOW - RANGE_MS[range]
  const inRange = samples.filter((x) => x.ts >= from && x.ts <= NOW)
  return { range, generatedAt: NOW, from, to: NOW, skipped: 0, ...summarizeCosts(spendInRange(entries, from, NOW), { dispatch, samples: inRange }) }
}

beforeEach(() => {
  resetDashStore()
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = new URL(url, 'http://x')
      const range = (u.searchParams.get('range') ?? '24h') as TrendRange
      const body = u.pathname === '/api/trends' ? trendsFor(range) : u.pathname === '/api/costs' ? costsFor(range) : { projects: [] }
      return Response.json(body)
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <TooltipProvider>
        <Routes>
          <Route path="/trends" element={<TrendsPage />} />
        </Routes>
      </TooltipProvider>
    </MemoryRouter>,
  )

describe('/trends 以 makeSampleFixture 驗數字', () => {
  it('24h：任務、成員、其他、未歸屬、角色、kind 小計', async () => {
    renderAt('/trends?range=24h')
    const bklog = await screen.findByTestId('task-cost-teamflow-2026-09-24-bklog')
    expect(bklog).toHaveTextContent('$6.50')
    expect(within(bklog).getByTestId('member-cost-frontend-shell')).toHaveTextContent('$4.00')
    expect(within(bklog).getByTestId('member-cost-backend')).toHaveTextContent('$2.50')
    const ops = screen.getByTestId('task-cost-teamflow-2026-09-23-ops')
    expect(ops).toHaveTextContent('$5.75')
    expect(within(ops).getByTestId('member-cost-backend')).toHaveTextContent('$3.00')
    expect(within(ops).getByTestId('member-cost-other')).toHaveTextContent('其他 $2.75')
    expect(screen.getByTestId('task-cost-unattributed')).toHaveTextContent('$5.50')
    expect(screen.getByTestId('role-cost-frontend')).toHaveTextContent('$4.00')
    expect(screen.getByTestId('role-cost-backend')).toHaveTextContent('$5.50')
    expect(screen.getByTestId('role-cost-unknown')).toHaveTextContent('$8.25')
    expect(screen.getByTestId('kind-cost-claude')).toHaveTextContent('$9.50')
    expect(screen.getByTestId('kind-cost-codex')).toHaveTextContent('$8.25')
    expect(screen.getByTestId('usage-chart-claude')).toBeInTheDocument()
    expect(screen.getByTestId('usage-chart-codex')).toBeInTheDocument()
  })

  it('切到 7d：兩天的金額都算進來', async () => {
    renderAt('/trends?range=24h')
    await screen.findByTestId('task-cost-teamflow-2026-09-24-bklog')
    await userEvent.setup().click(screen.getByRole('button', { name: '7 天' }))
    await waitFor(() => expect(screen.getByTestId('task-cost-teamflow-2026-09-24-bklog')).toHaveTextContent('$13.00'))
    expect(screen.getByTestId('task-cost-unattributed')).toHaveTextContent('$11.00')
    expect(screen.getByTestId('role-cost-unknown')).toHaveTextContent('$16.50')
  })

  it('7d：實際／設定兩張卡、不一致區塊與成員檔位（金額照 backend fixture 註記）', async () => {
    renderAt('/trends?range=7d')
    const box = await screen.findByTestId('cost-mismatch')
    const rows = within(box).getAllByTestId(/^mismatch-row-/)
    expect(rows).toHaveLength(2)
    for (const r of rows) {
      expect(r).toHaveTextContent('frontend-shell')
      expect(within(r).getByTestId('mismatch-actual')).toHaveTextContent('sonnet 5/high')
      expect(within(r).getByTestId('mismatch-configured')).toHaveTextContent('sonnet/medium')
      expect(r).toHaveTextContent('$1.50')
    }
    expect(box).toHaveTextContent('$3.00')
    const bklog = screen.getByTestId('task-cost-teamflow-2026-09-24-bklog')
    expect(within(bklog).getByTestId('member-tier-frontend-shell')).toHaveTextContent('M · sonnet/medium')
    expect(within(bklog).getByTestId('member-mismatch-frontend-shell')).toBeInTheDocument()
    expect(within(bklog).getByTestId('member-tier-backend')).toHaveTextContent('L · opus/high')
    expect(within(screen.getByTestId('cost-by-actual')).getAllByRole('listitem').length).toBeGreaterThan(0)
    expect(within(screen.getByTestId('cost-by-configured')).getAllByRole('listitem').length).toBeGreaterThan(0)
  })
})
