import { Coins } from 'lucide-react'
import type { MismatchPane, TaskCost } from '@dash/shared'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MemberCosts } from '@/features/trends/CostTables'
import { sortedCosts } from '@/features/trends/model'
import { formatCost } from '@/lib/format'
import { cn } from '@/lib/utils'

/** 本任務花費（整個保留期，右欄）；沒有資料顯示「—」 */
export function TaskCostCard({ cost, mismatchPanes }: { cost: TaskCost | null; /** 已篩到本任務的 mismatch.panes */ mismatchPanes?: MismatchPane[] }) {
  const members = cost ? Object.keys(cost.members).length : 0
  return (
    <Card data-testid="task-cost">
      <CardHeader>
        <CardTitle>
          <Coins aria-hidden />
          本任務花費
        </CardTitle>
        <CardDescription>dashboard 資料目錄保留期內的記錄；dashboard 未開啟期間的花費可能遺漏</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="flex items-baseline gap-2">
          <span data-testid="task-cost-total" className={cn('text-2xl font-extrabold tracking-tight tabular-nums', !cost && 'text-muted-foreground')}>
            {formatCost(cost?.cost)}
          </span>
          {members > 0 && <span className="text-xs font-medium text-muted-foreground">{members} 位成員</span>}
        </p>
        {cost && (
          <MemberCosts members={sortedCosts(cost.members)} unmatched={cost.unmatched} memberInfo={cost.memberInfo} mismatchPanes={mismatchPanes} />
        )}
      </CardContent>
    </Card>
  )
}
