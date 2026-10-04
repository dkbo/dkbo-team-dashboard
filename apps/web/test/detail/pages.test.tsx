import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import TaskPage from '@/pages/task/TaskPage'
import HistoryPage from '@/pages/history/HistoryPage'
import { makeDetailDoc, makeDispatch, makePane } from './fixtures'

const hooks = vi.hoisted(() => ({
  useTaskDetail: vi.fn(),
  useHistory: vi.fn(),
  useCostsAll: vi.fn(),
}))
vi.mock('@/store', () => hooks)

afterEach(cleanup)
beforeEach(() => {
  hooks.useTaskDetail.mockReset()
  hooks.useHistory.mockReset()
  hooks.useCostsAll.mockReset()
  hooks.useCostsAll.mockReturnValue({ data: null, error: null, loading: false })
})

const costsAll = (tasks: unknown[], mismatchPanes: unknown[] = []) => ({
  data: { range: 'all', generatedAt: 1, from: 0, to: 1, skipped: 0, tasks, byRole: {}, unknownRole: 0, unattributed: 0, mismatch: { cost: 0, panes: mismatchPanes } },
  error: null,
  loading: false,
})

const base = { data: null, error: null, loading: false, notFound: false, reload: vi.fn() }

const renderTask = (path = '/p/demo%20proj/t/2026-09-20-demo') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/p/:project/t/:dir" element={<TaskPage />} />
      </Routes>
    </MemoryRouter>,
  )

describe('TaskPage', () => {
  it('以路由參數呼叫 useTaskDetail 並渲染詳情', () => {
    hooks.useTaskDetail.mockReturnValue({
      ...base,
      data: { project: 'demo proj', detail: makeDetailDoc(), panes: [makePane()] },
    })
    renderTask()
    expect(hooks.useTaskDetail).toHaveBeenCalledWith('demo proj', '2026-09-20-demo')
    expect(screen.getByRole('heading', { name: '示範任務' })).toBeInTheDocument()
    expect(screen.getByTestId('member-backend')).toHaveTextContent('工作中')
    expect(within(screen.getByRole('navigation', { name: '路徑' })).getByRole('link', { name: '總覽' })).toHaveAttribute('href', '/')
  })

  it('顯示本任務花費：總額＋依成員＋其他', () => {
    hooks.useTaskDetail.mockReturnValue({ ...base, data: { project: 'demo proj', detail: makeDetailDoc(), panes: [] } })
    hooks.useCostsAll.mockReturnValue(
      costsAll([
        { project: 'demo proj', taskDir: '2026-09-20-demo', cost: 4.5, members: { qa: 1, backend: 3 }, unmatched: 0.5 },
        { project: 'other', taskDir: '2026-09-20-demo', cost: 99, members: {}, unmatched: 0 },
      ]),
    )
    renderTask()
    const block = screen.getByTestId('task-cost')
    expect(block).toHaveTextContent('本任務花費')
    expect(block).toHaveTextContent('$4.50')
    expect(within(block).getByTestId('member-cost-backend')).toHaveTextContent('backend $3.00')
    expect(within(block).getByTestId('member-cost-qa')).toHaveTextContent('qa $1.00')
    expect(within(block).getByTestId('member-cost-other')).toHaveTextContent('其他 $0.50')
  })

  it('派工紀錄傳進成員表；本任務花費卡的成員列顯示設定檔位', () => {
    const d = makeDispatch({ tier: 'L', model: 'opus', effort: 'high' })
    hooks.useTaskDetail.mockReturnValue({ ...base, data: { project: 'demo proj', detail: makeDetailDoc(), panes: [], dispatch: [d] } })
    hooks.useCostsAll.mockReturnValue(
      costsAll([
        {
          project: 'demo proj',
          taskDir: '2026-09-20-demo',
          cost: 3,
          members: { backend: 3 },
          unmatched: 0,
          byConfigured: [],
          memberInfo: { backend: { configured: d, dispatchCount: 1, actual: { model: 'opus', effort: 'high' }, mismatch: true } },
        },
      ], [
        { paneId: 'p1', project: 'demo proj', taskDir: '2026-09-20-demo', member: 'backend', actual: { model: 'sonnet 5', effort: 'high' }, configured: { model: 'opus', effort: 'high' }, cost: 1 },
        { paneId: 'p9', project: 'other', taskDir: '2026-09-20-demo', member: 'backend', actual: { model: 'gpt-5', effort: 'low' }, configured: { model: 'opus', effort: 'high' }, cost: 5 },
      ]),
    )
    renderTask()
    expect(screen.getByTestId('member-configured-backend')).toHaveTextContent('claude L · opus/high')
    const block = screen.getByTestId('task-cost')
    expect(within(block).getByTestId('member-tier-backend')).toHaveTextContent('設定 L · opus/high')
    expect(within(block).getByTestId('member-mismatch-backend')).toHaveAccessibleName('實際 sonnet 5/high，設定 opus/high')
  })

  it('沒有花費資料時顯示「—」', () => {
    hooks.useTaskDetail.mockReturnValue({ ...base, data: { project: 'demo proj', detail: makeDetailDoc(), panes: [] } })
    hooks.useCostsAll.mockReturnValue(costsAll([]))
    renderTask()
    expect(screen.getByTestId('task-cost-total')).toHaveTextContent('—')
    cleanup()
    hooks.useCostsAll.mockReturnValue({ data: null, error: 'HTTP 500', loading: false })
    renderTask()
    expect(screen.getByTestId('task-cost-total')).toHaveTextContent('—')
  })

  it('載入中顯示骨架', () => {
    hooks.useTaskDetail.mockReturnValue({ ...base, loading: true })
    renderTask()
    expect(screen.getByTestId('task-loading')).toBeInTheDocument()
  })

  it('404 顯示找不到', () => {
    hooks.useTaskDetail.mockReturnValue({ ...base, notFound: true })
    renderTask()
    expect(screen.getByText(/找不到任務/)).toBeInTheDocument()
  })

  it('錯誤且無資料時顯示錯誤與重試', async () => {
    const reload = vi.fn()
    hooks.useTaskDetail.mockReturnValue({ ...base, error: 'HTTP 500', reload })
    renderTask()
    expect(screen.getByText(/HTTP 500/)).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: '重試' }))
    expect(reload).toHaveBeenCalled()
  })

  it('錯誤但有舊資料時保留畫面並提示', () => {
    hooks.useTaskDetail.mockReturnValue({
      ...base,
      error: 'HTTP 500',
      data: { project: 'demo proj', detail: makeDetailDoc(), panes: [] },
    })
    renderTask()
    expect(screen.getByRole('heading', { name: '示範任務' })).toBeInTheDocument()
    expect(screen.getByText(/HTTP 500/)).toBeInTheDocument()
  })
})

