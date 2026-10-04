import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface PaneHeaderProps extends Omit<ComponentProps<'div'>, 'title'> {
  title: ReactNode
  /** 次要資訊（body-medium muted） */
  info?: ReactNode
  /** 右側 action：Button sm／SegmentedControl sm */
  actions?: ReactNode
  /** terminal＝終端窗格內的標題列（terminal-chrome 底、micro 字，不跟主題） */
  variant?: 'default' | 'terminal'
}

/** 工具頁窗格頂列（§6.13），放在 <Card variant="pane"> 第一個子元素 */
export function PaneHeader({ title, info, actions, variant = 'default', className, ...props }: PaneHeaderProps) {
  const term = variant === 'terminal'
  return (
    <div
      data-slot="pane-header"
      data-variant={variant}
      className={cn(
        'flex shrink-0 items-center border-b',
        term ? 'h-6 gap-2 border-terminal-line bg-terminal-chrome px-2 text-2xs font-semibold text-terminal-fg' : 'h-10 gap-2 px-4',
        className,
      )}
      {...props}
    >
      <span className={cn('min-w-0 shrink truncate', !term && 'text-sm font-bold')}>{title}</span>
      {info != null && <span className={cn('min-w-0 truncate', term ? 'text-terminal-dim' : 'text-sm font-medium text-muted-foreground')}>{info}</span>}
      {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

/** 窗格內容區：min-h-0 flex-1 overflow-auto（自捲） */
export function PaneBody({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="pane-body" className={cn('min-h-0 flex-1 overflow-auto', className)} {...props} />
}
