import { MemoryRouter } from 'react-router'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import {
  collectDetailAtlas,
  collectDetailBeacon,
  edgeDetail,
  teamflowDetailBklog,
} from '../../../../packages/shared/fixtures/index.ts'
import { TaskDetailView } from '@/features/task/TaskDetailView'

afterEach(cleanup)

describe('TaskDetailView × shared fixtures', () => {
  it('edge：skipped_lines 3+2 顯示「5 行無法解析」，skipped 審查與 blocked 成員照常顯示', () => {
    render(<TaskDetailView project="edge" detail={edgeDetail} panes={[]} />, { wrapper: MemoryRouter })
    expect(screen.getByText('5 行無法解析')).toBeInTheDocument()
    const tl = screen.getByTestId('wave-timeline')
    expect(within(tl).getByText(/^skipped: /)).toBeInTheDocument()
    const blocked = edgeDetail.task.members.find((m) => m.status === 'blocked')!
    expect(within(screen.getByTestId(`member-${blocked.name}`)).getByTestId('state-status')).toHaveTextContent('blocked')
  })

  for (const [name, doc] of [
    ['teamflow bklog（已結案）', teamflowDetailBklog],
    ['collect atlas（相容模式、進行中）', collectDetailAtlas],
    ['collect beacon（相容模式、已結案）', collectDetailBeacon],
  ] as const) {
    it(`${name}：頁首、每波一列、每成員一列`, () => {
      render(<TaskDetailView project="p" detail={doc} panes={[]} />, { wrapper: MemoryRouter })
      expect(screen.getByRole('heading', { name: doc.task.display ?? doc.task.dir })).toBeInTheDocument()
      for (const w of doc.task.waves) expect(screen.getByTestId(`wave-${w.wave}`)).toBeInTheDocument()
      for (const m of doc.task.members) expect(screen.getByTestId(`member-${m.name}`)).toBeInTheDocument()
      if (doc.task.close_result) expect(screen.getByText(doc.task.close_result)).toBeInTheDocument()
    })
  }
})
