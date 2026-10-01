import type { MismatchPane, TaskCost } from '@dash/shared'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MemberCosts } from '@/features/trends/CostTables'
import { sortedCosts } from '@/features/trends/model'
import { formatCost } from '@/lib/format'

/** 本任務花費（整個保留期）；沒有資料顯示「—」 */
export function TaskCostCard({ cost, mismatchPanes }: { cost: TaskCost | null; /** 已篩到本任務的 mismatch.panes */ mismatchPanes?: MismatchPane[] }) {
  return (
    <Card data-testid="task-cost" size="sm">
      <CardHeader>
        <CardTitle className="flex items-baseline gap-3">
          本任務花費
          <span data-testid="task-cost-total" className="font-mono text-base tabular-nums">
            {formatCost(cost?.cost)}
          </span>
        </CardTitle>
        <CardDescription>dashboard 資料目錄保留期內的記錄；dashboard 未開啟期間的花費可能遺漏</CardDescription>
      </CardHeader>
      {cost && (
        <CardContent>
          <MemberCosts members={sortedCosts(cost.members)} unmatched={cost.unmatched} memberInfo={cost.memberInfo} mismatchPanes={mismatchPanes} />
        </CardContent>
      )}
    </Card>
  )
}
