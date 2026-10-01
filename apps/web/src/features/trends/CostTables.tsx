import { Link } from 'react-router'
import type { CostsResponse, ProjectView } from '@dash/shared'
import { MismatchMark } from '@/components/app/MismatchMark'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCost } from '@/lib/format'
import { fmtTier, worstMismatch, type MemberInfo, type MismatchPane } from '@/lib/modelcost'
import { sortedCosts, taskCostRows } from './model'

function CostList({ rows, empty }: { rows: { id: string; label: string; cost: number }[]; empty: string }) {
  if (rows.length === 0) return <p className="py-4 text-center text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className="flex flex-col divide-y text-sm">
      {rows.map((r) => (
        <li key={r.id} data-testid={r.id} className="flex items-center justify-between gap-4 py-1.5">
          <span className="truncate">{r.label}</span>
          <span className="font-mono tabular-nums">{formatCost(r.cost)}</span>
        </li>
      ))}
    </ul>
  )
}

export function KindCosts({ costByKind }: { costByKind: Record<string, number> }) {
  return (
    <Card data-testid="kind-costs">
      <CardHeader>
        <CardTitle>依 kind 花費</CardTitle>
      </CardHeader>
      <CardContent>
        <CostList
          empty="這段期間沒有花費"
          rows={sortedCosts(costByKind).map(([kind, cost]) => ({ id: `kind-cost-${kind}`, label: kind, cost }))}
        />
      </CardContent>
    </Card>
  )
}

export function RoleCosts({ costs }: { costs: Pick<CostsResponse, 'byRole' | 'unknownRole'> }) {
  const rows = sortedCosts(costs.byRole).map(([role, cost]) => ({ id: `role-cost-${role}`, label: role, cost }))
  rows.push({ id: 'role-cost-unknown', label: '未知角色', cost: costs.unknownRole })
  return (
    <Card data-testid="role-costs">
      <CardHeader>
        <CardTitle>依角色花費</CardTitle>
        <CardDescription>角色取成員名第一個「-」之前；對不到成員的 pane 算未知角色</CardDescription>
      </CardHeader>
      <CardContent>
        <CostList empty="這段期間沒有花費" rows={rows} />
      </CardContent>
    </Card>
  )
}

type ProjectLike = Pick<ProjectView, 'name' | 'list'>

type TaskCostRow = ReturnType<typeof taskCostRows>[number]

function TaskName({ row: r }: { row: TaskCostRow }) {
  return r.linkable ? (
    <Link
      to={`/p/${encodeURIComponent(r.project)}/t/${encodeURIComponent(r.taskDir)}`}
      className="underline-offset-4 hover:underline"
      title={r.taskDir}
    >
      {r.display}
    </Link>
  ) : (
    <span className="font-mono text-xs" title="這個任務不在目前的任務清單裡">
      {r.taskDir}
    </span>
  )
}

const EMPTY_TASK_COSTS = '這段期間沒有歸到任務的花費'

/** 小螢幕（< md）用的卡片列：一任務一列，總額在右、成員細分換行在下，不需要橫向捲動。 */
function TaskCostList({ rows, unattributed }: { rows: TaskCostRow[]; unattributed: number }) {
  return (
    <ul data-testid="task-cost-list" className="flex flex-col divide-y text-sm md:hidden">
      {rows.length === 0 && <li className="py-6 text-center text-muted-foreground">{EMPTY_TASK_COSTS}</li>}
      {rows.map((r) => (
        <li key={`${r.project}/${r.taskDir}`} data-testid={`task-cost-card-${r.project}-${r.taskDir}`} className="flex flex-col gap-1 py-2">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">{r.project}</div>
              <div className="font-medium break-all">
                <TaskName row={r} />
              </div>
            </div>
            <span className="shrink-0 font-mono tabular-nums">{formatCost(r.cost)}</span>
          </div>
          <MemberCosts members={r.members} unmatched={r.unmatched} memberInfo={r.memberInfo} mismatchPanes={r.mismatchPanes} />
        </li>
      ))}
      {unattributed > 0 && (
        <li data-testid="task-cost-card-unattributed" className="flex items-baseline justify-between gap-3 py-2">
          <span className="text-muted-foreground">未歸屬任務</span>
          <span className="shrink-0 font-mono tabular-nums">{formatCost(unattributed)}</span>
        </li>
      )}
    </ul>
  )
}

