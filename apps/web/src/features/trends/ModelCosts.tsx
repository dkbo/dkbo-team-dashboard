import { Link } from 'react-router'
import { Coins, Layers, Sparkles, TriangleAlert } from 'lucide-react'
import { EmptyState } from '@/components/app/EmptyState'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCost } from '@/lib/format'
import { fmtConfigured, fmtModelEffort, type MismatchPane, type ModelCost, type TierCost } from '@/lib/modelcost'
import { taskDisplay, type ProjectLike } from './model'

const EMPTY = '這段期間沒有花費'

function LabelCostList({ rows, testId }: { rows: { label: string; cost: number }[]; testId: string }) {
  if (rows.length === 0) return <EmptyState icon={Coins} title={EMPTY} />
  return (
    <ul className="flex flex-col text-sm">
      {rows.map((r, i) => (
        <li key={i} data-testid={`${testId}-${i}`} className="flex min-h-9 items-center justify-between gap-4 border-b py-1.5 last:border-0">
          <span className="min-w-0 break-words">{r.label}</span>
          <span className="shrink-0 tabular-nums">{formatCost(r.cost)}</span>
        </li>
      ))}
    </ul>
  )
}

const byCost = <T extends { cost: number }>(xs: T[] | undefined) => [...(xs ?? [])].sort((a, b) => b.cost - a.cost)

export function ActualCosts({ byActual }: { byActual: ModelCost[] | undefined }) {
  return (
    <Card data-testid="cost-by-actual">
      <CardHeader>
        <CardTitle>
          <Sparkles aria-hidden />
          依模型／effort 花費（實際：herdr 回報）
        </CardTitle>
        <CardDescription>取樣當下 herdr 回報的 model／effort；舊樣本或 herdr 沒回報的歸「未知」</CardDescription>
      </CardHeader>
      <CardContent>
        <LabelCostList testId="cost-actual" rows={byCost(byActual).map((r) => ({ label: fmtModelEffort(r), cost: r.cost }))} />
      </CardContent>
    </Card>
  )
}

export function ConfiguredCosts({ byConfigured }: { byConfigured: TierCost[] | undefined }) {
  return (
    <Card data-testid="cost-by-configured">
      <CardHeader>
        <CardTitle>
          <Layers aria-hidden />
          依派工檔位花費（設定：dkbo 派工）
        </CardTitle>
        <CardDescription>kind 檔位 · model/effort，由派工紀錄與專案現在的 roles／kinds 檔推出；對不到派工的歸「未知」</CardDescription>
      </CardHeader>
      <CardContent>
        <LabelCostList testId="cost-configured" rows={byCost(byConfigured).map((r) => ({ label: fmtConfigured(r), cost: r.cost }))} />
      </CardContent>
    </Card>
  )
}

function Field({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) {
  return (
    <span data-testid={testId} className="min-w-0 break-words">
      <span className="mr-1 text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </span>
  )
}

/** 有不一致的花費段才顯示：一列一組 (pane, 實際, 設定) */
export function MismatchCosts({ mismatch, projects }: { mismatch: { cost: number; panes: MismatchPane[] } | undefined; projects: ProjectLike[] | undefined }) {
  if (!mismatch || mismatch.panes.length === 0) return null
  const lookup = taskDisplay(projects)
  return (
    <Card data-testid="cost-mismatch">
      <CardHeader>
        <CardTitle className="gap-3">
          <span className="inline-flex items-center gap-1.5">
            <TriangleAlert aria-hidden className="size-4 shrink-0 text-brand-violet" />
            實際與設定不一致
          </span>
          <span className="tabular-nums">{formatCost(mismatch.cost)}</span>
        </CardTitle>
        <CardDescription>herdr 回報的 model／effort 跟派工檔位推出的不同的花費段</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col text-sm">
          {mismatch.panes.map((p, i) => {
            const t = p.project != null && p.taskDir != null ? lookup(p.project, p.taskDir) : null
            return (
              <li key={i} data-testid={`mismatch-row-${i}`} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b py-2 last:border-0">
                <Field label="專案">{p.project ?? '未知'}</Field>
                <Field label="任務">
                  {t?.linkable ? (
                    <Link
                      to={`/p/${encodeURIComponent(p.project!)}/t/${encodeURIComponent(p.taskDir!)}`}
                      className="rounded-full font-semibold underline-offset-4 outline-none hover:text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                      title={p.taskDir!}
                    >
                      {t.display}
                    </Link>
                  ) : (
                    <span className="font-mono text-xs text-muted-foreground">{p.taskDir ?? '未知'}</span>
                  )}
                </Field>
                <Field label="成員">{p.member ?? '未知'}</Field>
                <Field label="實際" testId="mismatch-actual">
                  {fmtModelEffort(p.actual)}
                </Field>
                <Field label="設定" testId="mismatch-configured">
                  {fmtModelEffort(p.configured)}
                </Field>
                <span className="ml-auto tabular-nums">{formatCost(p.cost)}</span>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
