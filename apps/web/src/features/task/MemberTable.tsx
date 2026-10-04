import { Link } from 'react-router'
import { MonitorPlay, Users } from 'lucide-react'
import { modelMismatch, type Dispatch, type PaneLive, type TaskDetail } from '@dash/shared'
import { CopyCommand } from '@/components/app/CopyCommand'
import { EmptyState } from '@/components/app/EmptyState'
import { MismatchMark } from '@/components/app/MismatchMark'
import { StatusPill, type PillLook } from '@/components/app/StatusPill'
import { Tag } from '@/components/app/Tag'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { formatStamp } from '@/features/trends/model'
import { herdrHref } from '@/lib/herdr'
import { fmtConfigured, fmtModelEffort } from '@/lib/modelcost'
import { cn } from '@/lib/utils'
import { fmtCost, fmtPct } from './format'

/** 成員 state 檔的 status → StatusPill 外觀（§1.4：blocked＝danger、working＝ok、done＝ok＋✓，其他 idle）；文字保留原文 */
function memberStateLook(status: string): PillLook {
  if (status === 'blocked') return { tone: 'danger', label: status, pulse: true }
  if (status === 'working') return { tone: 'ok', label: status, pulse: true }
  if (status === 'done') return { tone: 'ok', label: status, dot: 'check' }
  return { tone: 'idle', label: status }
}

/** herdr 欄：StatusPill（hover／focus 出 model／effort 與複製 focus 指令）＋「看畫面」icon button */
function HerdrStatus({ pane }: { pane: PaneLive | null }) {
  if (!pane)
    return (
      <div data-testid="herdr-status" className="flex items-center">
        <StatusPill status="unknown" label="無 pane" />
      </div>
    )
  const me = [pane.model, pane.effort].filter(Boolean).join(' / ')
  return (
    <div data-testid="herdr-status" className="flex items-center gap-1">
      <HoverCard openDelay={150} closeDelay={100}>
        <HoverCardTrigger asChild>
          <span tabIndex={0} className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <StatusPill status={pane.status} interactive />
          </span>
        </HoverCardTrigger>
        <HoverCardContent align="start" className="flex w-72 flex-col gap-2">
          {me && <p className="text-xs font-medium text-muted-foreground">{me}</p>}
          <CopyCommand command={`herdr agent focus ${pane.paneId}`} />
        </HoverCardContent>
      </HoverCard>
      <Button asChild variant="ghost" size="icon-sm">
        <Link to={herdrHref(pane)} data-testid="watch-pane" aria-label="看畫面" title="看畫面">
          <MonitorPlay aria-hidden />
        </Link>
      </Button>
    </div>
  )
}

/** 派過多次時的「共 N 次」，hover 列出每次派工 */
function DispatchTimes({ list }: { list: Dispatch[] }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="w-fit cursor-help rounded-full text-xs font-medium text-muted-foreground underline decoration-dotted underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
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

/** 「目前」欄（多行，§6.19 inset-y-md）：目前在做什麼；下接待辦（caption 清單）與卡在什麼（danger） */
function CurrentCell({ current, todo, blockedBy, blocked }: { current: string | null; todo: string[]; blockedBy: string | null; blocked: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className={cn(blocked && 'font-semibold text-status-danger-fg', !current && 'text-muted-foreground')}>{current ?? '—'}</span>
      {todo.length > 0 && (
        <ul aria-label="待辦" className="list-disc pl-4 text-xs font-medium text-muted-foreground">
          {todo.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      )}
      {blockedBy && <span className="text-xs font-semibold text-status-danger-fg">卡在：{blockedBy}</span>}
    </div>
  )
}

/** 數字欄：沒有值（—）灰字 */
const dimIfNone = (v: string) => cn('text-right tabular-nums', v === '—' && 'text-muted-foreground')

export function MemberTable({ task, panes, dispatch = [] }: { task: TaskDetail; panes: Record<string, PaneLive | null>; dispatch?: Dispatch[] }) {
  return (
    <Card data-testid="member-table" className={cn(task.members.length > 0 && 'pb-2')}>
      <CardHeader>
        <CardTitle>
          <Users aria-hidden />
          成員
          <Tag count={task.members.length} />
        </CardTitle>
      </CardHeader>
      {task.members.length === 0 ? (
        <CardContent>
          <EmptyState icon={Users} title="沒有成員 state 檔" hint="開波派工後會出現" />
        </CardContent>
      ) : (
        <CardContent className="px-0">
          <Table flush>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>成員</TableHead>
                <TableHead>state</TableHead>
                <TableHead>目前</TableHead>
                <TableHead>herdr</TableHead>
                <TableHead>設定</TableHead>
                <TableHead>實際</TableHead>
                <TableHead className="text-right">cost</TableHead>
                <TableHead className="text-right">ctx</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {task.members.map((m) => {
                const pane = panes[m.name] ?? null
                const sent = dispatch.filter((d) => d.member === m.name).sort((a, b) => a.at - b.at)
                const last = sent.at(-1) ?? null
                const cost = fmtCost(pane?.cost)
                const ctx = fmtPct(pane?.ctxPct)
                return (
                  <TableRow key={m.name} data-testid={`member-${m.name}`} className={cn(m.status === 'blocked' && 'bg-status-danger-soft hover:bg-status-danger-soft')}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-semibold">{m.name}</span>
                        {m.wave != null && <span className="text-xs font-medium text-muted-foreground tabular-nums">波 {m.wave}</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      {m.status ? (
                        <StatusPill data-testid="state-status" size="sm" {...memberStateLook(m.status)} />
                      ) : (
                        <span data-testid="state-status" className="text-muted-foreground">
                          —
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-72 min-w-44 py-3 whitespace-normal">
                      <CurrentCell current={m.current} todo={m.todo} blockedBy={m.blocked_by} blocked={m.status === 'blocked'} />
                    </TableCell>
                    <TableCell>
                      <HerdrStatus pane={pane} />
                    </TableCell>
                    <TableCell data-testid={`member-configured-${m.name}`} className="py-3">
                      <div className="flex flex-col gap-0.5">
                        {last ? (
                          <Tag variant="brand" mono>
                            {fmtConfigured(last)}
                          </Tag>
                        ) : (
                          <span className="text-muted-foreground">{fmtConfigured(last)}</span>
                        )}
                        {sent.length > 1 && <DispatchTimes list={sent} />}
                      </div>
                    </TableCell>
                    <TableCell data-testid={`member-actual-${m.name}`}>
                      <span className={cn('inline-flex items-center gap-1 font-mono text-xs', !pane && 'text-muted-foreground')}>
                        {pane ? fmtModelEffort(pane) : '—'}
                        {pane && modelMismatch(pane, last) && <MismatchMark testId={`member-mismatch-${m.name}`} actual={pane} configured={last} />}
                      </span>
                    </TableCell>
                    <TableCell className={dimIfNone(cost)}>{cost}</TableCell>
                    <TableCell className={dimIfNone(ctx)}>{ctx}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      )}
    </Card>
  )
}
