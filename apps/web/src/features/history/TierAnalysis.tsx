import { Layers } from 'lucide-react'
import type { CostsResponse, HistoryRow } from '@dash/shared'
import { EmptyState } from '@/components/app/EmptyState'
import { Tag } from '@/components/app/Tag'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fmtMinutes } from '@/features/task/format'
import { formatCost } from '@/lib/format'
import { fmtConfigured, tierAnalysis, type TierAnalysisRow } from '@/lib/modelcost'

/** 平均值最多一位小數（2 → 「2」、0.5 → 「0.5」） */
const fmtAvg = (n: number) => String(Number(n.toFixed(1)))

const COLS: { key: string; label: string; testId: string; value: (r: TierAnalysisRow) => string }[] = [
  { key: 'tasks', label: '任務數', testId: 'ta-tasks', value: (r) => String(r.tasks) },
  { key: 'members', label: '成員數', testId: 'ta-members', value: (r) => String(r.members) },
  { key: 'cost', label: '歸屬花費', testId: 'ta-cost', value: (r) => formatCost(r.cost) },
  { key: 'cpm', label: '每成員平均花費', testId: 'ta-cost-per-member', value: (r) => formatCost(r.costPerMember) },
  { key: 'min', label: '平均耗時', testId: 'ta-total-min', value: (r) => fmtMinutes(r.avgTotalMin) },
  { key: 'waves', label: '平均波數', testId: 'ta-waves', value: (r) => fmtAvg(r.avgWaves) },
  { key: 'repair', label: '平均修復波數', testId: 'ta-repair-waves', value: (r) => fmtAvg(r.avgRepairWaves) },
  { key: 'rr', label: '平均重審次數', testId: 'ta-rereviews', value: (r) => fmtAvg(r.avgReReviews) },
]

/** /history「依角色 × 派工檔位」：rows 為已套用頁面篩選的任務，costs 取 /api/costs?range=all */
export function TierAnalysisCard({ rows, costs }: { rows: HistoryRow[]; costs?: CostsResponse | null }) {
  const data = tierAnalysis(rows, costs)
  return (
    <Card data-testid="history-tier-analysis" className="pb-2">
      <CardHeader>
        <CardTitle>
          <Layers aria-hidden />
          依角色 × 派工檔位
        </CardTitle>
        <CardDescription>
          派工檔位的 model／effort 由專案現在的 roles／kinds 檔推出，不計 reviewer；花費為該檔位成員實際歸屬的金額。耗時、波數等為任務層級的相關，不代表因果
        </CardDescription>
      </CardHeader>
      <CardContent className="max-md:pb-3 md:px-0">
        {data.length === 0 ? (
          <EmptyState icon={Layers} title="沒有派工紀錄" />
        ) : (
          <>
            <ul data-testid="tier-analysis-list" className="flex flex-col gap-2 text-sm md:hidden">
              {data.map((r, i) => (
                <li key={r.key} data-testid={`tier-analysis-card-${i}`} className="flex flex-col gap-2 rounded-lg bg-muted p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{r.role}</span>
                    <Tag variant="brand" mono>
                      {fmtConfigured(r)}
                    </Tag>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs font-medium">
                    {COLS.map((c) => (
                      <div key={c.key} className="flex justify-between gap-2">
                        <dt className="text-muted-foreground">{c.label}</dt>
                        <dd className="tabular-nums">{c.value(r)}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <Table data-testid="tier-analysis-table" flush>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>角色</TableHead>
                    <TableHead>檔位</TableHead>
                    {COLS.map((c) => (
                      <TableHead key={c.key} className="text-right">
                        {c.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((r, i) => (
                    <TableRow key={r.key} data-testid={`tier-analysis-row-${i}`}>
                      <TableCell className="font-semibold">{r.role}</TableCell>
                      <TableCell>
                        <Tag variant="brand" mono>
                          {fmtConfigured(r)}
                        </Tag>
                      </TableCell>
                      {COLS.map((c) => (
                        <TableCell key={c.key} data-testid={c.testId} className="text-right tabular-nums">
                          {c.value(r)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
