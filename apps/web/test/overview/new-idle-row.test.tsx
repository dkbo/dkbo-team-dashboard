import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { IdleProjectsCard } from '@/features/overview/IdleProjectsCard'
import { project } from '../shell/builders'

function rows(projects: Parameters<typeof IdleProjectsCard>[0]['projects']) {
  render(
    <MemoryRouter>
      <IdleProjectsCard projects={projects} />
    </MemoryRouter>,
  )
  return screen.getAllByTestId('idle-project-row')
}

describe('IdleProjectRow 相容模式', () => {
  it('mode === compat 的列帶 neutral Tag「相容模式」', () => {
    const [row] = rows([project({ name: 'legacy', mode: 'compat' })])
    const tag = within(row).getByText('相容模式')
    expect(tag.dataset.variant).toBe('neutral')
  })

  it('非 compat 的列沒有「相容模式」', () => {
    const [row] = rows([project({ name: 'teamflow' })])
    expect(within(row).queryByText('相容模式')).toBeNull()
  })
})
