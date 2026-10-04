import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Check, Copy, Info, ListChecks, MonitorPlay, TriangleAlert } from 'lucide-react'
import type { PaneLive, TaskDetail } from '@dash/shared'
import { PageHeader } from '@/components/app/PageHeader'
import { StatusPill, taskStatusPill } from '@/components/app/StatusPill'
import { Tag } from '@/components/app/Tag'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { herdrHref } from '@/lib/herdr'
import { fmtTs } from './format'
import { skippedTotal } from './model'

/** 頁首「複製 focus 指令」：複製 `herdr agent focus <pane>`，成功後短暫顯示「已複製」 */
function CopyFocus({ paneId }: { paneId: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`herdr agent focus ${paneId}`)
      setCopied(true)
    } catch {
      // 非安全來源或被拒：成員表 hover 仍有可選取的指令
    }
  }
  return (
    <Button type="button" variant="ghost" size="sm" aria-label="複製 focus 指令" title={`herdr agent focus ${paneId}`} onClick={copy}>
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copied ? '已複製' : '複製 focus 指令'}
    </Button>
  )
}

/** Breadcrumb 下的頁首：任務名、專案 · dir · 分支、狀態膠囊；工具列「看 herdr」「複製 focus 指令」 */
export function TaskHeader({ project, task, pane }: { project: string; task: TaskDetail; /** 頁首動作對準的成員 pane */ pane: PaneLive | null }) {
  const skipped = skippedTotal(task.skipped_lines)
  return (
    <div data-testid="task-header" className="flex flex-col gap-3">
      <PageHeader
        icon={ListChecks}
        title={task.display ?? task.dir}
        subtitle={[project, task.dir, task.branch].filter(Boolean).join(' · ')}
        meta={
          <>
            <StatusPill {...taskStatusPill(task.status)} />
            {skipped > 0 && (
              <Tag variant="warn">
                <TriangleAlert aria-hidden />
                {skipped} 行無法解析
              </Tag>
            )}
          </>
        }
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to={pane ? herdrHref(pane) : '/herdr'}>
                <MonitorPlay aria-hidden />看 herdr
              </Link>
            </Button>
            {pane && <CopyFocus paneId={pane.paneId} />}
          </>
        }
      />
    </div>
  )
}

function Meta({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3 border-b py-1.5 last:border-0">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-mono text-xs">{children}</dd>
    </div>
  )
}

/** 右欄「任務資訊」：目標＋dl（資料夾、分支、建立、關卡①、波進度、最後更新／結案） */
export function TaskInfoCard({ task }: { task: TaskDetail }) {
  const closed = task.status === 'done' || task.status === 'abandoned'
  return (
    <Card data-testid="task-info">
      <CardHeader>
        <CardTitle>
          <Info aria-hidden />
          任務資訊
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {task.brief.goal && <p className="whitespace-pre-line text-muted-foreground">{task.brief.goal}</p>}
        <dl className="flex flex-col">
          <Meta label="資料夾">{task.dir}</Meta>
          <Meta label="分支">{task.branch ?? '—'}</Meta>
          <Meta label="建立">{fmtTs(task.created_at)}</Meta>
          <Meta label="關卡① 放行">{fmtTs(task.gate1_at)}</Meta>
          <Meta label="波進度">
            <span className="font-sans font-bold tabular-nums">
              {task.waves_closed}/{task.waves_planned} 波
            </span>
          </Meta>
          {closed ? (
            <Meta label={`結案 ${fmtTs(task.closed_at)}`}>{task.close_result ?? '—'}</Meta>
          ) : (
            <Meta label="最後更新">{fmtTs(task.updated_at)}</Meta>
          )}
        </dl>
      </CardContent>
    </Card>
  )
}
