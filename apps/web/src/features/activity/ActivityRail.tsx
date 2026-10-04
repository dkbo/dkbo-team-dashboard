import { useState } from 'react'
import { Link } from 'react-router'
import { ChevronDown, ListTodo, RotateCw, Sparkles } from 'lucide-react'
import type { ActivityItem } from '@dash/shared'
import { Banner, BannerAction } from '@/components/app/Banner'
import { EmptyState } from '@/components/app/EmptyState'
import { SegmentedControl } from '@/components/app/SegmentedControl'
import { StatusDot } from '@/components/app/StatusDot'
import { Tag, activityTagVariant } from '@/components/app/Tag'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { taskHref } from '@/features/overview/ProjectCard'
import { formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { avatarFor, memberName } from './avatar'
import { collapseGroup, filterActivity, groupActivity, isLeaderItem, type ActivityFilter, type ActivityGroupData } from './model'
import { useActivity } from './useActivity'

/** < lg 只顯示最新幾則（分組後） */
export const MOBILE_ITEMS = 5

const rowFocus = 'outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset motion-reduce:transition-none'
const mobileHidden = (hide: boolean) => hide && 'max-lg:hidden'

/** §6.23：成員訊息 default（24px 頭像＋actor）；leader／process 事件 compact（狀態點、不重複頭像與 actor） */
function Row({ item, now, showTime, hide }: { item: ActivityItem; now: number; showTime: boolean; hide: boolean }) {
  const compact = isLeaderItem(item)
  const avatar = avatarFor(item.actor, item.taskShort)
  return (
    <li className={cn(mobileHidden(hide))}>
      <Link
        to={taskHref(item.project, item.taskDir)}
        data-testid="activity-item"
        data-type={item.type}
        data-project={item.project}
        data-task={item.taskDir}
        data-variant={compact ? 'compact' : 'default'}
        className={cn('flex gap-2.5 rounded-lg px-2', compact ? 'py-1.5' : 'py-2', rowFocus)}
      >
        {compact ? (
          <span className="flex size-6 shrink-0 items-center justify-center">
            <StatusDot tone="idle" size="sm" />
          </span>
        ) : (
          <span
            data-testid="activity-avatar"
            aria-hidden
            className="flex size-6 shrink-0 items-center justify-center rounded-full text-sm"
            style={{ backgroundColor: avatar.color }}
          >
            {avatar.emoji}
          </span>
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-1.5">
            {!compact && item.actor != null && (
              <span title={item.actor} className="truncate text-sm font-semibold">
                {memberName(item.actor, item.taskShort)}
              </span>
            )}
            <Tag variant={activityTagVariant(item.type)}>{item.type}</Tag>
            {showTime && <span className="ml-auto shrink-0 text-xs font-medium text-muted-foreground tabular-nums">{formatRelative(item.at, now)}</span>}
          </div>
          <p title={item.text} className="line-clamp-2 text-sm break-words text-muted-foreground">
            {item.text}
          </p>
        </div>
      </Link>
    </li>
  )
}

/** §6.22：組頭連到任務＋時間線組身；組內 > 4 則收成「再看 N 則」 */
interface GroupProps {
  group: ActivityGroupData
  now: number
  /** 這組第一則在全欄（已畫出的）序號；序號 ≥ limit 的在 < lg 藏起來 */
  start: number
  limit: number | null
  expanded: boolean
  onExpand: () => void
}

function Group({ group, now, start, limit, expanded, onExpand }: GroupProps) {
  const { shown, hidden } = shownItems(group, expanded)
  const hideAt = (i: number) => limit != null && start + i >= limit
  return (
    <li data-testid="activity-group" data-task={group.taskDir} data-project={group.project} className={cn('flex flex-col gap-1', mobileHidden(hideAt(0)))}>
      <Link to={taskHref(group.project, group.taskDir)} className={cn('flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5', rowFocus)}>
        <ListTodo aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 truncate text-xs">
          <span className="font-bold text-foreground">{group.taskShort}</span>
          <span className="font-medium text-muted-foreground"> · {group.project}</span>
        </span>
        <span className="ml-auto shrink-0 text-xs font-medium text-muted-foreground tabular-nums">{formatRelative(group.at, now)}</span>
      </Link>
      <ol className="ml-4 flex flex-col gap-1 border-l-2 pl-3">
        {shown.map((it, i) => (
          <Row key={`${it.source}/${it.at}/${i}`} item={it} now={now} showTime={i > 0} hide={hideAt(i)} />
        ))}
      </ol>
      {hidden > 0 && (
        <button
          type="button"
          onClick={onExpand}
          className={cn(
            'ml-4 w-fit cursor-pointer rounded-full px-3 py-0.5 text-xs font-semibold text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50',
            mobileHidden(hideAt(shown.length - 1)),
          )}
        >
          再看 {hidden} 則
        </button>
      )}
    </li>
  )
}

const shownItems = (g: ActivityGroupData, expanded: boolean) => (expanded ? { shown: g.items, hidden: 0 } : collapseGroup(g.items))

function RailSkeleton() {
  return (
    <div data-testid="activity-loading" className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
        </div>
      ))}
    </div>
  )
}

