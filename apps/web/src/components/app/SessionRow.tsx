import type { ReactNode } from 'react'
import { Terminal } from 'lucide-react'
import type { OfficeSession } from '@dash/shared'
import { useNow } from '@/hooks/useNow'
import { RANK_LABEL, rankOf, starsOf } from '@/lib/rank'
import { effectiveSubstate, needsYou, timerText } from '@/lib/substate'
import { cn } from '@/lib/utils'
import { CopyCommand } from './CopyCommand'
import { EffortStars } from './EffortStars'
import { SubstatePill } from './SubstatePill'
import { Tag } from './Tag'

export interface SessionRowProps {
  session: OfficeSession
  selected?: boolean
  /** 手機：就地展開 resume 指令列 */
  expanded?: boolean
  onSelect: (id: string) => void
  /** 任務顯示名；沒給就從 taskDir 去掉日期前綴 */
  taskLabel?: string
  /** 展開時接在 resume 列之後的動作（任務詳情、在 herdr 開…由頁面決定網址） */
  actions?: ReactNode
  /** 測試或同頁共用一個時鐘時傳入；沒給就自己每 10 秒更新 */
  now?: number
  className?: string
}

const RANK_DOT = {
  senior: 'bg-rank-senior',
  mid: 'bg-rank-mid',
  junior: 'bg-rank-junior',
  visitor: 'bg-rank-visitor',
} as const

/** 2026-10-24-office → office */
const shortTask = (dir: string) => dir.replace(/^\d{4}-\d{2}-\d{2}-/, '')

export const sessionName = (s: OfficeSession) => s.member ?? s.agentName ?? `${s.kind} ${s.sessionId.slice(0, 6)}`

export const resumeCommand = (s: Pick<OfficeSession, 'kind' | 'sessionId'>) =>
  s.kind === 'codex' ? `codex resume ${s.sessionId}` : `claude --resume ${s.sessionId}`

/** 清單模式、手機的一列 session（§6.10、§6.18） */
export function SessionRow({ session, selected = false, expanded = false, onSelect, taskLabel, actions, now: nowProp, className }: SessionRowProps) {
  const tick = useNow(10_000)
  const now = nowProp ?? tick
  // 沒有存活 pane 的錯誤沒人能處理：10 分後轉閒置，期間也不算需要你（lobby AC2）
  const pane = { hasPane: session.paneId != null }
  const sub = effectiveSubstate(session, now, pane)
  const danger = needsYou(session, now, pane)
  const name = sessionName(session)
  const rank = rankOf(session.kind, session.model)
  const stars = starsOf(session.kind, session.effort)
  const timer = timerText(session, now, pane)
  const where = [session.project, taskLabel ?? (session.taskDir ? shortTask(session.taskDir) : null), session.role].filter(Boolean).join(' · ')
  const toolLine = session.tool ? (session.tool.summary ?? session.tool.name) : null

  return (
    <div
      data-slot="session-row"
      data-session={session.id}
      data-substate={sub}
      data-selected={selected}
      className={cn(
        'rounded-lg transition-colors duration-150 motion-reduce:transition-none',
        danger ? 'bg-status-danger-soft hover:shadow-soft' : selected ? 'bg-accent text-accent-foreground' : 'bg-transparent',
        danger && selected && 'ring-2 ring-ring',
        className,
      )}
    >
      <button
        type="button"
        data-slot="session-main"
        aria-pressed={selected}
        aria-expanded={expanded}
        onClick={() => onSelect(session.id)}
        className={cn(
          'flex min-h-11 w-full min-w-0 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset',
          !danger && 'transition-colors duration-150 hover:bg-muted motion-reduce:transition-none',
        )}
      >
        <span
          data-slot="session-avatar"
          aria-hidden
          className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-xs font-bold text-accent-foreground"
        >
          {name.charAt(0).toUpperCase()}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <span data-slot="session-name" className="min-w-0 truncate text-sm font-bold">
              {name}
              {session.leader && <span aria-label="leader"> 👑</span>}
            </span>
            <Tag mono>{session.kind}</Tag>
            <span
              data-slot="rank-dot"
              role="img"
              aria-label={`職等 ${RANK_LABEL[rank]}`}
              title={`職等 ${RANK_LABEL[rank]}`}
              className={cn('size-2.5 shrink-0 rounded-full border-(length:--border-w-hair) border-foreground/55', RANK_DOT[rank])}
            />
            <EffortStars level={stars} size="sm" />
          </span>
          {where && <span className="truncate text-xs text-muted-foreground">{where}</span>}
          {toolLine && (
            <span data-slot="session-tool" className="flex min-w-0 items-center gap-1 text-muted-foreground">
              <Terminal aria-hidden className="size-3 shrink-0" />
              <code className="min-w-0 truncate font-mono text-2xs">{toolLine}</code>
            </span>
          )}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <SubstatePill substate={sub} tool={session.tool?.name} size="sm" />
          {timer && (
            <span
              data-slot="session-timer"
              className={cn('text-xs font-semibold tabular-nums', danger ? 'text-status-danger-fg' : 'text-muted-foreground')}
            >
              {timer}
            </span>
          )}
        </span>
      </button>
      {expanded && (
        <div data-slot="session-expanded" className="flex flex-col gap-2 pr-3 pb-3 pl-9">
          <CopyCommand command={resumeCommand(session)} />
          {actions}
        </div>
      )}
    </div>
  )
}
