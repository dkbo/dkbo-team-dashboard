import { useState } from 'react'
import { Check, Waypoints, X } from 'lucide-react'
import type { TaskDetail, TaskWave } from '@dash/shared'
import { EmptyState } from '@/components/app/EmptyState'
import { StatusPill, type PillLook } from '@/components/app/StatusPill'
import { Tag } from '@/components/app/Tag'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { fmtMinutes, fmtTs } from './format'
import { minutesBetween, wavePhase, waveSteps, type WavePhase, type WaveStep } from './model'

const PHASE: Record<WavePhase, PillLook> = {
  closed: { tone: 'idle', label: '已關閉', dot: 'check' },
  current: { tone: 'ok', label: '進行中', pulse: true },
  open: { tone: 'warn', label: '未關閉' },
  pending: { tone: 'idle', label: '未開始' },
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const nowTs = () => {
  const d = new Date()
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** 五步驟點＋連線（§6.26）：完成 status-ok、進行中 ring-step-current、未到空心 input */
function Steps({ steps, current }: { steps: WaveStep[]; current: boolean }) {
  // 進行中的步驟＝第一個還沒有時間的（只有進行中的波才標）
  const at = current ? steps.findIndex((s) => !s.ts) : -1
  return (
    <ol className="grid grid-cols-5 gap-x-2">
      {steps.map((s, i) => {
        const done = !!s.ts
        const now = i === at
        const nextDone = !!steps[i + 1]?.ts
        return (
          <li key={s.key} data-testid={`step-${s.key}`} className="flex min-w-0 flex-col gap-1.5">
            <div className="flex items-center gap-1" aria-hidden>
              <span
                className={cn(
                  'size-3.5 shrink-0 rounded-full',
                  done ? 'bg-status-ok' : now ? 'bg-primary ring-3 ring-card' : 'border-2 border-input bg-card',
                )}
              />
              {i < steps.length - 1 && <span className={cn('h-(--step-line-h) flex-1 rounded-full', done && nextDone ? 'bg-status-ok' : 'bg-input')} />}
            </div>
            <div className={cn('truncate text-sm font-bold', !done && !now && 'text-muted-foreground')}>{s.label}</div>
            <div className={cn('truncate font-mono text-xs', now ? 'text-primary' : 'text-muted-foreground')}>{now ? '進行中' : fmtTs(s.ts)}</div>
            {s.sincePrev != null && s.sincePrev > 0 && <div className="text-xs font-medium text-muted-foreground tabular-nums">+{fmtMinutes(s.sincePrev)}</div>}
          </li>
        )
      })}
    </ol>
  )
}

/** 收合列右側：測試 Tag（ok／danger）＋ commit Tag（neutral mono，多個時 +N） */
function WaveTags({ wave }: { wave: TaskWave }) {
  const [first, ...rest] = wave.commits
  return (
    <span className="ml-auto flex shrink-0 items-center gap-2 max-sm:hidden">
      {wave.tests && (
        <Tag variant={wave.tests_ok ? 'ok' : 'danger'} title={wave.tests}>
          {wave.tests_ok ? <Check aria-hidden /> : <X aria-hidden />}
          tests {wave.tests_ok ? 'ok' : 'fail'}
        </Tag>
      )}
      {first && (
        <Tag mono title={wave.commits.map((c) => `${c.repo ? `${c.repo}:` : ''}${c.sha}`).join(' ')}>
          {first.repo && <span>{first.repo}:</span>}
          {first.sha}
        </Tag>
      )}
      {rest.length > 0 && <Tag>+{rest.length}</Tag>}
    </span>
  )
}

/** 展開後的細節：審查結果、測試原文、多個 commit 時全列 */
function WaveDetails({ wave }: { wave: TaskWave }) {
  if (!wave.review_verdict && !wave.tests && wave.commits.length <= 1) return null
  return (
    <dl className="flex flex-col gap-1 text-xs">
      {wave.review_verdict && (
        <div className="flex gap-2">
          <dt className="shrink-0 font-semibold text-muted-foreground">審查</dt>
          <dd className="break-all">{wave.review_verdict}</dd>
        </div>
      )}
      {wave.tests && (
        <div className="flex items-center gap-2">
          <dt className="shrink-0 font-semibold text-muted-foreground">測試</dt>
          <dd className="flex items-center gap-1.5">
            {wave.tests_ok ? (
              <Check className="size-3.5 text-status-ok-fg" aria-label="測試通過" />
            ) : (
              <X className="size-3.5 text-status-danger-fg" aria-label="測試失敗" />
            )}
            <span className="font-mono">{wave.tests}</span>
          </dd>
        </div>
      )}
      {wave.commits.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <dt className="shrink-0 font-semibold text-muted-foreground">commit</dt>
          {wave.commits.map((c) => (
            <dd key={`${c.repo ?? ''}${c.sha}`} className="font-mono">
              {c.repo && <span className="text-muted-foreground">{c.repo}:</span>}
              {c.sha}
            </dd>
          ))}
        </div>
      )}
    </dl>
  )
}

function WaveRow({ task, wave }: { task: TaskDetail; wave: TaskWave }) {
  const phase = wavePhase(wave, task.current_wave)
  const [open, setOpen] = useState(false)
  const steps = waveSteps(wave)
  const members = task.brief.waves
    .filter((b) => b.wave === wave.wave)
    .map((p) => p.member)
    .filter(Boolean)
    .join('、')
  const minutes = phase === 'current' ? minutesBetween(wave.opened_at, nowTs()) : minutesBetween(wave.opened_at, wave.closed_at)
  const head = (
    <>
      <span className="shrink-0 text-sm font-bold">波 {wave.wave}</span>
      <StatusPill size="sm" {...PHASE[phase]} />
      <span className="min-w-0 truncate text-sm text-muted-foreground">
        {members}
        {phase !== 'current' && minutes != null && minutes >= 0 && ` · ${fmtMinutes(minutes)}`}
      </span>
    </>
  )

  if (phase === 'current')
    return (
      <li data-testid={`wave-${wave.wave}`} className="flex flex-col gap-3.5 rounded-lg bg-muted p-4">
        <div className="flex min-w-0 items-center gap-2.5">
          {head}
          {minutes != null && minutes >= 0 && <span className="ml-auto shrink-0 text-sm font-semibold tabular-nums">已 {fmtMinutes(minutes)}</span>}
        </div>
        <Steps steps={steps} current />
        <WaveDetails wave={wave} />
      </li>
    )

  if (phase === 'pending')
    return (
      <li data-testid={`wave-${wave.wave}`} className="flex h-11 min-w-0 items-center gap-2.5 rounded-lg bg-muted px-4 opacity-80">
        {head}
      </li>
    )

  return (
    <li data-testid={`wave-${wave.wave}`} className="flex flex-col rounded-lg bg-muted">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 min-w-0 cursor-pointer items-center gap-2.5 rounded-lg px-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {head}
        <WaveTags wave={wave} />
      </button>
      {open && (
        <div className="flex flex-col gap-3.5 px-4 pt-1 pb-4">
          <Steps steps={steps} current={false} />
          <WaveDetails wave={wave} />
        </div>
      )}
    </li>
  )
}

export function WaveTimeline({ task }: { task: TaskDetail }) {
  return (
    <Card data-testid="wave-timeline">
      <CardHeader>
        <CardTitle>
          <Waypoints aria-hidden />
          波次時間軸
        </CardTitle>
      </CardHeader>
      <CardContent>
        {task.waves.length === 0 ? (
          <EmptyState icon={Waypoints} title="尚無波次" hint="開波後會出現在這裡" />
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
