import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import type { CostsResponse, HistoryRow } from '@dash/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TaskStatusBadge } from '@/features/task/TaskHeader'
import { fmtMinutes, fmtTs } from '@/features/task/format'
import { taskCostFor } from '@/features/trends/model'
import { formatCost } from '@/lib/format'
import { fmtTierCounts } from '@/lib/modelcost'
import { ALL_PROJECTS, devReviewData, filterHistory, weeklyClosed } from './aggregate'
import { DevReviewChart, WeeklyChart } from './HistoryCharts'
import { TierAnalysisCard } from './TierAnalysis'

const CLOSED = new Set(['done', 'abandoned'])

const fieldCls =
  'h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30'

export function HistoryView({ rows, costs }: { rows: HistoryRow[]; costs?: CostsResponse | null }) {
  const [project, setProject] = useState(ALL_PROJECTS)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const closed = useMemo(
    () =>
      rows
        .filter((r) => CLOSED.has(r.status))
        .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? '')),
    [rows],
  )
  const projects = useMemo(() => [...new Set(closed.map((r) => r.project))].sort(), [closed])
  const shown = useMemo(() => filterHistory(closed, { project, from, to }), [closed, project, from, to])
  const filtered = project !== ALL_PROJECTS || from !== '' || to !== ''

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3" role="search" aria-label="篩選">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          專案
          <select className={fieldCls} value={project} onChange={(e) => setProject(e.target.value)}>
            <option value={ALL_PROJECTS}>全部專案</option>
            {projects.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          結案起
          <input type="date" className={fieldCls} value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          結案迄
          <input type="date" className={fieldCls} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </label>
        {filtered && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setProject(ALL_PROJECTS)
              setFrom('')
              setTo('')
            }}
          >
            清除篩選
          </Button>
        )}
        <span className="ml-auto text-sm text-muted-foreground">共 {shown.length} 件</span>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <DevReviewChart data={devReviewData(shown)} />
        <WeeklyChart data={weeklyClosed(shown)} />
      </div>

      <Card>
        <CardContent>
          <Table data-testid="history-table">
            <TableHeader>
              <TableRow>
                <TableHead>專案</TableHead>
                <TableHead>任務</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead>結案</TableHead>
                <TableHead className="text-right">總耗時</TableHead>
                <TableHead className="text-right">波數</TableHead>
                <TableHead>檔位</TableHead>
                <TableHead className="text-right">裁定 / 自主</TableHead>
                <TableHead className="text-right">minor</TableHead>
                <TableHead className="text-right">審查複看</TableHead>
                <TableHead className="text-right">花費</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="py-8 text-center text-muted-foreground">
                    沒有符合條件的已結案任務
                  </TableCell>
                </TableRow>
              ) : (
                shown.map((r) => (
                  <TableRow key={`${r.project}/${r.dir}`} data-testid={`history-row-${r.project}-${r.dir}`}>
                    <TableCell className="text-muted-foreground">{r.project}</TableCell>
                    <TableCell className="max-w-72 truncate font-medium">
                      <Link
                        to={`/p/${encodeURIComponent(r.project)}/t/${encodeURIComponent(r.dir)}`}
                        className="underline-offset-4 hover:underline"
                        title={r.dir}
                      >
                        {r.display ?? r.dir}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <TaskStatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{fmtTs(r.closedAt)}</TableCell>
                    <TableCell className="text-right">{fmtMinutes(r.totalMin)}</TableCell>
                    <TableCell className="text-right font-mono" data-testid="col-waves">
                      {r.waves}
                    </TableCell>
                    <TableCell className="font-mono text-xs whitespace-nowrap" data-testid="col-tiers">
                      {fmtTierCounts(r.dispatch)}
                    </TableCell>
                    <TableCell className="text-right font-mono" data-testid="col-rulings">
                      {r.rulings} / {r.autonomousRulings}
                    </TableCell>
                    <TableCell className="text-right font-mono" data-testid="col-minors">
                      {r.minors}
                    </TableCell>
                    <TableCell className="text-right font-mono" data-testid="col-rereviews">
                      {r.reReviews}
                    </TableCell>
                    <TableCell className="text-right font-mono" data-testid="col-cost">
                      {formatCost(taskCostFor(costs, r.project, r.dir)?.cost)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <TierAnalysisCard rows={shown} costs={costs} />
    </div>
  )
}
