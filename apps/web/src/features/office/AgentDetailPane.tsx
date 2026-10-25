import { Crosshair, ListChecks, MonitorPlay, X } from 'lucide-react'
import { Link } from 'react-router'
import type { OfficeSession, PaneLive } from '@dash/shared'
import { Banner } from '@/components/app/Banner'
import { CopyCommand } from '@/components/app/CopyCommand'
import { RankTag } from '@/components/app/RankTag'
import { resumeCommand, sessionName } from '@/components/app/SessionRow'
import { SubstatePill } from '@/components/app/SubstatePill'
import { Tag } from '@/components/app/Tag'
import { Button } from '@/components/ui/button'
import { AnsiLine } from '@/features/herdr/AnsiText'
import { useHerdrScreens } from '@/features/herdr/useHerdr'
import { formatCost, formatPct } from '@/lib/format'
import { herdrHref } from '@/lib/herdr'
import { rankOf } from '@/lib/rank'
import { effectiveSubstate, SUBSTATE_META, timerText } from '@/lib/substate'
import { cn } from '@/lib/utils'
import { taskHref, taskLabel, waitingNote } from './format'
import { taskKey, type SceneTask } from './model'

const TAIL_LINES = 6

function elapsedLong(from: number | null, now: number): string {
  if (from == null) return '—'
  const sec = Math.max(0, Math.floor((now - from) / 1000))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h > 0 ? `${h} 時 ${String(m).padStart(2, '0')} 分` : `${m} 分 ${sec % 60} 秒`
}

/** 終端尾 6 行（沿用 herdr 的 screen API，2 秒一輪；分頁在背景時 useHerdrScreens 自己暫停） */
function TerminalTail({ paneId }: { paneId: string }) {
  const screens = useHerdrScreens([{ paneId }], 2000)
  const st = screens[paneId]
  const lines = st?.lines ?? []
  let end = lines.length
  while (end > 0 && lines[end - 1].every((s) => !s.text.trim())) end -= 1
  const tail = lines.slice(Math.max(0, end - TAIL_LINES), end)
  return (
    <div
      data-testid="office-terminal-tail"
      aria-label="終端最後 6 行"
      className="min-h-36 overflow-hidden rounded-lg bg-terminal-bg px-3 py-1.5 font-mono text-2xs leading-terminal whitespace-pre text-terminal-fg"
    >
      {tail.length > 0 ? tail.map((segs, i) => <AnsiLine key={i} segs={segs} />) : <span className="text-terminal-dim">{st?.error ?? '讀取終端中…'}</span>}
    </div>
  )
}

export interface AgentDetailPaneProps {
  session: OfficeSession
  pane: PaneLive | undefined
  tasks: Record<string, SceneTask>
  now: number
  onClose(): void
  onCenter(): void
  className?: string
}

/** 點選角色後的右欄（§6.9＋§6.18）。唯讀：沒有回覆／審批按鈕，去 herdr 處理 */
export function AgentDetailPane({ session: s, pane, tasks, now, onClose, onCenter, className }: AgentDetailPaneProps) {
  const sub = effectiveSubstate(s, now)
  const danger = SUBSTATE_META[sub].tone === 'danger'
  const name = sessionName(s)
  const task = s.taskDir ? tasks[taskKey(s.project, s.taskDir)] : undefined
  const where = [s.project, taskLabel(s, tasks), task?.wave ? `波 ${task.wave.current}/${task.wave.planned}` : null].filter(Boolean).join(' · ')
  const timer = timerText(s, now, { long: true })
  // 這輪還沒結束（進行中、等你、錯誤停在這輪）才算「這輪跑了」
  const inTurn = SUBSTATE_META[sub].paneStatus === 'working' || danger
  const toolText = s.tool ? [s.tool.name, s.tool.summary].filter(Boolean).join(' ') : null

  return (
    <aside data-testid="office-detail" data-session={s.id} aria-label={`${name} 詳情`} className={cn('flex min-h-0 flex-col overflow-y-auto', className)}>
      <div className="flex items-start gap-3 border-b p-4">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-base font-bold text-accent-foreground">
          {name.charAt(0).toUpperCase()}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <h2 className="min-w-0 truncate text-base font-bold">
              {name}
              {s.leader && <span aria-label="leader"> 👑</span>}
            </h2>
            {s.role && <Tag variant="brand">{s.role}</Tag>}
            <Tag mono>{s.kind}</Tag>
          </div>
          <RankTag rank={rankOf(s.kind, s.model)} model={s.model} effort={s.effort} kind={s.kind} className="self-start" />
          {where && <p className="truncate text-sm text-muted-foreground">{where}</p>}
        </div>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="關閉詳情" onClick={onClose}>
          <X />
        </Button>
      </div>

      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SubstatePill substate={sub} tool={s.tool?.name} note={sub === 'waiting' ? waitingNote(s) : undefined} />
          {timer && <span className={cn('tabular-nums', danger ? 'text-sm font-bold text-status-danger-fg' : 'text-xs font-semibold text-muted-foreground')}>{timer}</span>}
        </div>

        {sub === 'waiting' && (
          <Banner tone="danger" title={s.question ?? '等你審批（問句請看終端或 herdr）'}>
            {toolText && <code className="font-mono text-xs break-all">{toolText}</code>}
          </Banner>
        )}
        {sub === 'error' && (
          <Banner tone="danger" title="這輪出錯">
            <code className="font-mono text-xs break-all">{s.error ?? '（沒有錯誤原文）'}</code>
          </Banner>
        )}

        <dl className="flex flex-col text-sm">
          {[
            ['目前工具', toolText ? <code className="truncate font-mono text-xs">{toolText}</code> : '—'],
            ['這輪跑了', <span className="font-bold tabular-nums">{inTurn ? elapsedLong(s.turnStartedAt, now) : '—'}</span>],
            ['模型', s.model ? <Tag variant="brand" mono>{[s.model, s.effort].filter(Boolean).join(' · ')}</Tag> : '—'],
            ['ctx', <span className="tabular-nums">{formatPct(s.ctxPct)}</span>],
            ['花費', <span className="tabular-nums">{formatCost(s.cost)}</span>],
          ].map(([k, v], i) => (
            <div key={i} className="flex min-h-9 items-center justify-between gap-3 border-b last:border-b-0">
              <dt className="shrink-0 text-muted-foreground">{k}</dt>
              <dd className="min-w-0 truncate text-right">{v}</dd>
            </div>
          ))}
        </dl>

        {s.paneId && <TerminalTail paneId={s.paneId} />}

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-muted-foreground">resume 指令</span>
          <CopyCommand command={resumeCommand(s)} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {s.taskDir ? (
            <Button asChild variant="outline" size="sm">
              <Link to={taskHref(s.project, s.taskDir)}>
                <ListChecks />
                任務詳情
              </Link>
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" disabled>
              <ListChecks />
              任務詳情
            </Button>
          )}
          {pane ? (
            <Button asChild variant="outline" size="sm">
              <Link to={herdrHref(pane)}>
                <MonitorPlay />
                在 herdr 開
              </Link>
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" disabled title="這個 session 沒有對到 herdr pane">
              <MonitorPlay />
              在 herdr 開
            </Button>
          )}
          <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={onCenter}>
            <Crosshair />
            置中
          </Button>
        </div>
      </div>
    </aside>
  )
}
