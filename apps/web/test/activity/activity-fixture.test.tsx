// 以 backend 定稿的 shared fixture 經真正的 activityFeed 產生資料，確認活動欄照 feed 原樣渲染。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { activityFeed, tsToEpochMs } from '@dash/shared'
import { activityNowTs, activityTasks } from '../../../../packages/shared/fixtures/index.ts'
import { ActivityRail } from '@/features/activity/ActivityRail'
import { resetDashStore } from '@/store/store'

const NOW = tsToEpochMs(activityNowTs)!
const items = activityFeed(activityTasks, { now: NOW, limit: 50 })

beforeEach(() => {
  resetDashStore()
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ generatedAt: NOW, items })))
})
afterEach(() => vi.unstubAllGlobals())

describe('ActivityRail × shared fixture', () => {
  it('依 feed 順序逐筆渲染，type／專案／任務屬性與 feed 一致；event 是 compact、不重複頭像', async () => {
    render(
      <MemoryRouter>
        <ActivityRail now={NOW} />
      </MemoryRouter>,
    )
    await screen.findAllByTestId('activity-item')
    expect(items.length).toBeGreaterThan(5)
    // 組內 > 4 則先收合；全部展開後應與 feed 逐筆一致
    for (const more of screen.queryAllByRole('button', { name: /^再看 \d+ 則$/ })) await userEvent.click(more)
    const rows = screen.getAllByTestId('activity-item')
    expect(rows).toHaveLength(items.length)
    rows.forEach((row, i) => {
      expect(row).toHaveAttribute('data-type', items[i].type)
      expect(row).toHaveAttribute('data-project', items[i].project)
      expect(row).toHaveAttribute('data-task', items[i].taskDir)
    })
    expect(rows.map((r) => r.getAttribute('data-type'))).not.toContain('ACK')
    const ev = rows[items.findIndex((x) => x.source === 'event')]
    expect(ev).toHaveAttribute('data-variant', 'compact')
    expect(within(ev).queryByTestId('activity-avatar')).toBeNull()
  })
})
