import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Archive, ChevronDown, History, Info } from 'lucide-react'
import type { CostsResponse, HistoryRow } from '@dash/shared'
import { EmptyState } from '@/components/app/EmptyState'
import { PageHeader } from '@/components/app/PageHeader'
import { StatusPill, taskStatusPill } from '@/components/app/StatusPill'
import { Tag } from '@/components/app/Tag'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { fmtMinutes, fmtTs } from '@/features/task/format'
import { taskCostFor } from '@/features/trends/model'
import { formatCost } from '@/lib/format'
import { fmtTierCounts } from '@/lib/modelcost'
import { cn } from '@/lib/utils'
import { ALL_PROJECTS, devReviewData, filterHistory, limitRecent, reviewParts, TABLE_INITIAL, TABLE_STEP, weeklyClosed } from './aggregate'
import { DevReviewChart, WeeklyChart } from './HistoryCharts'
import { TierAnalysisCard } from './TierAnalysis'

const CLOSED = new Set(['done', 'abandoned'])

// Field（§6.2）：工具列內不顯示 label，前綴字 aria-hidden、控制件用 aria-label
const fieldCls =
  'flex h-8 items-center gap-2 rounded-lg border border-input bg-card px-3 text-sm transition-colors duration-150 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 motion-reduce:transition-none dark:bg-input/30'
const fieldPrefix = 'shrink-0 text-xs font-semibold text-muted-foreground'
const controlCls = 'min-w-0 cursor-pointer bg-transparent outline-none'

const REVIEW_HELP = '裁定/自主 · minor 數 · 重審次數'

const taskHref = (r: HistoryRow) => `/p/${encodeURIComponent(r.project)}/t/${encodeURIComponent(r.dir)}`

/** 數字 0 灰字（§1.4） */
const zeroCls = (n: number | null | undefined) => (n === 0 ? 'text-muted-foreground' : undefined)

function ReviewCell({ r }: { r: HistoryRow }) {
  const parts = reviewParts(r)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="cursor-help rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          {parts.map((p, i) => (
            <span key={p.key}>
              {i > 0 && <span className="text-muted-foreground"> · </span>}
              <span data-testid={`col-${p.key}`} className={cn(p.zero && 'text-muted-foreground')}>
                {p.text}
              </span>
            </span>
          ))}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        裁定 {r.rulings}（自主 {r.autonomousRulings}）· minor {r.minors} · 重審 {r.reReviews}
      </TooltipContent>
    </Tooltip>
  )
}