/** §6.21 總覽活動欄 */
export function ActivityRail({ now, className }: { now: number; className?: string }) {
  const { items, error, reload } = useActivity()
  const [filter, setFilter] = useState<ActivityFilter>('all')
  const [showAll, setShowAll] = useState(false)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const attention = items ? filterActivity(items, 'attention').length : 0
  const visible = items ? filterActivity(items, filter) : []
  const groups = groupActivity(visible)
  const limit = showAll ? null : MOBILE_ITEMS
  // 每組畫出來的則數（收合後）依序累加，決定手機上哪些要藏；總數 rendered 也是「看全部活動（N）」的 N 與出現條件
  let rendered = 0
  const starts = groups.map((g) => {
    const s = rendered
    rendered += shownItems(g, expanded.has(g.key)).shown.length
    return s
  })

  return (
    <aside data-testid="activity-rail" aria-label="活動動態" className={cn('flex flex-col gap-3 rounded-xl bg-card p-3 text-card-foreground shadow-soft', className)}>
      <div className="flex flex-wrap items-center gap-2 px-2 pt-1 pb-2">
        <h2 className="flex items-center gap-1.5 text-base font-bold">
          <Sparkles aria-hidden className="size-4 text-brand-violet" />
          活動動態
        </h2>
        {items != null && items.length > 0 && (
          <SegmentedControl
            size="sm"
            data-testid="activity-filter"
            aria-label="活動篩選"
            className="ml-auto"
            items={[
              { value: 'all', label: '全部' },
              { value: 'attention', label: '需處理', count: attention > 0 ? attention : undefined },
            ]}
            value={filter}
            onChange={setFilter}
          />
        )}
      </div>
      {error && (
        <Banner
          data-testid="activity-error"
          tone="warn"
          size="sm"
          title="暫時拿不到活動"
          action={
            <BannerAction data-testid="activity-retry" onClick={reload}>
              <RotateCw aria-hidden />
              重試
            </BannerAction>
          }
        />
      )}
      {items == null ? (
        !error && <RailSkeleton />
      ) : items.length === 0 ? (
        <EmptyState data-testid="activity-empty" icon="🍵" title="還沒有新動態，喝口茶吧" />
      ) : groups.length === 0 ? (
        <EmptyState title="沒有要處理的事 ✨" />
      ) : (
        <>
          <ol className="flex flex-col gap-3">
            {groups.map((g, i) => (
              <Group
                key={g.key}
                group={g}
                now={now}
                start={starts[i]}
                limit={limit}
                expanded={expanded.has(g.key)}
                onExpand={() => setExpanded(new Set(expanded).add(g.key))}
              />
            ))}
          </ol>
          {limit != null && rendered > limit && (
            <Button variant="outline" data-testid="activity-show-all" onClick={() => setShowAll(true)} className="w-full lg:hidden">
              看全部活動（{rendered}）
              <ChevronDown aria-hidden />
            </Button>
          )}
        </>
      )}
    </aside>
  )
}
