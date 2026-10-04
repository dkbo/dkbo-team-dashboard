import type { ComponentProps, ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '@/lib/utils'
import { StatusDot, type Tone } from './StatusDot'

/** 工具頁左欄清單容器（§6.20）：放在 Card pane 內、自捲 */
export function SidebarList({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="sidebar-list" className={cn('flex min-h-0 flex-col overflow-auto p-2', className)} {...props} />
}

export interface SidebarSectionProps extends Omit<ComponentProps<'section'>, 'title'> {
  title: ReactNode
  /** 段標題右側，通常是 <Tag>N</Tag> */
  count?: ReactNode
}

/** 一段（段之間頂線 border-w-hair，上下 space-2） */
export function SidebarSection({ title, count, className, children, ...props }: SidebarSectionProps) {
  return (
    <section data-slot="sidebar-section" className={cn('flex flex-col not-first:mt-2 not-first:border-t not-first:pt-2', className)} {...props}>
      <h2 data-slot="sidebar-section-title" className="flex items-center justify-between gap-2 px-3 pt-3 pb-1 text-xs font-bold text-muted-foreground">
        <span className="truncate">{title}</span>
        {count}
      </h2>
      <div data-slot="sidebar-section-items" className="flex flex-col gap-0.5">
        {children}
      </div>
    </section>
  )
}

interface SidebarItemOwnProps {
  title: ReactNode
  /** 第二行（可內嵌 Tag／mono 分支） */
  subtitle?: ReactNode
  /** 錯誤項：第二行換成 status-danger-fg 錯誤文字，仍可選 */
  error?: ReactNode
  /** 前置編號（slot-index） */
  index?: number
  /** 前置狀態點 */
  dot?: Tone
  pulse?: boolean
  dotLabel?: string
  /** 尾端：Tag、Eye 圖示、計數 */
  trailing?: ReactNode
  selected?: boolean
  /** 有就渲染成 Link，否則 button */
  href?: string
}

export type SidebarItemProps = SidebarItemOwnProps &
  Omit<ComponentProps<'button'>, 'title'> & { 'data-testid'?: string }

const ITEM =
  'flex min-h-10 w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset motion-reduce:transition-none'

/** 清單項（§6.20）：hover-fill、選中 selected-soft、focus-ring-inset */
export function SidebarItem({
  title,
  subtitle,
  error,
  index,
  dot,
  pulse,
  dotLabel,
  trailing,
  selected = false,
  href,
  className,
  ...props
}: SidebarItemProps) {
  const cls = cn(ITEM, selected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted', className)
  const second = error ?? subtitle
  const inner = (
    <>
      {index != null && <span className="w-4 shrink-0 text-right text-xs font-medium tabular-nums text-muted-foreground">{index}</span>}
      {dot && <StatusDot tone={dot} pulse={pulse} label={dotLabel} />}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold">{title}</span>
        {second != null && (
          <span
            className={cn(
              'flex min-w-0 items-center gap-1.5 truncate text-xs font-medium',
              error != null ? 'text-status-danger-fg' : selected ? 'text-accent-foreground/80' : 'text-muted-foreground',
            )}
          >
            {second}
          </span>
        )}
      </span>
      {trailing != null && <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground [&>svg]:size-3.5">{trailing}</span>}
    </>
  )
  if (href != null) {
    const { onClick, ...rest } = props
    return (
      <Link
        to={href}
        data-slot="sidebar-item"
        data-selected={selected || undefined}
        aria-current={selected ? 'true' : undefined}
        className={cls}
        onClick={onClick as ComponentProps<typeof Link>['onClick']}
        {...(rest as Omit<ComponentProps<typeof Link>, 'to'>)}
      >
        {inner}
      </Link>
    )
  }
  return (
    <button type="button" data-slot="sidebar-item" data-selected={selected || undefined} aria-current={selected ? 'true' : undefined} className={cls} {...props}>
      {inner}
    </button>
  )
}
