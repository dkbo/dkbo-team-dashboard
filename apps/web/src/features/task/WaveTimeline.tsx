import { CheckCircle2, GitCommitHorizontal, XCircle } from 'lucide-react'
import type { TaskDetail, TaskWave } from '@dash/shared'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { fmtMinutes, fmtTs } from './format'
import { waveSteps } from './model'

function waveState(task: TaskDetail, w: TaskWave): { label: string; tone: string } {
  if (w.closed_at) return { label: '已關閉', tone: 'bg-muted text-muted-foreground' }
  if (task.current_wave === w.wave) return { label: '進行中', tone: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' }
  if (w.opened_at) return { label: '未關閉', tone: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' }
  return { label: '未開始', tone: 'bg-muted text-muted-foreground' }
}

function WaveRow({ task, wave }: { task: TaskDetail; wave: TaskWave }) {
  const steps = waveSteps(wave)
  const state = waveState(task, wave)
  const plan = task.brief.waves.filter((b) => b.wave === wave.wave)
  return (
    <li data-testid={`wave-${wave.wave}`} className="rounded-lg border p-3">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-medium">波 {wave.wave}</span>
        <Badge className={state.tone}>{state.label}</Badge>
        {plan.length > 0 && (
          <span className="truncate text-xs text-muted-foreground">
            {plan.map((p) => p.member).filter(Boolean).join('、')}
          </span>
        )}
      </div>
      <ol className="grid grid-cols-5 gap-1">
        {steps.map((s, i) => (
          <li key={s.key} data-testid={`step-${s.key}`} className="relative min-w-0">
            <div
              className={cn(
                'mb-1 h-1.5 rounded-full',
                s.ts ? 'bg-sky-500/70 dark:bg-sky-400/60' : 'bg-muted',
                i === 0 && 'rounded-l-full',
              )}
            />
            <div className="text-xs font-medium">{s.label}</div>
            <div className="font-mono text-xs text-muted-foreground">{fmtTs(s.ts)}</div>
            {s.sincePrev != null && s.sincePrev >= 0 && <div className="text-xs text-muted-foreground">+{fmtMinutes(s.sincePrev)}</div>}
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-col gap-1 text-xs">
        {wave.review_verdict && (
          <div className="flex gap-2">
            <span className="shrink-0 text-muted-foreground">審查</span>
            <span className="break-all">{wave.review_verdict}</span>
          </div>
        )}
        {wave.tests && (
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-muted-foreground">測試</span>
            {wave.tests_ok ? (
              <CheckCircle2 className="size-3.5 text-emerald-600" aria-label="測試通過" />
            ) : (
              <XCircle className="size-3.5 text-red-600" aria-label="測試失敗" />
            )}
            <span className="font-mono">{wave.tests}</span>
          </div>
        )}
        {wave.commits.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="shrink-0 text-muted-foreground">commit</span>
            {wave.commits.map((c) => (
              <span key={`${c.repo ?? ''}${c.sha}`} className="inline-flex items-center gap-1 font-mono">
                <GitCommitHorizontal className="size-3.5" />
                {c.repo && <span className="text-muted-foreground">{c.repo}:</span>}
                <span>{c.sha}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </li>
  )
}

export function WaveTimeline({ task }: { task: TaskDetail }) {
  return (
    <Card data-testid="wave-timeline">
      <CardHeader>
        <CardTitle>波次時間軸</CardTitle>
      </CardHeader>
      <CardContent>
        {task.waves.length === 0 ? (
          <p className="text-sm text-muted-foreground">尚無波次</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {task.waves.map((w) => (
              <WaveRow key={w.wave} task={task} wave={w} />
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
