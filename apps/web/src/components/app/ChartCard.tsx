import type { ComponentProps, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { EmptyState } from './EmptyState'

/** 資料超過這麼多列時預設只畫最近這幾列（Q8） */
export const CHART_ROW_LIMIT = 15
/** 水平長條圖（recharts px）：每列 chart-bar-row、上下 chart-bar-pad、最矮 chart-h-sm */
export const CHART_BAR_ROW = 28
export const CHART_BAR_PAD = 64
export const CHART_H_SM = 176

export function chartBarHeight(rows: number): number {
  return Math.max(CHART_H_SM, rows * CHART_BAR_ROW + CHART_BAR_PAD)
}

const HEIGHT = { sm: 'h-(--chart-h-sm)', md: 'h-(--chart-h-md)', lg: 'h-(--chart-h-lg)', auto: '' } as const

export interface ChartLegendItem {
  key: string
  label: ReactNode
  /** 系列色（chart 色盤；CSS 色值或 var(--chart-N)） */
  color: string
}

export interface ChartCardProps extends Omit<ComponentProps<'div'>, 'title'> {
  title: ReactNode
  description?: ReactNode
  /** CardTitle 前置圖示（brand-violet） */
  icon?: LucideIcon
  /** 右上 action 槽：圖例切換或 <ChartShowAll> */
  action?: ReactNode
  /** header 下一行的摘要（各項間距 card-gap） */
  summary?: ReactNode
  /** 圖區高；auto 由 children 自己決定（水平長條圖用 chartBarHeight） */
  height?: keyof typeof HEIGHT
  legend?: ChartLegendItem[]
  loading?: boolean
  /** 有就顯示空狀態：不畫圖，整卡收成 min-h-36、EmptyState inline 置中 */
  empty?: { icon?: string | LucideIcon; title: ReactNode; hint?: ReactNode } | null | false
}

/** 圖表卡（§6.11） */
export function ChartCard({
  title,
  description,
  icon: Icon,
  action,
  summary,
  height = 'md',
  legend,
  loading = false,
  empty,
  className,
  children,
  ...props
}: ChartCardProps) {
  const state = loading ? 'loading' : empty ? 'empty' : 'ready'
  return (
    <Card data-chart-card="" data-state={state} className={cn(state === 'empty' && 'min-h-36', className)} {...props}>
      <CardHeader>
        <CardTitle>
          {Icon && <Icon aria-hidden />}
          {title}
        </CardTitle>
        {description != null && <CardDescription>{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      {state === 'empty' && empty ? (
        <CardContent data-testid="chart-empty" className="flex flex-1 flex-col justify-center">
          <EmptyState size="inline" icon={empty.icon} title={empty.title} hint={empty.hint} className="py-0" />
        </CardContent>
      ) : (
        <CardContent className="flex flex-col gap-4">
          {summary != null && <div className="flex flex-wrap items-baseline gap-4 text-sm">{summary}</div>}
          {loading ? <Skeleton className="h-(--chart-h-md) w-full" /> : <div className={cn('w-full min-w-0', HEIGHT[height])}>{children}</div>}
          {legend && legend.length > 0 && !loading && (
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-medium text-muted-foreground">
              {legend.map((l) => (
                <li key={l.key} className="inline-flex items-center gap-1.5">
                  <span data-slot="chart-swatch" aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: l.color }} />
                  {l.label}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      )}
    </Card>
  )
}

export interface ChartShowAllProps extends Omit<ComponentProps<typeof Button>, 'onClick' | 'children'> {
  total: number
  expanded: boolean
  onToggle: () => void
  limit?: number
}

/** ChartCard 右上「顯示全部 N 件」⇄「只看最近 15 件」（total ≤ limit 時不渲染） */
export function ChartShowAll({ total, expanded, onToggle, limit = CHART_ROW_LIMIT, ...props }: ChartShowAllProps) {
  if (total <= limit) return null
  return (
    <Button type="button" variant="ghost" size="sm" aria-pressed={expanded} onClick={onToggle} {...props}>
      {expanded ? `只看最近 ${limit} 件` : `顯示全部 ${total} 件`}
    </Button>
  )
}
