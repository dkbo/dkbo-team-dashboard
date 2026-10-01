import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { HistoryView } from '@/features/history/HistoryView'
import { makeDispatch } from './fixtures'

afterEach(cleanup)

const row = (over: Record<string, unknown>) => ({
  project: 'teamflow',
  dir: '2026-09-24-testtrust',
  display: '測試可信度',
  status: 'done',
  closedAt: '2026-09-24T10:15',
  totalMin: 125,
  waves: 2,
  rulings: 3,
  autonomousRulings: 1,
  minors: 7,
  reReviews: 2,
  perWave: [{ wave: 1, devMin: 64, reviewMin: 6 }],
  ...over,
})

const BE_L = { kind: 'claude', tier: 'L', model: 'opus', effort: 'high' }
const rows = [
  row({
    repairWaves: 1,
    dispatch: [
      makeDispatch({ ...BE_L }),
      makeDispatch({ ...BE_L, notes: ['resume'] }),
      makeDispatch({ agent: 'x-backend-b', member: 'backend-b', ...BE_L }),
      makeDispatch({ agent: 'x-qa', member: 'qa', role: 'qa', tier: 'M', model: null, effort: null }),
      makeDispatch({ agent: 'x-reviewer-a', member: 'reviewer-a', role: 'reviewer', tier: 'S' }),
    ],
  }),
  row({
    project: 'collect',
    dir: '2026-09-10-old',
    display: '舊任務',
    status: 'abandoned',
    closedAt: '2026-09-10T09:00',
    totalMin: 30,
    waves: 4,
    repairWaves: 0,
    reReviews: 0,
    dispatch: [makeDispatch({ ...BE_L })],
  }),
  row({ project: 'teamflow', dir: '2026-09-01-first', display: '第一個', closedAt: '2026-09-01T09:00', totalMin: null, dispatch: [] }),
]

const renderView = () =>
  render(
    <MemoryRouter>
      <HistoryView rows={rows as never} />
    </MemoryRouter>,
  )

const bodyRows = () => within(screen.getByTestId('history-table')).getAllByTestId(/^history-row-/)

