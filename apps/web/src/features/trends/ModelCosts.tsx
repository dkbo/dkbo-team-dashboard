import { Link } from 'react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCost } from '@/lib/format'
import { fmtConfigured, fmtModelEffort, type MismatchPane, type ModelCost, type TierCost } from '@/lib/modelcost'
import { taskDisplay, type ProjectLike } from './model'

const EMPTY = '這段期間沒有花費'

function LabelCostList({ rows, testId }: { rows: { label: string; cost: number }[]; testId: string }) {
  if (rows.length === 0) return <p className="py-4 text-center text-sm text-muted-foreground">{EMPTY}</p>
  return (
    <ul className="flex flex-col divide-y text-sm">
      {rows.map((r, i) => (
        <li key={i} data-testid={`${testId}-${i}`} className="flex items-baseline justify-between gap-4 py-1.5">
          <span className="min-w-0 break-words">{r.label}</span>
          <span className="shrink-0 font-mono tabular-nums">{formatCost(r.cost)}</span>
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
        <CardTitle>依模型／effort 花費（實際：herdr 回報）</CardTitle>
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
        <CardTitle>依派工檔位花費（設定：dkbo 派工）</CardTitle>
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
      <span className="mr-1 text-xs text-muted-foreground">{label}</span>
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
        <CardTitle className="flex items-baseline gap-3">
          實際與設定不一致
          <span className="font-mono text-base tabular-nums">{formatCost(mismatch.cost)}</span>
        </CardTitle>
        <CardDescription>herdr 回報的 model／effort 跟派工檔位推出的不同的花費段</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y text-sm">
          {mismatch.panes.map((p, i) => {
            const t = p.project != null && p.taskDir != null ? lookup(p.project, p.taskDir) : null
            return (
              <li key={i} data-testid={`mismatch-row-${i}`} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2">
                <Field label="專案">{p.project ?? '未知'}</Field>
                <Field label="任務">
                  {t?.linkable ? (
                    <Link to={`/p/${encodeURIComponent(p.project!)}/t/${encodeURIComponent(p.taskDir!)}`} className="underline-offset-4 hover:underline" title={p.taskDir!}>
                      {t.display}
                    </Link>
                  ) : (
                    <span className="font-mono text-xs">{p.taskDir ?? '未知'}</span>
                  )}
                </Field>
                <Field label="成員">{p.member ?? '未知'}</Field>
                <Field label="實際" testId="mismatch-actual">
                  {fmtModelEffort(p.actual)}
                </Field>
                <Field label="設定" testId="mismatch-configured">
                  {fmtModelEffort(p.configured)}
                </Field>
                <span className="ml-auto font-mono tabular-nums">{formatCost(p.cost)}</span>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
