import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { IdleProjectsCard } from '@/features/overview/IdleProjectsCard'
import { PaneHover } from '@/features/overview/PaneHover'
import { pane, project } from '../shell/builders'

describe('n3 PaneHover watch-pane focus-ring', () => {
  it('watch-pane 連結帶規格 focus-ring class', async () => {
    render(
      <MemoryRouter>
        <PaneHover title="backend" pane={pane({ paneId: 'w1-p2' })} paneId="w1-p2">
          膠囊
        </PaneHover>
      </MemoryRouter>,
    )
    fireEvent.focus(screen.getByRole('button', { name: '膠囊' }))
    const link = await screen.findByTestId('watch-pane')
    expect(link.className).toContain('outline-none')
    expect(link.className).toContain('focus-visible:ring-3')
    expect(link.className).toContain('focus-visible:ring-ring/50')
  })
})

describe('n4 IdleProjectRow aria-controls 與可及名稱', () => {
  function renderRow() {
    const p = project({
      name: 'my project',
      panes: [pane({ paneId: 'p1', name: 'dash-backend', status: 'working' }), pane({ paneId: 'p2', name: 'dash-qa', status: 'idle' })],
    })
    render(
      <MemoryRouter>
        <IdleProjectsCard projects={[p]} />
      </MemoryRouter>,
    )
    return screen.getByTestId('idle-project-row')
  }

  it('aria-controls 收合時也常駐，展開後指到存在的展開區，id 不含空白', () => {
    const row = renderRow()
    const id = row.getAttribute('aria-controls')
    expect(id).toBeTruthy()
    expect(document.getElementById(id!)).toBeNull()
    fireEvent.click(row)
    expect(row.getAttribute('aria-controls')).toBe(id)
    expect(id).not.toMatch(/\s/)
    expect(document.getElementById(id!)).not.toBeNull()
  })

  it('整列按鈕的可及名稱不串 pane 狀態', () => {
    const row = renderRow()
    expect(screen.getByRole('button', { name: /my project/ })).toBe(row)
    expect(screen.queryByRole('button', { name: /dash-backend|dash-qa|工作中|閒置/ })).toBeNull()
  })
})
