import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/lib/utils'

export type SummaryVariant = 'ok' | 'warn' | 'danger' | 'brand' | 'quiet'

const GRAD: Record<Exclude<SummaryVariant, 'quiet'>, string> = {
  ok: 'from-(--grad-ok-from) to-(--grad-ok-to)',
  warn: 'from-(--grad-warn-from) to-(--grad-warn-to)',
  danger: 'from-(--grad-danger-from) to-(--grad-danger-to)',
  brand: 'from-(--grad-brand-from) to-(--grad-brand-to)',
}

export interface SummaryTileProps {
  variant: SummaryVariant
  /** Rocket／Coins／Siren／Gauge */
  icon: LucideIcon
  label: ReactNode
  value: ReactNode
  /** 副行：只 1 行、放不下 truncate；quiet 的好消息自己包 text-status-ok-fg */
  children?: ReactNode
  /** 有就整張是 Link */
  href?: string
  className?: string
  'data-testid'?: string
}

/** 總覽摘要數字卡（§6.9）：漸層＝要看一眼的事；quiet＝沒事 */
export function SummaryTile({ variant, icon: Icon, label, value, children, href, className, ...props }: SummaryTileProps) {
  const quiet = variant === 'quiet'
  const cls = cn(
    'relative flex min-h-28 flex-col gap-1 overflow-hidden rounded-xl p-4 sm:min-h-32 sm:p-5',
    quiet ? 'bg-card text-card-foreground shadow-soft' : cn('bg-linear-to-br text-on-color shadow-pop', GRAD[variant]),
    href &&
      cn(
        'cursor-pointer outline-none transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-pop focus-visible:ring-3 motion-reduce:transition-none motion-reduce:hover:translate-y-0',
        quiet ? 'hover:bg-muted/40 focus-visible:ring-ring/50' : 'focus-visible:ring-on-color/70',
      ),
    className,
  )
  const body = (
    <>
      <Icon
        aria-hidden
        className={cn('pointer-events-none absolute -right-5 -bottom-6 size-18 -rotate-12 sm:size-28', quiet ? 'text-status-idle opacity-15' : 'text-on-color opacity-12')}
      />
      <span className={cn('relative text-sm font-bold', quiet && 'text-muted-foreground')}>{label}</span>
      <span className={cn('relative text-2xl font-extrabold tabular-nums sm:text-3xl', quiet && 'text-muted-foreground')}>{value}</span>
      {children != null && <span className="relative mt-auto truncate text-sm font-medium">{children}</span>}
    </>
  )
  return href ? (
    <Link to={href} data-slot="summary-tile" data-variant={variant} className={cls} {...props}>
      {body}
    </Link>
  ) : (
    <div data-slot="summary-tile" data-variant={variant} className={cls} {...props}>
      {body}
    </div>
  )
}
