import { cn } from '@/lib/utils'

export interface EventBadgeProps {
  /** 目前只有 ESCALATE（沒有對應 DECISION 前常駐） */
  kind: 'escalate'
  /** default：頭頂／標記左上；sm：找人清單列內 */
  size?: 'default' | 'sm'
  className?: string
}

const LABEL = { escalate: 'ESCALATE 等待決策' } as const

/** 事件常駐徽章（§6.15）：status-warn 實心圓＋「!」，2px popover 框、shadow-pop；進場 badge-pop */
export function EventBadge({ kind, size = 'default', className }: EventBadgeProps) {
  return (
    <span
      data-slot="event-badge"
      data-kind={kind}
      data-size={size}
      role="img"
      aria-label={LABEL[kind]}
      className={cn(
        'inline-grid shrink-0 place-items-center rounded-full border-2 border-popover bg-status-warn font-bold text-on-color shadow-pop animate-badge-pop motion-reduce:animate-none',
        size === 'sm' ? 'size-4 text-2xs leading-none' : 'size-5 text-xs leading-none',
        className,
      )}
    >
      <span aria-hidden="true">!</span>
    </span>
  )
}
