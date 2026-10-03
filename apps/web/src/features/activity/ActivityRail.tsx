import { Link } from 'react-router'
import { RotateCw, Sparkles } from 'lucide-react'
import type { ActivityItem } from '@dash/shared'
import { Skeleton } from '@/components/ui/skeleton'
import { taskHref } from '@/features/overview/ProjectCard'
import { formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { avatarFor, memberName } from './avatar'
import { useActivity } from './useActivity'

const GOOD = new Set(['DONE', 'FIXED', 'dev-done', 'wave-close', 'gate3', 'task-close'])
const BAD = new Set(['ESCALATE', 'BUG', 'BLOCKED', 'LIMIT', 'TIMEOUT', 'STOP', 'timeout'])

// 彩色外框、透明底的 type 膠囊：好消息綠、壞消息紅、其他紫
function typeClass(type: string): string {
  if (GOOD.has(type)) return 'border-emerald-500 text-emerald-700 dark:border-emerald-400 dark:text-emerald-300'
  if (BAD.has(type)) return 'border-red-500 text-red-700 dark:border-red-400 dark:text-red-300'
  return 'border-brand-violet text-violet-700 dark:text-violet-300'
}

function Row({ item, now }: { item: ActivityItem; now: number }) {
  const avatar = avatarFor(item.actor, item.taskShort)
  const name = item.actor == null ? 'leader' : memberName(item.actor, item.taskShort)
  return (
    <li>
      <Link
        to={taskHref(item.project, item.taskDir)}
        data-testid="activity-item"
        data-type={item.type}
        data-project={item.project}
        data-task={item.taskDir}
        className="flex gap-3 rounded-xl p-2.5 transition-colors hover:bg-muted"
      >
        <span
          data-testid="activity-avatar"
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-xl shadow-soft"
          style={{ backgroundColor: avatar.color }}
        >
          {avatar.emoji}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-1.5 text-sm">
            <span title={item.actor ?? undefined} className="truncate font-semibold">
              {name}
            </span>
            <span className={cn('shrink-0 rounded-full border-[1.5px] px-1.5 text-[0.7rem] leading-4 font-semibold', typeClass(item.type))}>
              {item.type}
            </span>
            <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">{formatRelative(item.at, now)}</span>
          </div>
          <p className="line-clamp-2 text-sm break-words text-muted-foreground">{item.text}</p>
          <div className="truncate text-xs text-muted-foreground">
            {item.project} · {item.taskShort}
          </div>
        </div>
      </Link>
    </li>
  )
}

/** 總覽右側活動動態欄 */
export function ActivityRail({ now, className }: { now: number; className?: string }) {
  const { items, error, reload } = useActivity()
  return (
    <aside data-testid="activity-rail" aria-label="活動動態" className={cn('flex flex-col gap-2 rounded-xl bg-card p-3 text-card-foreground shadow-soft', className)}>
      <h2 className="flex items-center gap-1.5 px-1 text-base font-bold">
        <Sparkles aria-hidden className="size-4 text-brand-violet" />
        活動動態
      </h2>
      {error && (
        <div data-testid="activity-error" role="alert" className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-sm">
          <span className="flex-1">暫時拿不到活動</span>
          <button
            type="button"
            data-testid="activity-retry"
            onClick={reload}
            className="inline-flex items-center gap-1 rounded-full border-[1.5px] border-brand-blue px-2.5 py-0.5 text-xs font-semibold hover:bg-card"
          >
            <RotateCw aria-hidden className="size-3" />
            重試
          </button>
        </div>
      )}
      {items == null ? (
        !error && (
          <div data-testid="activity-loading" className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        )
      ) : items.length === 0 ? (
        <p data-testid="activity-empty" className="px-1 py-6 text-center text-sm text-muted-foreground">
          還沒有新動態，喝口茶吧 🍵
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((it, i) => (
            <Row key={`${it.project}/${it.taskDir}/${it.source}/${it.at}/${i}`} item={it} now={now} />
          ))}
        </ul>
      )}
    </aside>
  )
}
