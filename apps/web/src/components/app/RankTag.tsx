import { starsOf, RANK_LABEL, type Rank } from '@/lib/rank'
import { cn } from '@/lib/utils'
import { EffortStars } from './EffortStars'

const SWATCH: Record<Rank, string> = {
  senior: 'bg-rank-senior',
  mid: 'bg-rank-mid',
  junior: 'bg-rank-junior',
  visitor: 'bg-rank-visitor',
}

export interface RankTagProps {
  rank: Rank
  model?: string | null
  effort?: string | null
  /** 給了才能把 effort 換成星數（claude／codex 的檔位不同）；沒給就不畫星 */
  kind?: string | null
  className?: string
}

/** 職等文字（§6.15）：色塊＋職等＋「model/effort」＋[星] */
export function RankTag({ rank, model, effort, kind, className }: RankTagProps) {
  const detail = model ? (effort ? `${model}/${effort}` : model) : null
  const stars = kind ? starsOf(kind, effort) : 0
  return (
    <span
      data-slot="rank-tag"
      data-rank={rank}
      className={cn('inline-flex h-5 max-w-full items-center gap-1.5 rounded-full bg-muted pr-2 pl-1.5 whitespace-nowrap', className)}
    >
      <span data-slot="rank-swatch" aria-hidden className={cn('size-2.5 shrink-0 rounded-full border-(length:--border-w-hair) border-foreground/55', SWATCH[rank])} />
      <span className="shrink-0 text-2xs font-bold">{RANK_LABEL[rank]}</span>
      {detail && <span className="min-w-0 truncate font-mono text-2xs font-normal text-muted-foreground">{detail}</span>}
      {stars > 0 && <EffortStars level={stars} size="sm" />}
    </span>
  )
}