export function TaskCostTable({
  costs,
  projects,
}: {
  costs: Pick<CostsResponse, 'tasks' | 'unattributed'> & Partial<Pick<CostsResponse, 'mismatch'>>
  projects: ProjectLike[] | undefined
}) {
  const rows = taskCostRows(costs.tasks, projects, costs.mismatch?.panes)
  return (
    <Card data-testid="cost-by-task">
      <CardHeader>
        <CardTitle>依任務花費</CardTitle>
      </CardHeader>
      <CardContent>
        <TaskCostList rows={rows} unattributed={costs.unattributed} />
        <div className="hidden md:block">
          <Table data-testid="task-cost-table">
            <TableHeader>
              <TableRow>
                <TableHead>專案</TableHead>
                <TableHead>任務</TableHead>
                <TableHead className="text-right">總額</TableHead>
                <TableHead>依成員</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                    {EMPTY_TASK_COSTS}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={`${r.project}/${r.taskDir}`} data-testid={`task-cost-${r.project}-${r.taskDir}`}>
                    <TableCell className="text-muted-foreground">{r.project}</TableCell>
                    <TableCell className="max-w-72 truncate font-medium">
                      <TaskName row={r} />
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatCost(r.cost)}</TableCell>
                    <TableCell>
                      <MemberCosts members={r.members} unmatched={r.unmatched} memberInfo={r.memberInfo} mismatchPanes={r.mismatchPanes} />
                    </TableCell>
                  </TableRow>
                ))
              )}
              {costs.unattributed > 0 && (
                <TableRow data-testid="task-cost-unattributed">
                  <TableCell colSpan={2} className="text-muted-foreground">
                    未歸屬任務
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{formatCost(costs.unattributed)}</TableCell>
                  <TableCell />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

function MemberMismatch({ member, info, panes }: { member: string; info: MemberInfo; panes: MismatchPane[] | undefined }) {
  const worst = worstMismatch(panes, member)
  return <MismatchMark testId={`member-mismatch-${member}`} actual={worst?.actual ?? info.actual} configured={worst?.configured ?? info.configured} />
}

/**
 * 成員細分；給了 memberInfo 時在金額後附設定檔位（`設定 L · opus/high`），實際與設定不一致加標記。
 * 標記的 tooltip 取該成員在本任務 mismatch.panes 裡花費最大的一列（memberInfo 的 actual／configured 是最後一筆，後段對齊時會看起來一致）。
 */
export function MemberCosts({
  members,
  unmatched,
  memberInfo,
  mismatchPanes,
}: {
  members: [string, number][]
  unmatched: number
  memberInfo?: Record<string, MemberInfo>
  /** 已篩到本任務的 mismatch.panes */
  mismatchPanes?: MismatchPane[]
}) {
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
      {members.map(([m, c]) => {
        const info = memberInfo?.[m]
        return (
          <span key={m} data-testid={`member-cost-${m}`} className="inline-flex flex-wrap items-baseline gap-x-1">
            {m} <span className="font-mono">{formatCost(c)}</span>
            {memberInfo && (
              <span data-testid={`member-tier-${m}`} className="rounded bg-muted px-1 font-mono text-[11px] text-foreground/80">
                <span className="font-sans text-muted-foreground">設定</span> {fmtTier(info?.configured)}
              </span>
            )}
            {info?.mismatch && <MemberMismatch member={m} info={info} panes={mismatchPanes} />}
          </span>
        )
      })}
      {unmatched > 0 && (
        <span data-testid="member-cost-other">
          其他 <span className="font-mono">{formatCost(unmatched)}</span>
        </span>
      )}
    </span>
  )
}
