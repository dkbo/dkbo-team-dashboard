import { Star } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface EffortStarsProps {
  /** 0–5；0（讀不到 effort）不畫 */
  level: number
  /** default：頭頂用的膠囊；sm：清單內無底，星 7 */
  size?: 'default' | 'sm'
  className?: string
}

/** effort 星（§1.7、§6.15）。星色 accent-foreground，空格同色 22%，不用琥珀 */
export function EffortStars({ level, size = 'default', className }: EffortStarsProps) {
  const n = Math.min(5, Math.max(0, Math.round(level)))
  if (n === 0) return null
  const sm = size === 'sm'
  return (
    <span
      data-slot="effort-stars"
      data-size={size}
      role="img"
      aria-label={`effort ${n}／5 星`}
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5',
        sm ? 'h-3.5' : 'h-3.5 rounded-full bg-popover px-1.25 shadow-soft',
        className,
      )}
    >
      {Array.from({ length: 5 }, (_, i) => {
        const filled = i < n
        return (
          <Star
            key={i}
            aria-hidden
            data-star={filled ? 'filled' : 'empty'}
            className={cn(
              sm ? 'size-1.75' : 'size-2',
              filled ? 'fill-accent-foreground text-accent-foreground' : 'fill-accent-foreground/22 text-accent-foreground/22',
            )}
          />
        )
      })}
    </span>
  )
}
