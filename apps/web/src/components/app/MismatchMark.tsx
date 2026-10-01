import { TriangleAlert } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { mismatchTip, type ModelEffort } from '@/lib/modelcost'

/** 實際與設定的 model／effort 不一致：圖示＋tooltip（自帶 Provider，詳情頁的元件測試不必另包） */
export function MismatchMark({ actual, configured, testId }: { actual: ModelEffort | null | undefined; configured: ModelEffort | null | undefined; testId?: string }) {
  const tip = mismatchTip(actual, configured)
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-testid={testId}
            aria-label={tip}
            className="inline-flex shrink-0 cursor-help align-[-2px] text-amber-600 dark:text-amber-400"
          >
            <TriangleAlert aria-hidden className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{tip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
