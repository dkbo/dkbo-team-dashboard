import { useState, type ReactNode } from 'react'
import { Activity, ChevronDown, ChevronUp, Coffee, Hand, Moon, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import type { OfficeSession, PaneLive } from '@dash/shared'
import { SessionRow } from '@/components/app/SessionRow'
import { Tag, type TagVariant } from '@/components/app/Tag'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { herdrHref } from '@/lib/herdr'
import { effectiveSubstate } from '@/lib/substate'
import { cn } from '@/lib/utils'
import { taskHref, taskLabel } from './format'
import { groupSessions, type SceneTask } from './model'

/** 手機「工作中」最多先列幾位 */
const MOBILE_WORKING_MAX = 3

const COLS: { key: 'needs' | 'working' | 'rest'; title: string; icon: LucideIcon; tone: TagVariant; titleClass?: string }[] = [
  { key: 'needs', title: '需要你', icon: Hand, tone: 'danger', titleClass: 'text-status-danger-fg' },
  { key: 'working', title: '工作中', icon: Activity, tone: 'ok' },
  { key: 'rest', title: '完成 · 中斷 · 閒置', icon: Coffee, tone: 'neutral' },
]

export interface OfficeListProps {
  sessions: OfficeSession[]
  offDuty: OfficeSession[]
  tasks: Record<string, SceneTask>
  panes: Record<string, PaneLive>
  selectedId: string | null
  onSelect(id: string | null): void
  /** < 768：單欄收合卡、點列就地展開（§4.5） */
  mobile: boolean
  now: number
}

/** 清單模式（§4.5）：桌機三欄 Card pane；手機三張收合卡。不載入任何 three 程式碼 */
export function OfficeList({ sessions, offDuty, tasks, panes, selectedId, onSelect, mobile, now }: OfficeListProps) {
  const [showOff, setShowOff] = useState(false)
  const groups = groupSessions(showOff ? [...sessions, ...offDuty] : sessions, now)
  const [open, setOpen] = useState<Record<string, boolean>>({ needs: true, working: true, rest: false })
  const [moreWorking, setMoreWorking] = useState(false)

  const row = (s: OfficeSession) => {
    const pane = s.paneId ? panes[s.paneId] : undefined
    const selected = s.id === selectedId
    const actions: ReactNode = (
      <div className="flex flex-wrap gap-2">
        {s.taskDir && (
          <Button asChild variant="outline" size="sm">
            <Link to={taskHref(s.project, s.taskDir)}>任務詳情</Link>
          </Button>
        )}
        {pane && (
          <Button asChild variant="outline" size="sm">
            <Link to={herdrHref(pane)}>在 herdr 開</Link>
          </Button>
        )}
      </div>
    )
    return (
      <div key={s.id} data-testid="finder-row" data-session={s.id} data-substate={effectiveSubstate(s, now)}>
        <SessionRow
          session={s}
          selected={selected}
          expanded={mobile && selected}
          onSelect={(id) => onSelect(selected ? null : id)}
          taskLabel={taskLabel(s, tasks) ?? undefined}
          actions={actions}
          now={now}
        />
      </div>
    )
  }

  const offLink = offDuty.length > 0 && (
    <button
      type="button"
      aria-pressed={showOff}
      onClick={() => setShowOff(!showOff)}
      className="inline-flex cursor-pointer items-center gap-1 self-start rounded-md px-2 py-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Moon aria-hidden className="size-3" />
      {offDuty.length} 位已下班（閒置超過 2 小時）· {showOff ? '隱藏' : '顯示'}
    </button>
  )

  if (!mobile) {
    return (
      <div data-testid="office-list" className="grid min-h-0 flex-1 gap-3 lg:grid-cols-3">
        {COLS.map((c) => (
          <Card key={c.key} variant="pane" role="region" aria-label={c.title} className="min-h-40">
            <div className="flex shrink-0 items-center gap-2 px-4 pt-4 pb-2">
              <c.icon aria-hidden className={cn('size-4', c.titleClass)} />
              <h2 className={cn('text-sm font-bold', c.titleClass)}>{c.title}</h2>
              <Tag variant={c.tone}>{groups[c.key].length}</Tag>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2">
              {groups[c.key].length === 0 ? <p className="px-2 py-3 text-xs text-muted-foreground">目前沒有人</p> : groups[c.key].map(row)}
              {c.key === 'rest' && offLink}
            </div>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div data-testid="office-list" className="flex flex-col gap-3">
      {COLS.map((c) => {
        const list = groups[c.key]
        const isOpen = open[c.key]
        const limited = c.key === 'working' && !moreWorking && list.length > MOBILE_WORKING_MAX
        const shown = limited ? list.slice(0, MOBILE_WORKING_MAX) : list
        return (
          <Card key={c.key} variant="pane" role="region" aria-label={c.title}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen((o) => ({ ...o, [c.key]: !isOpen }))}
              className="flex min-h-12 w-full cursor-pointer items-center gap-2 px-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
            >
              <h2 className={cn('text-sm font-bold', c.titleClass)}>{c.title}</h2>
              <Tag variant={c.tone}>{list.length}</Tag>
              <span className="flex-1" />
              {isOpen ? <ChevronUp aria-hidden className="size-4" /> : <ChevronDown aria-hidden className="size-4" />}
            </button>
            {isOpen && (
              <div className="flex flex-col gap-1 px-2 pb-2">
                {list.length === 0 ? <p className="px-2 py-2 text-xs text-muted-foreground">目前沒有人</p> : shown.map(row)}
                {limited && (
                  <button
                    type="button"
                    onClick={() => setMoreWorking(true)}
                    className="cursor-pointer self-start rounded-md px-2 py-1 text-xs font-semibold text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    再顯示 {list.length - MOBILE_WORKING_MAX} 位
                  </button>
                )}
                {c.key === 'rest' && offLink}
              </div>
            )}
          </Card>
        )
      })}
    </div>
  )
}
