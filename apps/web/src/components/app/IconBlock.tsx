import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** 頁首圖示塊（§6.7）：icon-block、radius-lg、accent 底 */
export function IconBlock({ icon: Icon, className }: { icon: LucideIcon; className?: string }) {
  return (
    <span
      data-slot="icon-block"
      aria-hidden
      className={cn('grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground', className)}
    >
      <Icon className="size-5" />
    </span>
  )
}
