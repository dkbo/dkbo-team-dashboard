// 膠囊改透明底後，落在終端黑底標頭（縮圖、herdr 鏡像）裡的要用深色 token，淺色主題下才讀得到
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { PaneThumbs } from '@/features/overview/PaneThumbs'
import { parseAnsi } from '@/lib/ansi'
import { pane } from '../shell/builders'

describe('終端標頭裡的 StatusPill', () => {
  it('縮圖標頭在 .dark 範圍內', () => {
    render(
      <MemoryRouter>
        <PaneThumbs panes={[pane({ paneId: 'P1', status: 'idle' })]} screens={{ P1: { lines: parseAnsi('x\r\n'), at: 1, error: null } }} />
      </MemoryRouter>,
    )
    const pill = within(screen.getByTestId('thumb-P1')).getByText('閒置').closest('[data-slot="status-pill"]')!
    expect(pill.closest('.dark')).not.toBeNull()
    expect(screen.getByTestId('thumb-P1').querySelector('pre')!.closest('.dark')).toBeNull()
  })
})
