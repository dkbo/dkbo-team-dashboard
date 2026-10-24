import { ChevronDown, ChevronUp, Info, Minus, Plus, RotateCcw } from 'lucide-react'
import type { Substate } from '@dash/shared'
import { StatusDot } from '@/components/app/StatusDot'
import { SubstatePill } from '@/components/app/SubstatePill'
import { Button } from '@/components/ui/button'
import { SUBSTATE_META, SUBSTATE_ORDER } from '@/lib/substate'
import { cn } from '@/lib/utils'

const SHORT: Partial<Record<Substate, string>> = { thinking: '思考', running: '執行', writing: '回覆', done: '完成', interrupted: '中斷', idle: '閒置' }

/** §6.7 右上各狀態人數（0 的不列、不含等你／錯誤） */
export function StateCounts({ counts, className }: { counts: { substate: Substate; count: number }[]; className?: string }) {
  if (counts.length === 0) return null
  return (
    <ul
      data-testid="office-state-counts"
      aria-label="各狀態人數"
      className={cn('flex h-8 max-w-full items-center gap-4 overflow-x-auto rounded-full bg-popover px-4 shadow-soft', className)}
    >
      {counts.map((c) => (
        <li key={c.substate} data-substate={c.substate} className="flex shrink-0 items-center gap-1.5 text-xs font-semibold whitespace-nowrap">
          <StatusDot tone={SUBSTATE_META[c.substate].tone} />
          {SHORT[c.substate] ?? SUBSTATE_META[c.substate].label} <span className="tabular-nums">{c.count}</span>
        </li>
      ))}
    </ul>
  )
}

const LEGEND_TEXT: Record<Substate, string> = {
  waiting: '等你審批或回答，去 herdr 處理',
  error: '這輪出錯停下來了',
  interrupted: '這輪被中斷，可晚點再看',
  running: '正在執行工具（標記寫工具名）',
  writing: '正在寫回覆',
  thinking: '思考中',
  done: '這輪完成，去休息區',
  idle: '閒置（半透明），滿 2 小時下班不畫',
}

/** §6.7 左下圖例：收合 chip／展開卡；展開狀態由頁面存 localStorage */
export function Legend({ open, onOpen, className }: { open: boolean; onOpen(open: boolean): void; className?: string }) {
  if (!open) {
    return (
      <button
        type="button"
        aria-expanded={false}
        onClick={() => onOpen(true)}
        className={cn(
          'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full bg-popover px-3 text-sm font-semibold shadow-soft transition-colors duration-150 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none',
          className,
        )}
      >
        <Info aria-hidden className="size-4" />
        圖例
        <ChevronUp aria-hidden className="size-3.5 text-muted-foreground" />
      </button>
    )
  }
  return (
    <div role="group" aria-label="圖例" className={cn('flex max-h-full w-75 min-h-0 flex-col gap-1 overflow-y-auto rounded-xl bg-popover p-3 shadow-pop', className)}>
      <button
        type="button"
        aria-expanded
        onClick={() => onOpen(false)}
        className="mb-1 inline-flex cursor-pointer items-center gap-1.5 self-start rounded-md text-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Info aria-hidden className="size-4" />
        圖例
        <ChevronDown aria-hidden className="size-3.5 text-muted-foreground" />
      </button>
      <dl className="flex flex-col">
        {SUBSTATE_ORDER.map((s) => (
          <div key={s} className="flex min-h-7.5 items-center gap-2">
            <dt className="w-24 shrink-0">
              <SubstatePill substate={s} size="sm" tool={s === 'running' ? 'Bash' : undefined} />
            </dt>
            <dd className="text-xs text-muted-foreground">{LEGEND_TEXT[s]}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-1 text-2xs text-muted-foreground">紅圈＝要你處理；紫圈＝目前選取</p>
    </div>
  )
}

/** §6.7 右下縮放與重設 */
export function ViewControls({ onZoom, onReset, className }: { onZoom(dir: 1 | -1): void; onReset(): void; className?: string }) {
  return (
    <div role="group" aria-label="視角" className={cn('flex flex-col items-center gap-0.5 rounded-full bg-popover p-1 shadow-soft', className)}>
      <Button type="button" variant="ghost" size="icon" aria-label="放大" onClick={() => onZoom(1)}>
        <Plus />
      </Button>
      <Button type="button" variant="ghost" size="icon" aria-label="縮小" onClick={() => onZoom(-1)}>
        <Minus />
      </Button>
      <span aria-hidden className="my-0.5 h-px w-5 bg-border" />
      <Button type="button" variant="ghost" size="icon" aria-label="重設鏡頭" onClick={onReset}>
        <RotateCcw />
      </Button>
    </div>
  )
}