describe('HistoryPage', () => {
  const renderHistory = () =>
    render(
      <MemoryRouter>
        <HistoryPage />
      </MemoryRouter>,
    )

  it('渲染 useHistory 的資料', () => {
    hooks.useHistory.mockReturnValue({
      ...base,
      data: [
        {
          project: 'teamflow',
          dir: '2026-09-24-x',
          display: 'X 任務',
          status: 'done',
          closedAt: '2026-09-24T10:00',
          totalMin: 60,
          waves: 1,
          rulings: 0,
          autonomousRulings: 0,
          minors: 0,
          reReviews: 0,
          perWave: [],
        },
      ],
    })
    hooks.useCostsAll.mockReturnValue(costsAll([{ project: 'teamflow', taskDir: '2026-09-24-x', cost: 1.5, members: {}, unmatched: 0 }]))
    renderHistory()
    expect(screen.getByRole('heading', { name: '歷史與分析' })).toBeInTheDocument()
    // < md 另有卡片清單（jsdom 不套 CSS，兩份都在），連結查在表格內
    expect(within(screen.getByTestId('history-table')).getByRole('link', { name: 'X 任務' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '花費' })).toBeInTheDocument()
    expect(within(screen.getByTestId('history-row-teamflow-2026-09-24-x')).getByTestId('col-cost')).toHaveTextContent('$1.50')
  })

  it('載入中與錯誤', () => {
    hooks.useHistory.mockReturnValue({ ...base, loading: true })
    renderHistory()
    expect(screen.getByTestId('history-loading')).toBeInTheDocument()
    cleanup()
    hooks.useHistory.mockReturnValue({ ...base, error: 'HTTP 502' })
    renderHistory()
    expect(screen.getByText(/HTTP 502/)).toBeInTheDocument()
  })
})
