import { createContext, useContext, type ComponentProps, type ReactNode } from 'react'
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type BannerTone = 'danger' | 'warn' | 'info' | 'ok'

const ICON = { danger: CircleAlert, warn: TriangleAlert, info: Info, ok: CircleCheck }
const BG: Record<BannerTone, string> = {
  danger: 'bg-status-danger-soft',
  warn: 'bg-status-warn-soft',
  info: 'bg-status-info-soft',
  ok: 'bg-status-ok-soft',
}
const FG: Record<BannerTone, string> = {
  danger: 'text-status-danger-fg',
  warn: 'text-status-warn-fg',
  info: 'text-status-info-fg',
  ok: 'text-status-ok-fg',
}
const ACTION_BORDER: Record<BannerTone, string> = {
  danger: 'border-status-danger/60',
  warn: 'border-status-warn/60',
  info: 'border-status-info/60',
  ok: 'border-status-ok/60',
}

const BannerCtx = createContext<{ tone: BannerTone; size: 'default' | 'sm' }>({ tone: 'info', size: 'default' })

export interface BannerProps {
  tone: BannerTone
  size?: 'default' | 'sm'
  title: ReactNode
  /** 細節（sm 不顯示）；錯誤原文用 `<code className="font-mono text-xs break-all">` */
  children?: ReactNode
  /** 通常是 <BannerAction>重試</BannerAction> */
  action?: ReactNode
  onDismiss?: () => void
  className?: string
  'data-testid'?: string
}

/** 錯誤／警示／資訊條（§6.17），取代各頁自寫錯誤條 */
export function Banner({ tone, size = 'default', title, children, action, onDismiss, className, ...props }: BannerProps) {
  const Icon = ICON[tone]
  const sm = size === 'sm'
  return (
    <BannerCtx.Provider value={{ tone, size }}>
      <div
        role={tone === 'danger' || tone === 'warn' ? 'alert' : 'status'}
        data-slot="banner"
        data-tone={tone}
        data-size={size}
        className={cn('flex', sm ? 'items-center gap-2 rounded-lg px-3 py-2' : 'items-start gap-3 rounded-xl p-3', BG[tone], className)}
        {...props}
      >
        <Icon aria-hidden className={cn('shrink-0', sm ? 'size-4' : 'size-5', FG[tone])} />
        <div className={cn('flex min-w-0 flex-1 flex-col gap-0.5', !sm && 'self-center')}>
          <p className={cn('text-sm font-bold', FG[tone], sm && 'truncate')}>{title}</p>
          {!sm && children != null && <div className="text-sm break-words text-foreground/80">{children}</div>}
        </div>
        {action && <div className="flex shrink-0 items-center">{action}</div>}
        {onDismiss && (
          <Button type="button" variant="ghost" size="icon-sm" aria-label="關閉" onClick={onDismiss} className="shrink-0">
            <X />
          </Button>
        )}
      </div>
    </BannerCtx.Provider>
  )
}

/** Banner 的 action：Button outline，框 status-X/60；default 用 sm、Banner sm 用 xs */
export function BannerAction({ className, ...props }: Omit<ComponentProps<typeof Button>, 'variant' | 'size'>) {
  const { tone, size } = useContext(BannerCtx)
  return <Button type="button" variant="outline" size={size === 'sm' ? 'xs' : 'sm'} className={cn(ACTION_BORDER[tone], className)} {...props} />
}
