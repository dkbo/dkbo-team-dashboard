import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

/** 狀態語意（規格 §1.4）：danger 要人立刻處理、warn 降級／熔斷／ESCALATE、ok 運作中、idle 閒置／已結束、info 中性事件 */
export type Tone = 'danger' | 'warn' | 'ok' | 'idle' | 'info'

const DOT_BG: Record<Tone, string> = {
  danger: 'bg-status-danger',
  warn: 'bg-status-warn',
  ok: 'bg-status-ok',
  idle: 'bg-status-idle',
  info: 'bg-status-info',
}

export interface StatusDotProps extends Omit<ComponentProps<'span'>, 'children'> {
  tone: Tone
  /** default＝dot（8px，清單、ConnectionChip）；sm＝dot-sm（6px，StatusPill 內、ActivityItem compact） */
  size?: 'default' | 'sm'
  /** working／blocked 脈動（reduced motion 時關掉） */
  pulse?: boolean
  /** 有就當 aria-label；沒有就 aria-hidden（旁邊一定要有文字） */
  label?: string
}

/** 純狀態點（§6.5） */
export function StatusDot({ tone, size = 'default', pulse = false, label, className, ...props }: StatusDotProps) {
  return (
    <span
      data-slot="status-dot"
      data-tone={tone}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        'inline-block shrink-0 rounded-full',
        size === 'sm' ? 'size-1.5' : 'size-2',
        DOT_BG[tone],
        pulse && 'animate-pulse motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  )
}
