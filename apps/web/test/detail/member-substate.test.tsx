import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { TaskDetailView } from '@/features/task/TaskDetailView'
import { sessionLive } from '../shell/builders'
import { makeDetailDoc, makePane } from './fixtures'

// AC12：任務詳情成員表的細狀態欄（office 規格 §6.12）。細狀態只讀 PaneLive.session，顯示一律經 effectiveSubstate。

const NOW = 1_800_000_000_000
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const sec = (n: number) => NOW - n * 1000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const view = (panes: any[], over: Record<string, unknown> = {}) =>
  render(<TaskDetailView project="demo-proj" detail={makeDetailDoc(over) as never} panes={panes as never} />, { wrapper: MemoryRouter })

const row = (name: string) => within(screen.getByTestId('member-table')).getByTestId(`member-${name}`)

describe('成員表：細狀態欄（§6.12）', () => {
  it('有 session：member-substate 帶 data-substate、膠囊文字與計時，第二行是工具參數', () => {
    view([
      makePane({
        session: sessionLive({
          substate: 'running',
          substateSince: sec(68),
          turnStartedAt: sec(68),
          lastEventAt: sec(1),
          tool: { name: 'Bash', summary: 'pnpm -C apps/web test' },
        }),
      }),
    ])
    const cell = within(row('backend')).getByTestId('member-substate')
    expect(cell).toHaveAttribute('data-substate', 'running')
    expect(cell).toHaveTextContent('執行 Bash')
    expect(cell).toHaveTextContent('本輪 01:08')
    expect(cell).toHaveTextContent('pnpm -C apps/web test')
  })

  it('顯示經 effectiveSubstate：done 超過 10 分鐘沒新事件顯示閒置', () => {
    view([makePane({ session: sessionLive({ substate: 'done', substateSince: sec(11 * 60), lastEventAt: sec(11 * 60) }) })])
    const cell = within(row('backend')).getByTestId('member-substate')
    expect(cell).toHaveAttribute('data-substate', 'idle')
    expect(cell).toHaveTextContent('閒置')
  })

  it('沒有 pane：虛線框「無 session」，不帶 data-substate', () => {
    view([makePane()])
    const qa = within(row('qa')).getByTestId('member-substate')
    expect(qa).toHaveTextContent('無 session')
    expect(qa).not.toHaveAttribute('data-substate')
    expect(qa.querySelector('[data-slot="status-pill"]')).toHaveClass('border-dashed')
  })

  it('有 pane 但沒有 session（DASH_SESSIONS=off 或對不到）：退回 herdr 粗狀態膠囊，不帶 data-substate，不編細狀態', () => {
    view([makePane({ status: 'blocked' })])
    const cell = within(row('backend')).getByTestId('member-substate')
    expect(cell).not.toHaveAttribute('data-substate')
    expect(cell.querySelector('[data-slot="status-pill"]')).toHaveAttribute('data-tone', 'blocked')
    expect(cell).not.toHaveTextContent('無 session')
  })

  it('等你／錯誤整列淡紅底，「目前」欄用 danger 字色；其他列不變', () => {
    view([
      makePane({ session: sessionLive({ substate: 'waiting', substateSince: sec(192), question: '要不要改 dev script？' }) }),
      makePane({
        paneId: 'w1-p3',
        name: 'demo-qa',
        member: 'qa',
        session: sessionLive({ sessionId: 's2', substate: 'thinking', substateSince: sec(5), turnStartedAt: sec(5) }),
      }),
    ])
    const backend = row('backend')
    expect(backend.className).toContain('bg-status-danger-soft')
    expect(within(backend).getByText('寫 API 路由').className).toContain('text-status-danger-fg')
    expect(within(backend).getByTestId('member-substate')).toHaveTextContent('已等 03:12')
    // qa 的 dkbo state 是 blocked，沿用既有的淡紅底；細狀態是思考中不影響 data-substate
    expect(within(row('qa')).getByTestId('member-substate')).toHaveAttribute('data-substate', 'thinking')
  })

  it('error 也算「需要你」；卡片標題 Tag danger「N 個等你」，0 不顯示', () => {
    view([
      makePane({ session: sessionLive({ substate: 'error', substateSince: sec(60), error: 'usage_limit_exceeded' }) }),
      makePane({ paneId: 'w1-p3', name: 'demo-qa', member: 'qa', session: sessionLive({ sessionId: 's2', substate: 'waiting', substateSince: sec(30) }) }),
    ])
    const tag = within(screen.getByTestId('member-table')).getByTestId('member-needs-tag')
    expect(tag).toHaveTextContent('2 個等你')
    expect(tag).toHaveAttribute('data-variant', 'danger')
    cleanup()
    view([makePane({ session: sessionLive({ substate: 'running', substateSince: sec(5) }) })])
    expect(screen.queryByTestId('member-needs-tag')).toBeNull()
  })

  it('state 欄（dkbo 流程狀態）保留，細狀態欄取代原「herdr」欄標題', () => {
    view([makePane({ session: sessionLive({ substate: 'thinking', substateSince: sec(5) }) })])
    const table = screen.getByTestId('member-table')
    expect(within(table).getByRole('columnheader', { name: 'state' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: '細狀態' })).toBeInTheDocument()
    expect(within(table).queryByRole('columnheader', { name: 'herdr' })).toBeNull()
    expect(within(row('backend')).getByTestId('state-status')).toHaveTextContent('working')
  })

  it('「在辦公室看」連到 /office?focus=<paneId>；沒有 session 時 disabled', () => {
    view([makePane({ session: sessionLive({ substate: 'writing', substateSince: sec(5), turnStartedAt: sec(5) }) })])
    const link = within(row('backend')).getByTestId('member-office-link')
    expect(link).toHaveAttribute('href', '/office?focus=w1-p2')
    expect(link).toHaveAccessibleName('在辦公室看')
    const qa = within(row('qa')).getByTestId('member-office-link')
    expect(qa).toBeDisabled()
    expect(qa).not.toHaveAttribute('href')
  })

  it('PageHeader 工具列最前面有「在辦公室看」→ /office?project=<專案>', () => {
    view([makePane()])
    const header = screen.getByTestId('task-header')
    const link = within(header).getByRole('link', { name: '在辦公室看' })
    expect(link).toHaveAttribute('href', '/office?project=demo-proj')
    const links = within(header).getAllByRole('link')
    expect(links[0]).toBe(link)
  })
})
