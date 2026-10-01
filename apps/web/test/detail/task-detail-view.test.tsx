import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import userEvent from '@testing-library/user-event'
import { TaskDetailView } from '@/features/task/TaskDetailView'
import { makeDetailDoc, makeDispatch, makePane } from './fixtures'

afterEach(cleanup)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const view = (over: Record<string, unknown> = {}, panes: any[] = [makePane()]) =>
  render(<TaskDetailView project="demo-proj" detail={makeDetailDoc(over) as never} panes={panes as never} />, { wrapper: MemoryRouter })

describe('TaskDetailView 頁首', () => {
  it('顯示名、狀態、分支、目標、關卡①時間', () => {
    view()
    expect(screen.getByRole('heading', { name: '示範任務' })).toBeInTheDocument()
    const header = screen.getByTestId('task-header')
    expect(within(header).getByText('進行中')).toBeInTheDocument()
    expect(within(header).getByText('dk/demo')).toBeInTheDocument()
    expect(within(header).getByText(/把示範功能做完/)).toBeInTheDocument()
    expect(within(header).getByText('09-20 08:30')).toBeInTheDocument()
  })

  it('結案時顯示結案結果', () => {
    view({ status: 'done', closed_at: '2026-09-21T12:00', close_result: 'merged 82bd82b' })
    const header = screen.getByTestId('task-header')
    expect(within(header).getByText('已完成')).toBeInTheDocument()
    expect(within(header).getByText('merged 82bd82b')).toBeInTheDocument()
  })

  it('skipped_lines 加總 > 0 顯示「N 行無法解析」，0 則不顯示', () => {
    view({ skipped_lines: { process: 2, messages: 1 } })
    expect(screen.getByText('3 行無法解析')).toBeInTheDocument()
    cleanup()
    view()
    expect(screen.queryByText(/行無法解析/)).toBeNull()
  })
})

describe('波次時間軸', () => {
  it('每波五段、tests 結果與 commit sha', () => {
    view()
    const tl = screen.getByTestId('wave-timeline')
    const w1 = within(tl).getByTestId('wave-1')
    for (const label of ['開波', 'dev 完成', '送審', '裁定', '關閉']) {
      expect(within(w1).getByText(label)).toBeInTheDocument()
    }
    expect(within(w1).getByText('ok (pnpm -r test)')).toBeInTheDocument()
    expect(within(w1).getByText('b169571')).toBeInTheDocument()
    expect(within(w1).getByText('a: ok (Important 0)')).toBeInTheDocument()
    // 進行中的波標示
    expect(within(tl).getByTestId('wave-2')).toHaveTextContent('進行中')
  })
})

describe('波次時間軸：時間倒序', () => {
  it('送審早於 dev 完成時不顯示負分鐘或 +0 分', () => {
    const doc = makeDetailDoc()
    const waves = doc.task.waves.map((w) =>
      w.wave === 1 ? { ...w, dev_done_at: '2026-09-20T09:21', review_spawned_at: '2026-09-20T09:14' } : w,
    )
    render(<TaskDetailView project="p" detail={makeDetailDoc({ waves }) as never} panes={[]} />, { wrapper: MemoryRouter })
    const w1 = screen.getByTestId('wave-1')
    const review = within(w1).getByTestId('step-review')
    expect(review).not.toHaveTextContent('+')
  })
})

describe('成員表', () => {
  it('state 欄位＋herdr 即時狀態與 cost；對不到 pane 註「無 pane」', () => {
    view()
    const table = screen.getByTestId('member-table')
    const backend = within(table).getByTestId('member-backend')
    expect(backend).toHaveTextContent('寫 API 路由')
    expect(backend).toHaveTextContent('錯誤碼對齊')
    expect(within(backend).getByTestId('state-status')).toHaveTextContent('working')
    const herdr = within(backend).getByTestId('herdr-status')
    expect(herdr.querySelector('[data-slot="status-pill"]')).toHaveAttribute('data-tone', 'working')
    expect(within(backend).getByText('herdr agent focus w1-p2')).toBeInTheDocument()
    expect(within(backend).getByTestId('watch-pane').getAttribute('href')).toContain('p=w1-p2')
    expect(backend).toHaveTextContent('$1.25')
    expect(backend).toHaveTextContent('42%')
    const qa = within(table).getByTestId('member-qa')
    expect(qa).toHaveTextContent('backend 未完成')
    expect(qa).toHaveTextContent('無 pane')
    expect(within(qa).queryByText(/herdr agent focus/)).toBeNull()
    expect(within(qa).queryByTestId('watch-pane')).toBeNull()
  })
})

