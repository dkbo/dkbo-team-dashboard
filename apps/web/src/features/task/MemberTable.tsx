import { Link } from 'react-router'
import { MonitorPlay } from 'lucide-react'
import { modelMismatch, type Dispatch, type PaneLive, type TaskDetail } from '@dash/shared'
import { CopyCommand } from '@/components/app/CopyCommand'
import { MismatchMark } from '@/components/app/MismatchMark'
import { StatusPill } from '@/components/app/StatusPill'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { formatStamp } from '@/features/trends/model'
import { herdrHref } from '@/lib/herdr'
import { fmtConfigured, fmtModelEffort } from '@/lib/modelcost'
import { cn } from '@/lib/utils'
import { fmtCost, fmtPct } from './format'
import { matchMemberPanes } from './model'

function HerdrStatus({ pane }: { pane: PaneLive | null }) {
  return (
    <div data-testid="herdr-status" className="flex max-w-56 flex-col gap-1">
      {pane ? (
        <>
          <span title={[pane.model, pane.effort].filter(Boolean).join(' / ') || undefined}>
            <StatusPill status={pane.status} />
          </span>
          <Link
            to={herdrHref(pane)}
            data-testid="watch-pane"
            className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            <MonitorPlay aria-hidden className="size-3.5" />
            看畫面
          </Link>
          <CopyCommand command={`herdr agent focus ${pane.paneId}`} />
        </>
      ) : (
        <StatusPill status="unknown" label="無 pane" />
      )}
    </div>
  )
}

/** 派過多次時的「共 N 次」，hover 列出每次派工 */
function DispatchTimes({ list }: { list: Dispatch[] }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="cursor-help text-xs text-muted-foreground underline decoration-dotted underline-offset-2">
            共 {list.length} 次
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <ul className="flex flex-col gap-0.5">
            {list.map((d, i) => (
              <li key={i}>
                {formatStamp(d.at)} {fmtConfigured(d)}
                {d.notes.length > 0 && `（${d.notes.join(' ')}）`}
              </li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function MemberTable({ task, panes, dispatch = [] }: { task: TaskDetail; panes: PaneLive[]; dispatch?: Dispatch[] }) {
  const matched = matchMemberPanes(task, panes)
  return (
    <Card data-testid="member-table">
      <CardHeader>
        <CardTitle>成員</CardTitle>
      </CardHeader>
      <CardContent>
        {task.members.length === 0 ? (
          <p className="text-sm text-muted-foreground">沒有成員 state 檔</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>成員</TableHead>
                <TableHead>state</TableHead>
                <TableHead>目前</TableHead>
                <TableHead>待辦</TableHead>
                <TableHead>卡在</TableHead>
                <TableHead>herdr</TableHead>
                <TableHead>設定</TableHead>
                <TableHead>實際</TableHead>
                <TableHead className="text-right">cost</TableHead>
                <TableHead className="text-right">ctx</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {task.members.map((m) => {
                const pane = matched[m.name] ?? null
                const sent = dispatch.filter((d) => d.member === m.name).sort((a, b) => a.at - b.at)
                const last = sent.at(-1) ?? null
                return (
                  <TableRow key={m.name} data-testid={`member-${m.name}`} className="align-top">
                    <TableCell className="font-medium">
                      {m.name}
                      {m.wave != null && <span className="ml-1 text-xs text-muted-foreground">波 {m.wave}</span>}
                    </TableCell>
                    <TableCell>
                      <span
                        data-testid="state-status"
                        className={cn(m.status === 'blocked' && 'font-medium text-red-600 dark:text-red-400')}
                      >
                        {m.status ?? '—'}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-64 whitespace-normal">{m.current ?? '—'}</TableCell>
                    <TableCell className="max-w-64 whitespace-normal">
                      {m.todo.length === 0 ? (
                        '—'
                      ) : (
                        <ul className="list-disc pl-4">
                          {m.todo.map((t, i) => (
                            <li key={i}>{t}</li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                    <TableCell className="max-w-48 whitespace-normal">{m.blocked_by ?? '—'}</TableCell>
                    <TableCell>
                      <HerdrStatus pane={pane} />
                    </TableCell>
                    <TableCell data-testid={`member-configured-${m.name}`}>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-xs">{fmtConfigured(last)}</span>
                        {sent.length > 1 && <DispatchTimes list={sent} />}
                      </div>
                    </TableCell>
                    <TableCell data-testid={`member-actual-${m.name}`}>
                      <span className="inline-flex items-center gap-1 font-mono text-xs">
                        {pane ? fmtModelEffort(pane) : '—'}
                        {pane && modelMismatch(pane, last) && <MismatchMark testId={`member-mismatch-${m.name}`} actual={pane} configured={last} />}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono">{fmtCost(pane?.cost)}</TableCell>
                    <TableCell className="text-right font-mono">{fmtPct(pane?.ctxPct)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