describe('HistoryView', () => {
  it('一任務一列，含各欄與詳情連結，依結案時間新到舊', () => {
    renderView()
    const trs = bodyRows()
    expect(trs).toHaveLength(3)
    const first = trs[0]
    expect(first).toHaveTextContent('測試可信度')
    expect(first).toHaveTextContent('2 小時 5 分')
    expect(within(first).getByTestId('col-rulings')).toHaveTextContent('3 / 1')
    expect(within(first).getByTestId('col-minors')).toHaveTextContent('7')
    expect(within(first).getByTestId('col-rereviews')).toHaveTextContent('2')
    expect(within(first).getByTestId('col-waves')).toHaveTextContent('2')
    expect(within(first).getByRole('link', { name: '測試可信度' })).toHaveAttribute(
      'href',
      '/p/teamflow/t/2026-09-24-testtrust',
    )
    expect(trs[2]).toHaveTextContent('第一個')
    expect(trs[1]).toHaveTextContent('已放棄')
  })

  it('依專案篩選', async () => {
    const user = userEvent.setup()
    renderView()
    await user.selectOptions(screen.getByLabelText('專案'), 'collect')
    expect(bodyRows()).toHaveLength(1)
    expect(bodyRows()[0]).toHaveTextContent('舊任務')
  })

  it('依結案日期範圍篩選，無結果顯示空狀態', async () => {
    const user = userEvent.setup()
    renderView()
    await user.type(screen.getByLabelText('結案起'), '2026-09-05')
    expect(bodyRows()).toHaveLength(2)
    await user.type(screen.getByLabelText('結案迄'), '2026-09-09')
    expect(screen.getByText('沒有符合條件的已結案任務')).toBeInTheDocument()
  })

  it('花費欄：有資料顯示金額，沒有顯示「—」', () => {
    const costs = {
      range: 'all', generatedAt: 1, from: 0, to: 1, skipped: 0, byRole: {}, unknownRole: 0, unattributed: 0,
      tasks: [{ project: 'teamflow', taskDir: '2026-09-24-testtrust', cost: 12.3456, members: {}, unmatched: 0 }],
    }
    render(
      <MemoryRouter>
        <HistoryView rows={rows as never} costs={costs as never} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('columnheader', { name: '花費' })).toBeInTheDocument()
    const trs = bodyRows()
    expect(within(trs[0]).getByTestId('col-cost')).toHaveTextContent('$12.35')
    expect(within(trs[1]).getByTestId('col-cost')).toHaveTextContent('—')
  })

  it('沒給 costs 時花費欄都是「—」', () => {
    renderView()
    for (const tr of bodyRows()) expect(within(tr).getByTestId('col-cost')).toHaveTextContent('—')
  })

  it('有兩張圖的容器', () => {
    renderView()
    expect(screen.getByTestId('chart-dev-review')).toBeInTheDocument()
    expect(screen.getByTestId('chart-weekly')).toBeInTheDocument()
  })

  it('檔位欄：(成員, 檔位) 去重計數、排除 reviewer；沒有派工顯示「—」', () => {
    renderView()
    expect(within(screen.getByTestId('history-table')).getByRole('columnheader', { name: '檔位' })).toBeInTheDocument()
    const trs = bodyRows()
    expect(within(trs[0]).getByTestId('col-tiers')).toHaveTextContent('L×2 M×1')
    expect(within(trs[1]).getByTestId('col-tiers')).toHaveTextContent('L×1')
    expect(within(trs[2]).getByTestId('col-tiers')).toHaveTextContent('—')
  })

  const costsAll = {
    range: 'all', generatedAt: 1, from: 0, to: 1, skipped: 0, byRole: {}, unknownRole: 0, unattributed: 0, byActual: [], byConfigured: [], mismatch: { cost: 0, panes: [] },
    tasks: [
      { project: 'teamflow', taskDir: '2026-09-24-testtrust', cost: 10, members: {}, unmatched: 0, memberInfo: {},
        byConfigured: [{ role: 'backend', ...BE_L, cost: 6 }, { role: 'qa', kind: 'claude', tier: 'M', model: null, effort: null, cost: 4 }] },
      { project: 'collect', taskDir: '2026-09-10-old', cost: 3, members: {}, unmatched: 0, memberInfo: {}, byConfigured: [{ role: 'backend', ...BE_L, cost: 3 }] },
    ],
  }
  const renderWithCosts = (c: unknown = costsAll) =>
    render(
      <MemoryRouter>
        <HistoryView rows={rows as never} costs={c as never} />
      </MemoryRouter>,
    )
  const tierTable = () => within(screen.getByTestId('history-tier-analysis')).getByTestId('tier-analysis-table')

  it('依角色 × 派工檔位：列、欄、說明；排除 reviewer', () => {
    renderWithCosts()
    const card = screen.getByTestId('history-tier-analysis')
    expect(card).toHaveTextContent('依角色 × 派工檔位')
    expect(card).toHaveTextContent('耗時、波數等為任務層級的相關，不代表因果')
    const table = tierTable()
    for (const h of ['角色', '檔位', '任務數', '成員數', '歸屬花費', '每成員平均花費', '平均耗時', '平均波數', '平均修復波數', '平均重審次數'])
      expect(within(table).getByRole('columnheader', { name: h })).toBeInTheDocument()
    const trs = within(table).getAllByTestId(/^tier-analysis-row-/)
    expect(trs).toHaveLength(2)
    for (const tr of trs) expect(tr).not.toHaveTextContent('reviewer')
    const be = trs[0]
    expect(be).toHaveTextContent('backend')
    expect(be).toHaveTextContent('claude L · opus/high')
    expect(within(be).getByTestId('ta-tasks')).toHaveTextContent('2')
    expect(within(be).getByTestId('ta-members')).toHaveTextContent('3')
    expect(within(be).getByTestId('ta-cost')).toHaveTextContent('$9.00')
    expect(within(be).getByTestId('ta-cost-per-member')).toHaveTextContent('$3.00')
    expect(within(be).getByTestId('ta-total-min')).toHaveTextContent('1 小時 17 分') // (125 + 30) / 2
    expect(within(be).getByTestId('ta-waves')).toHaveTextContent('3')
    expect(within(be).getByTestId('ta-repair-waves')).toHaveTextContent('0.5')
    expect(within(be).getByTestId('ta-rereviews')).toHaveTextContent('1')
    expect(trs[1]).toHaveTextContent('qa')
    expect(trs[1]).toHaveTextContent('claude M · 未知')
  })

  it('分析卡套用專案篩選', async () => {
    const user = userEvent.setup()
    renderWithCosts()
    await user.selectOptions(screen.getByLabelText('專案'), 'collect')
    const trs = within(tierTable()).getAllByTestId(/^tier-analysis-row-/)
    expect(trs).toHaveLength(1)
    expect(within(trs[0]).getByTestId('ta-tasks')).toHaveTextContent('1')
    expect(within(trs[0]).getByTestId('ta-cost')).toHaveTextContent('$3.00')
    expect(within(trs[0]).getByTestId('ta-total-min')).toHaveTextContent('30 分')
  })

  it('分析卡：沒有花費資料或耗時全為 null 顯示「—」', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <HistoryView rows={[rows[0], { ...rows[1], totalMin: null }] as never} />
      </MemoryRouter>,
    )
    await user.selectOptions(screen.getByLabelText('專案'), 'collect')
    const tr = within(tierTable()).getAllByTestId(/^tier-analysis-row-/)[0]
    expect(within(tr).getByTestId('ta-cost')).toHaveTextContent('—')
    expect(within(tr).getByTestId('ta-cost-per-member')).toHaveTextContent('—')
    expect(within(tr).getByTestId('ta-total-min')).toHaveTextContent('—')
  })

  it('分析卡：小螢幕卡片列在同一容器內；沒有派工紀錄顯示空狀態', async () => {
    const user = userEvent.setup()
    renderWithCosts()
    const list = within(screen.getByTestId('history-tier-analysis')).getByTestId('tier-analysis-list')
    expect(list.className).toContain('md:hidden')
    expect(within(list).getAllByTestId(/^tier-analysis-card-/)).toHaveLength(2)
    await user.type(screen.getByLabelText('結案迄'), '2026-09-05')
    expect(screen.getByTestId('history-tier-analysis')).toHaveTextContent('沒有派工紀錄')
  })
})
