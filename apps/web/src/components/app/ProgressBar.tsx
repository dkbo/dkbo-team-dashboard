import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface ProgressBarProps extends Omit<ComponentProps<'div'>, 'children'> {
  value: number
  max: number
  /** 右側標籤，如「1/3 波」 */
  label?: ReactNode
  'aria-label'?: string
}

/** 任務進度（§6.8）：軌 card（放在 muted 列上）、填 primary */
export function ProgressBar({ value, max, label, className, 'aria-label': ariaLabel, ...props }: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div data-slot="progress" className={cn('flex items-center gap-2.5', className)} {...props}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={ariaLabel ?? (typeof label === 'string' ? label : undefined)}
        className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-card"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      {label != null && <span className="shrink-0 text-xs font-semibold tabular-nums">{label}</span>}
    </div>
  )
}