describe('成員表：設定與實際', () => {
  const dispatch = [
    makeDispatch({ tier: 'M', model: 'opus', effort: 'medium' }),
    makeDispatch({ tier: 'L', model: 'opus', effort: 'high', at: new Date(2026, 8, 20, 9, 40).getTime(), notes: ['handoff'] }),
    makeDispatch({ agent: 'demo-qa', member: 'qa', role: 'qa', kind: 'codex', tier: 'S', model: 'gpt-5', effort: 'low', notes: ['override-kind'] }),
  ]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viewD = (panes: any[], d: unknown[] = dispatch) =>
    render(<TaskDetailView project="demo-proj" detail={makeDetailDoc() as never} panes={panes as never} dispatch={d as never} />, {
      wrapper: MemoryRouter,
    })

  it('設定欄＝最後一次派工 kind tier · model/effort，派過多次附「共 N 次」，hover 列出每次', async () => {
    const user = userEvent.setup()
    viewD([makePane({ model: 'opus 5.5', effort: 'high' })])
    const table = screen.getByTestId('member-table')
    expect(within(table).getByRole('columnheader', { name: '設定' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: '實際' })).toBeInTheDocument()
    const cfg = screen.getByTestId('member-configured-backend')
    expect(cfg).toHaveTextContent('claude L · opus/high')
    const times = within(cfg).getByText('共 2 次')
    await user.hover(times)
    const tip = await screen.findByRole('tooltip')
    expect(tip).toHaveTextContent('09-20 08:40 claude M · opus/medium')
    expect(tip).toHaveTextContent('09-20 09:40 claude L · opus/high（handoff）')
    expect(screen.getByTestId('member-configured-qa')).toHaveTextContent('codex S · gpt-5/low')
    expect(screen.getByTestId('member-configured-qa')).not.toHaveTextContent('共')
  })

  it('實際欄＝live pane 的 model／effort，沒有 pane 顯示「—」；一致時不標記', () => {
    viewD([makePane({ model: 'opus 5.5', effort: 'high' })])
    expect(screen.getByTestId('member-actual-backend')).toHaveTextContent('opus 5.5/high')
    expect(screen.queryByTestId('member-mismatch-backend')).toBeNull()
    expect(screen.getByTestId('member-actual-qa')).toHaveTextContent('—')
  })

  it('實際與設定不一致時標記，tooltip 寫死格式', () => {
    viewD([makePane({ model: 'sonnet 5', effort: 'high' })])
    expect(screen.getByTestId('member-mismatch-backend')).toHaveAccessibleName('實際 sonnet 5/high，設定 opus/high')
  })

  it('沒有派工紀錄顯示「未知」；pane 沒回報 model／effort 顯示「未知」', () => {
    viewD([makePane({ model: null, effort: null })], [])
    expect(screen.getByTestId('member-configured-backend')).toHaveTextContent('未知')
    expect(screen.getByTestId('member-actual-backend')).toHaveTextContent('未知')
  })
})

describe('分頁', () => {
  it('驗收標準、檔案所有權、裁定（[自主] 標記）、事件原文', async () => {
    const user = userEvent.setup()
    view()
    // 預設分頁：驗收標準
    expect(screen.getByText('AC1 首頁可開')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /檔案所有權/ }))
    expect(screen.getByText('src/api/**')).toBeInTheDocument()
    expect(screen.getByText('port:4000')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /裁定/ }))
    const auto = screen.getByTestId('ruling-1')
    expect(within(auto).getByText('自主')).toBeInTheDocument()
    expect(within(screen.getByTestId('ruling-0')).queryByText('自主')).toBeNull()

    await user.click(screen.getByRole('tab', { name: /事件原文/ }))
    expect(screen.getByText('wave-close 1 tests ok (pnpm -r test) 1 agents closed')).toBeInTheDocument()
  })

  it('訊息可依 type 篩選', async () => {
    const user = userEvent.setup()
    view()
    await user.click(screen.getByRole('tab', { name: /訊息/ }))
    const list = screen.getByTestId('message-list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(4)
    await user.click(screen.getByRole('button', { name: /BUG/ }))
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(list).toHaveTextContent('登入 500')
    await user.click(screen.getByRole('button', { name: /全部/ }))
    expect(within(list).getAllByRole('listitem')).toHaveLength(4)
  })
})
