import { Square } from 'lucide-react'
import type { Substate } from '@dash/shared'
import { formatTimer, substateLabel, SUBSTATE_META } from '@/lib/substate'
import { cn } from '@/lib/utils'
import { StatusPill } from './StatusPill'

export interface SubstatePillProps {
  substate: Substate
  /** running 時接在文字後 */
  tool?: string | null
  /** 有就在膠囊右邊顯示計時；基準時間由呼叫端依細狀態挑（等你＝進入時間、進行中＝本輪開始） */
  since?: Date | number | null
  /** 計時用的現在；沒給就用 Date.now() */
  now?: number
  size?: 'default' | 'sm'
  /** 等你：審批／提問 */
  note?: string
  className?: string
}

/** 細狀態膠囊（§6.2）：StatusPill＋tone／文字／前置照 §1.2，計時放在膠囊外 */
export function SubstatePill({ substate, tool, since, now, size = 'default', note, className }: SubstatePillProps) {
  const meta = SUBSTATE_META[substate]
  const sm = size === 'sm'
  const text = substateLabel(substate, tool)
  const label = sm && note ? `${text} · ${note}` : text
  const pill = (
    <StatusPill
      tone={meta.tone}
      size={size}
      data-substate={substate}
      dot={meta.lead === 'check' ? 'check' : meta.lead === 'dot'}
      pulse={meta.pulse}
      note={note}
      label={
        meta.lead === 'square' ? (
          <>
            <Square aria-hidden className="mr-1 inline-block size-3 fill-current align-text-bottom" />
            {label}
          </>
        ) : (
          label
        )
      }
      className={since == null ? className : undefined}
    />
  )
  if (since == null) return pill
  const timer = formatTimer(substate, since instanceof Date ? since.getTime() : since, now ?? Date.now())
  return (
    <span data-slot="substate" className={cn('inline-flex max-w-full items-center gap-1.5', className)}>
      {pill}
      {timer && (
        <span
          data-slot="substate-timer"
          className={cn('text-xs font-semibold tabular-nums', meta.tone === 'danger' ? 'text-status-danger-fg' : 'text-muted-foreground')}
        >
          {timer}
        </span>
      )}
    </span>
  )
}