/** 小螢幕（< md）卡片清單：每列 muted 內層卡、兩欄 dl（§6.19） */
function HistoryList({ rows, costs }: { rows: HistoryRow[]; costs?: CostsResponse | null }) {
  return (
    <ul data-testid="history-list" className="flex flex-col gap-2 md:hidden">
      {rows.map((r) => (
        <li key={`${r.project}/${r.dir}`} className="flex flex-col gap-2 rounded-lg bg-muted p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Tag>{r.project}</Tag>
            <StatusPill size="sm" {...taskStatusPill(r.status)} />
          </div>
          <Link to={taskHref(r)} className="w-fit rounded-full font-semibold break-all underline-offset-4 outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
            {r.display ?? r.dir}
          </Link>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs font-medium">
            {[
              ['結案', <span className="font-mono">{fmtTs(r.closedAt)}</span>],
              ['耗時', fmtMinutes(r.totalMin)],
              ['波數', r.waves],
              ['檔位', fmtTierCounts(r.dispatch)],
              ['審查', reviewParts(r).map((p) => p.text).join(' · ')],
              ['花費', formatCost(taskCostFor(costs, r.project, r.dir)?.cost)],
            ].map(([k, v]) => (
              <div key={k as string} className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ul>
  )
}

export function HistoryView({ rows, costs, banner }: { rows: HistoryRow[]; costs?: CostsResponse | null; /** PageHeader 下的 Banner */ banner?: ReactNode }) {
  const [project, setProject] = useState(ALL_PROJECTS)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [limit, setLimit] = useState(TABLE_INITIAL)
  const [chartAll, setChartAll] = useState(false)

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
  const devReview = useMemo(() => devReviewData(shown), [shown])
  const visible = shown.slice(0, limit)
  const remaining = shown.length - visible.length

  // 篩選一變，表格回到預設件數
  const filter = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setLimit(TABLE_INITIAL)
  }
  const clear = () => {
    setProject(ALL_PROJECTS)
    setFrom('')
    setTo('')
    setLimit(TABLE_INITIAL)
  }

  const filters = (
    <div role="search" aria-label="篩選" className="flex flex-wrap items-center gap-2">
      <div className={fieldCls}>
        <span aria-hidden className={fieldPrefix}>
          專案
        </span>
        <select aria-label="專案" className={controlCls} value={project} onChange={(e) => filter(setProject)(e.target.value)}>
          <option value={ALL_PROJECTS}>全部專案</option>
          {projects.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>
      <div className={fieldCls}>
        <span aria-hidden className={fieldPrefix}>
          結案起
        </span>
        <input type="date" aria-label="結案起" className={controlCls} value={from} max={to || undefined} onChange={(e) => filter(setFrom)(e.target.value)} />
      </div>
      <div className={fieldCls}>
        <span aria-hidden className={fieldPrefix}>
          迄
        </span>
        <input type="date" aria-label="結案迄" className={controlCls} value={to} min={from || undefined} onChange={(e) => filter(setTo)(e.target.value)} />
      </div>
      {filtered && (
        <Button variant="ghost" size="sm" onClick={clear}>
          清除篩選
        </Button>
      )}
    </div>
  )

  return (
    <TooltipProvider delayDuration={200}>
      <PageHeader
        icon={History}
        title="歷史與分析"
        subtitle={`共 ${closed.length} 件已結案 · ${filtered ? `篩選後 ${shown.length} 件` : '篩選：全部專案'}`}
        actions={filters}
      />
      {banner}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <DevReviewChart data={limitRecent(devReview, chartAll)} total={devReview.length} expanded={chartAll} onToggle={() => setChartAll((v) => !v)} />
        <WeeklyChart data={weeklyClosed(shown)} />
      </div>

      <Card className={cn(remaining <= 0 && 'pb-2')}>
        <CardHeader>
          <CardTitle>
            <Archive aria-hidden />
            已結案任務
            <Tag count={shown.length} />
          </CardTitle>
        </CardHeader>
        <CardContent className="max-md:pb-3 md:px-0">
          {shown.length > 0 && <HistoryList rows={visible} costs={costs} />}
          <div className={cn(shown.length > 0 && 'max-md:hidden')}>
            <Table data-testid="history-table" flush>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>專案</TableHead>
                  <TableHead>任務</TableHead>
                  <TableHead>狀態</TableHead>
                  <TableHead>結案</TableHead>
                  <TableHead className="text-right">耗時</TableHead>
                  <TableHead className="text-right">波數</TableHead>
                  <TableHead>檔位</TableHead>
                  <TableHead className="text-right">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" className="inline-flex cursor-help items-center gap-1 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                          審查
                          <Info aria-hidden className="size-3.5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{REVIEW_HELP}</TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead className="text-right">花費</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={9} className="whitespace-normal">
                      <EmptyState
                        icon="🔍"
                        title="沒有符合條件的已結案任務"
                        action={
                          filtered && (
                            <button
                              type="button"
                              onClick={clear}
                              className="cursor-pointer rounded-full text-xs font-semibold text-muted-foreground transition-colors duration-150 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                            >
                              清除篩選
                            </button>
                          )
                        }
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  visible.map((r) => (
                    <TableRow key={`${r.project}/${r.dir}`} data-testid={`history-row-${r.project}-${r.dir}`}>
                      <TableCell>
                        <Tag>{r.project}</Tag>
                      </TableCell>
                      <TableCell className="max-w-72 truncate">
                        <Link
                          to={taskHref(r)}
                          className="rounded-full font-semibold underline-offset-4 outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
                          title={r.dir}
                        >
                          {r.display ?? r.dir}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <StatusPill size="sm" {...taskStatusPill(r.status)} />
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{fmtTs(r.closedAt)}</TableCell>
                      <TableCell className={cn('text-right tabular-nums', r.totalMin == null && 'text-muted-foreground')}>{fmtMinutes(r.totalMin)}</TableCell>
                      <TableCell className={cn('text-right tabular-nums', zeroCls(r.waves))} data-testid="col-waves">
                        {r.waves}
                      </TableCell>
                      <TableCell data-testid="col-tiers">
                        {r.dispatch && r.dispatch.length > 0 ? (
                          <Tag variant="brand" mono>
                            {fmtTierCounts(r.dispatch)}
                          </Tag>
                        ) : (
                          <span className="text-muted-foreground">{fmtTierCounts(r.dispatch)}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums" data-testid="col-review">
                        <ReviewCell r={r} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums" data-testid="col-cost">
                        <CostCell cost={taskCostFor(costs, r.project, r.dir)?.cost} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
        {remaining > 0 && (
          <div className="flex justify-center border-t py-2">
            <Button data-testid="history-more" variant="ghost" size="sm" onClick={() => setLimit((n) => n + TABLE_STEP)}>
              <ChevronDown aria-hidden />
              再顯示 {Math.min(TABLE_STEP, remaining)} 件
            </Button>
          </div>
        )}
      </Card>

      <TierAnalysisCard rows={shown} costs={costs} />
    </TooltipProvider>
  )
}

function CostCell({ cost }: { cost: number | null | undefined }) {
  // 金額沒有資料或 0 → 「—」灰字
  return cost == null || cost === 0 ? <span className="text-muted-foreground">—</span> : <>{formatCost(cost)}</>
}
