import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IconBlock } from './IconBlock'

export interface PageHeaderProps {
  /** default＝內容頁（IconBlock＋兩行字）；compact＝工具頁（單列、高 bar） */
  size?: 'default' | 'compact'
  /** 只在 default 顯示 */
  icon?: LucideIcon
  title: ReactNode
  subtitle?: ReactNode
  /** 標題右邊的 StatusPill（任務頁） */
  meta?: ReactNode
  /** 右側工具列：SegmentedControl／Field／Button（compact 用 sm） */
  actions?: ReactNode
  className?: string
}

/** 每頁頁首（§6.14） */
export function PageHeader({ size = 'default', icon, title, subtitle, meta, actions, className }: PageHeaderProps) {
  if (size === 'compact') {
    return (
      <header data-slot="page-header" data-size="compact" className={cn('flex h-10 min-w-0 shrink-0 items-center gap-3', className)}>
        <div className="flex min-w-0 flex-1 items-baseline gap-3">
          <h1 className="shrink-0 text-lg font-extrabold">{title}</h1>
          {subtitle != null && (
            <p className="min-w-0 truncate text-sm text-muted-foreground max-sm:hidden" title={typeof subtitle === 'string' ? subtitle : undefined}>
              · {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div data-slot="page-header-actions" className="flex shrink-0 items-center gap-2">
            {actions}
          </div>
        )}
      </header>
    )
  }
  return (
    <header data-slot="page-header" data-size="default" className={cn('flex flex-wrap items-center gap-x-4 gap-y-3', className)}>
      <div className="flex min-w-0 flex-1 basis-64 items-center gap-4">
        {icon && <IconBlock icon={icon} />}
        <div className="flex min-w-0 flex-col">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="min-w-0 truncate text-2xl font-extrabold tracking-tight">{title}</h1>
            {meta}
          </div>
          {subtitle != null && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {actions && (
        <div
          data-slot="page-header-actions"
          className="flex flex-wrap items-center gap-2 max-sm:basis-full max-sm:flex-nowrap max-sm:overflow-x-auto"
        >
          {actions}
        </div>
      )}
    </header>
  )
}
