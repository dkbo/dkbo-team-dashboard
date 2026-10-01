import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StatusPill } from '@/components/app/StatusPill'
import { CopyCommand } from '@/components/app/CopyCommand'

afterEach(() => vi.restoreAllMocks())

describe('StatusPill', () => {
  it.each([
    ['working', '工作中', 'working'],
    ['idle', '閒置', 'idle'],
    ['blocked', '卡住', 'blocked'],
    ['done', '完成', 'done'],
    ['unknown', '不明', 'unknown'],
  ])('%s → %s', (status, text, tone) => {
    render(<StatusPill status={status} />)
    const el = screen.getByText(text).closest('[data-slot="status-pill"]')!
    expect(el).toHaveAttribute('data-tone', tone)
  })

  it('null 與不認得的狀態顯示原文或「不明」且為灰色；label、note 覆寫顯示', () => {
    render(<StatusPill status={null} />)
    expect(screen.getByText('不明').closest('[data-slot="status-pill"]')).toHaveAttribute('data-tone', 'unknown')
    render(<StatusPill status="reviewing" />)
    expect(screen.getByText('reviewing').closest('[data-slot="status-pill"]')).toHaveAttribute('data-tone', 'unknown')
    render(<StatusPill status="working" label="backend" note="無 pane" />)
    expect(screen.getByText('backend')).toBeInTheDocument()
    expect(screen.getByText('無 pane')).toBeInTheDocument()
  })
})

describe('CopyCommand', () => {
  it('顯示指令並把它寫進剪貼簿', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    render(<CopyCommand command="herdr agent focus p1" />)
    expect(screen.getByText('herdr agent focus p1')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '複製指令' }))
    expect(writeText).toHaveBeenCalledWith('herdr agent focus p1')
    await waitFor(() => expect(screen.getByText('已複製')).toBeInTheDocument())
  })
})
