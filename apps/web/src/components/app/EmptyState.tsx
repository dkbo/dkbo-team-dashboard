import type { ComponentProps, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface EmptyStateProps extends Omit<ComponentProps<'div'>, 'title'> {
  size?: 'page' | 'inline'
  /** emoji 字串或 lucide 圖示 */
  icon?: string | LucideIcon
  title: ReactNode
  hint?: ReactNode
  /** page：Button outline sm；inline 不放（或文字連結） */
  action?: ReactNode
}

/** 空狀態（§6.18）：說「為什麼空」＋「什麼時候會有」 */
export function EmptyState({ size = 'inline', icon, title, hint, action, className, ...props }: EmptyStateProps) {
  const page = size === 'page'
  const Icon = typeof icon === 'string' ? null : icon
  return (
    <div
      data-slot="empty-state"
      data-size={size}
      className={cn('flex flex-col items-center text-center', page ? 'gap-3 py-12' : 'gap-2 py-6', className)}
      {...props}
    >
      {icon && (
        <span
          data-slot="empty-icon"
          aria-hidden
          className={cn('grid shrink-0 place-items-center rounded-full', page ? 'size-16 bg-accent' : 'size-10 bg-muted')}
        >
          {typeof icon === 'string' ? (
            <span className={page ? 'text-3xl' : 'text-xl'}>{icon}</span>
          ) : (
            Icon && <Icon className={page ? 'size-7 text-accent-foreground' : 'size-5 text-muted-foreground'} />
          )}
        </span>
      )}
      <p className={page ? 'text-base font-bold' : 'text-sm font-semibold'}>{title}</p>
      {hint != null && <p className={cn('text-muted-foreground', page ? 'max-w-sm text-sm' : 'max-w-sm text-xs font-medium')}>{hint}</p>}
      {action}
    </div>
  )
}
