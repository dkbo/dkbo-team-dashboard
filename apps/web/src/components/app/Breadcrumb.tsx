import { Fragment, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/lib/utils'

export interface BreadcrumbItem {
  label: ReactNode
  /** 最後一段（目前頁）不給 */
  href?: string
}

/** 任務頁路徑（§6.15），放在 PageHeader 上方、間距 stack-sm */
export function Breadcrumb({ items, className }: { items: BreadcrumbItem[]; className?: string }) {
  return (
    <nav aria-label="路徑" className={cn('min-w-0', className)}>
      <ol className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
        {items.map((it, i) => {
          const last = i === items.length - 1
          return (
            <Fragment key={i}>
              {i > 0 && (
                <li aria-hidden className="flex shrink-0">
                  <ChevronRight className="size-3.5" />
                </li>
              )}
              <li className={cn('flex', last ? 'min-w-0' : 'shrink-0')}>
                {last || !it.href ? (
                  <span aria-current={last ? 'page' : undefined} className={cn(last && 'truncate font-mono font-semibold text-foreground')}>
                    {it.label}
                  </span>
                ) : (
                  <Link
                    to={it.href}
                    className="rounded-full transition-colors duration-150 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none"
                  >
                    {it.label}
                  </Link>
                )}
              </li>
            </Fragment>
          )
        })}
      </ol>
    </nav>
  )
}
