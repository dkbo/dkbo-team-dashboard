import { Link } from 'react-router'
import type { CostsResponse, ProjectView } from '@dash/shared'
import { Bot, Coins, ListTree, Users } from 'lucide-react'
import { EmptyState } from '@/components/app/EmptyState'
import { MismatchMark } from '@/components/app/MismatchMark'
import { Tag } from '@/components/app/Tag'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatCost } from '@/lib/format'
import { fmtTier, worstMismatch, type MemberInfo, type MismatchPane } from '@/lib/modelcost'
import { sortedCosts, taskCostRows } from './model'

/** 金額欄：0 顯示「—」且灰字（§1.4 計數與 0） */
function CostValue({ cost }: { cost: number }) {
  return cost === 0 ? <span className="text-muted-foreground">—</span> : <>{formatCost(cost)}</>
}

/** 依 kind／依角色：Table dense 兩欄清單（列高 row-dense） */
function CostList({ head, rows, empty }: { head: string; rows: { id: string; label: string; cost: number }[]; empty: string }) {
  if (rows.length === 0)
    return (
      <CardContent>
        <EmptyState icon={Coins} title={empty} />
      </CardContent>
    )
  return (
    <CardContent className="px-0">
      <Table density="dense" flush>
        <TableHeader>
          <TableRow>
            <TableHead>{head}</TableHead>
            <TableHead className="text-right">花費</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} data-testid={r.id}>
              <TableCell className="max-w-48 truncate">{r.label}</TableCell>
              <TableCell className="text-right tabular-nums">
                <CostValue cost={r.cost} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </CardContent>
  )
}

export function KindCosts({ costByKind }: { costByKind: Record<string, number> }) {
  return (
    <Card data-testid="kind-costs" className="pb-2">
      <CardHeader>
        <CardTitle>
          <Bot aria-hidden />
          依 kind 花費
        </CardTitle>
      </CardHeader>
      <CostList
        head="kind"
        empty="這段期間沒有花費"
        rows={sortedCosts(costByKind).map(([kind, cost]) => ({ id: `kind-cost-${kind}`, label: kind, cost }))}
      />
    </Card>
  )
}

export function RoleCosts({ costs }: { costs: Pick<CostsResponse, 'byRole' | 'unknownRole'> }) {
  const rows = sortedCosts(costs.byRole).map(([role, cost]) => ({ id: `role-cost-${role}`, label: role, cost }))
  rows.push({ id: 'role-cost-unknown', label: '未知角色', cost: costs.unknownRole })
  return (
    <Card data-testid="role-costs" className="pb-2">
      <CardHeader>
        <CardTitle>
          <Users aria-hidden />
          依角色花費
        </CardTitle>
        <CardDescription>角色取成員名第一個「-」之前；對不到成員的 pane 算未知角色</CardDescription>
      </CardHeader>
      <CostList head="角色" empty="這段期間沒有花費" rows={rows} />
    </Card>
  )
}

type ProjectLike = Pick<ProjectView, 'name' | 'list'>

type TaskCostRow = ReturnType<typeof taskCostRows>[number]

function TaskName({ row: r }: { row: TaskCostRow }) {
  return r.linkable ? (
    <Link
      to={`/p/${encodeURIComponent(r.project)}/t/${encodeURIComponent(r.taskDir)}`}
      className="rounded-full font-semibold underline-offset-4 outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      title={r.taskDir}
    >
      {r.display}
    </Link>
  ) : (
    <span className="font-mono text-xs text-muted-foreground" title="這個任務不在目前的任務清單裡">
      {r.taskDir}
    </span>
  )
}

const EMPTY_TASK_COSTS = '這段期間沒有歸到任務的花費'

/** 小螢幕（< md）用的卡片列：一任務一列，總額在右、成員細分換行在下，不需要橫向捲動。 */
function TaskCostList({ rows, unattributed }: { rows: TaskCostRow[]; unattributed: number }) {
  return (
    <ul data-testid="task-cost-list" className="flex flex-col gap-2 text-sm md:hidden">
      {rows.length === 0 && (
        <li>
          <EmptyState icon={Coins} title={EMPTY_TASK_COSTS} />
        </li>
      )}
      {rows.map((r) => (
        <li key={`${r.project}/${r.taskDir}`} data-testid={`task-cost-card-${r.project}-${r.taskDir}`} className="flex flex-col gap-1 rounded-lg bg-muted p-3">
          <div className="flex items-baseline justify-between gap-3">
            <div className="flex min-w-0 flex-col items-start gap-1">
              <Tag>{r.project}</Tag>
              <div className="break-all">
                <TaskName row={r} />
              </div>
            </div>
            <span className="shrink-0 font-semibold tabular-nums">{formatCost(r.cost)}</span>
          </div>
          <MemberCosts members={r.members} unmatched={r.unmatched} memberInfo={r.memberInfo} mismatchPanes={r.mismatchPanes} />
        </li>
      ))}
      {unattributed > 0 && (
        <li data-testid="task-cost-card-unattributed" className="flex items-baseline justify-between gap-3 rounded-lg bg-muted p-3">
          <span className="text-muted-foreground">未歸屬任務</span>
          <span className="shrink-0 font-semibold tabular-nums">{formatCost(unattributed)}</span>
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
    <Card data-testid="cost-by-task" className="pb-2">
      <CardHeader>
        <CardTitle>
          <ListTree aria-hidden />
          依任務花費
        </CardTitle>
      </CardHeader>
      <CardContent className="max-md:pb-3 md:px-0">
        <TaskCostList rows={rows} unattributed={costs.unattributed} />
        <div className="hidden md:block">
          <Table data-testid="task-cost-table" flush>
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
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4}>
                    <EmptyState icon={Coins} title={EMPTY_TASK_COSTS} />
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={`${r.project}/${r.taskDir}`} data-testid={`task-cost-${r.project}-${r.taskDir}`}>
                    <TableCell>
                      <Tag>{r.project}</Tag>
                    </TableCell>
                    <TableCell className="max-w-72 truncate">
                      <TaskName row={r} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCost(r.cost)}</TableCell>
                    <TableCell className="py-3 whitespace-normal">
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
                  <TableCell className="text-right tabular-nums">{formatCost(costs.unattributed)}</TableCell>
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
    <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-muted-foreground">
      {members.map(([m, c]) => {
        const info = memberInfo?.[m]
        return (
          <span key={m} data-testid={`member-cost-${m}`} className="inline-flex flex-wrap items-center gap-x-1">
            {m} <span className="tabular-nums">{formatCost(c)}</span>
            {memberInfo && (
              <Tag data-testid={`member-tier-${m}`} variant="brand" mono>
                <span className="font-sans">設定</span> {fmtTier(info?.configured)}
              </Tag>
            )}
            {info?.mismatch && <MemberMismatch member={m} info={info} panes={mismatchPanes} />}
          </span>
        )
      })}
      {unmatched > 0 && (
        <span data-testid="member-cost-other">
          其他 <span className="tabular-nums">{formatCost(unmatched)}</span>
        </span>
      )}
    </span>
  )
}
