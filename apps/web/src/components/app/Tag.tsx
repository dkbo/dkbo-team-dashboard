import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type TagVariant = 'neutral' | 'brand' | 'info' | 'ok' | 'warn' | 'danger'

const VARIANT: Record<TagVariant, string> = {
  neutral: 'bg-muted text-muted-foreground',
  brand: 'bg-accent text-accent-foreground',
  info: 'bg-status-info-soft text-status-info-fg',
  ok: 'bg-status-ok-soft text-status-ok-fg',
  warn: 'bg-status-warn-soft text-status-warn-fg',
  danger: 'bg-status-danger-soft text-status-danger-fg',
}

export interface TagProps extends ComponentProps<'span'> {
  variant?: TagVariant
  /** hash、kind：mono-2xs */
  mono?: boolean
  /** 計數：0 時整個 Tag 不渲染；有 children 時顯示成「children count」 */
  count?: number
  children?: ReactNode
}

/** 講「分類或計數」的標籤：有底無框（§6.4） */
export function Tag({ variant = 'neutral', mono = false, count, className, children, ...props }: TagProps) {
  if (count === 0) return null
  return (
    <span
      data-slot="tag"
      data-variant={variant}
      className={cn(
        'inline-flex h-5 w-fit max-w-full shrink-0 items-center gap-1 rounded-full px-2 text-2xs whitespace-nowrap [&>svg]:size-3 [&>svg]:shrink-0',
        mono ? 'font-mono font-normal' : 'font-semibold',
        VARIANT[variant],
        className,
      )}
      {...props}
    >
      {children}
      {count != null && (children != null ? ` ${count}` : count)}
    </span>
  )
}

/** 活動 type → Tag variant（§6.4；Q13 ESCALATE 一律 warn） */
export function activityTagVariant(type: string): TagVariant {
  if (['DONE', 'FIXED', 'dev-done', 'wave-close', 'gate3', 'task-close'].includes(type)) return 'ok'
  if (['ESCALATE', 'LIMIT', 'TIMEOUT', 'timeout'].includes(type)) return 'warn'
  if (['BUG', 'BLOCKED', 'STOP'].includes(type)) return 'danger'
  return 'info'
}
