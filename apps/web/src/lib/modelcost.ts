// 花費的「實際」（herdr 回報的 model／effort）與「設定」（dkbo 派工的 kind／檔位）的顯示與彙總。
// 型別與計算規則（歸屬、不一致判定、檔位計數）一律用 @dash/shared 的，這裡只做顯示與 /history 分析卡的彙總。

import { countsForTiers, tierCounts, type Dispatch, type MismatchPane, type ModelEffort, type TierCost } from '@dash/shared'

export type { Dispatch, MemberInfo, MismatchPane, ModelCost, ModelEffort, Tier, TierCost } from '@dash/shared'

export const UNKNOWN = '未知'

const val = (v: string | null | undefined) => v ?? UNKNOWN

/** `model/effort`；兩者都 null（或整個沒有）顯示「未知」 */
export function fmtModelEffort(x: Partial<ModelEffort> | null | undefined): string {
  if (x?.model == null && x?.effort == null) return UNKNOWN
  return `${val(x.model)}/${val(x.effort)}`
}

/** 設定：`kind tier · model/effort`；全 null 顯示「未知」 */
export function fmtConfigured(x: { kind: string | null; tier: string | null; model: string | null; effort: string | null } | null | undefined): string {
  if (x == null || (x.kind == null && x.tier == null)) return fmtModelEffort(x)
  return `${val(x.kind)} ${val(x.tier)} · ${fmtModelEffort(x)}`
}

/** 成員旁的檔位標記：`L · opus/high` */
export function fmtTier(x: Pick<Dispatch, 'tier' | 'model' | 'effort'> | null | undefined): string {
  return x == null ? UNKNOWN : `${x.tier} · ${fmtModelEffort(x)}`
}

/** 不一致標記的 tooltip（文字寫死） */
export function mismatchTip(actual: ModelEffort | null | undefined, configured: ModelEffort | null | undefined): string {
  return `實際 ${fmtModelEffort(actual)}，設定 ${fmtModelEffort(configured)}`
}

/** 成員不一致標記的 tooltip 取值：該成員在（已篩到本任務的）mismatch.panes 裡花費最大的一列；沒有為 null */
export function worstMismatch(panes: MismatchPane[] | undefined, member: string): MismatchPane | null {
  let best: MismatchPane | null = null
  for (const p of panes ?? []) if (p.member === member && (best === null || p.cost > best.cost)) best = p
  return best
}

const TIER_ORDER = ['L', 'M', 'S']
const tierRank = (t: string | null) => {
  const i = TIER_ORDER.indexOf(t ?? '')
  return i < 0 ? TIER_ORDER.length : i
}

/** /history 檔位欄：shared 的 tierCounts（(成員, 檔位) 去重、排除 reviewer 與 null 角色）排成 `L×2 M×1`；沒有顯示「—」 */
export function fmtTierCounts(dispatch: Dispatch[] | undefined): string {
  const n = Object.entries(tierCounts(dispatch ?? []))
  if (n.length === 0) return '—'
  return n
    .sort((a, b) => tierRank(a[0]) - tierRank(b[0]))
    .map(([t, c]) => `${t}×${c}`)
    .join(' ')
}

export interface TierAnalysisRow {
  key: string
  role: string
  kind: string
  tier: string
  model: string | null
  effort: string | null
  /** 出現的任務數 */
  tasks: number
  /** (任務, 成員) 去重 */
  members: number
  /** 歸屬花費；沒有花費資料或對不到為 null */
  cost: number | null
  costPerMember: number | null
  /** 所在任務的平均；totalMin 為 null 的不計入，全為 null 為 null */
  avgTotalMin: number | null
  avgWaves: number
  avgRepairWaves: number
  avgReReviews: number
}

interface AnalysisTask {
  project: string
  dir: string
  totalMin: number | null
  waves: number
  repairWaves: number
  reReviews: number
  dispatch: Dispatch[]
}

interface AnalysisCosts {
  tasks: { project: string; taskDir: string; byConfigured?: TierCost[] }[]
}

const mean = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length)

/**
 * /history「依角色 × 派工檔位」：某角色×(kind, tier, model, effort) 出現在哪些任務，就用那些任務的耗時、波數等平均（任務層級的相關）；
 * 花費取那些任務 byConfigured 裡同一組的歸屬花費。排除 reviewer 與角色為 null。
 */
export function tierAnalysis(rows: AnalysisTask[], costs: AnalysisCosts | null | undefined): TierAnalysisRow[] {
  const groups = new Map<string, { head: Dispatch; tasks: Map<string, AnalysisTask>; members: Set<string> }>()
  for (const r of rows) {
    const taskKey = `${r.project}\0${r.dir}`
    for (const d of r.dispatch ?? []) {
      if (!countsForTiers(d)) continue
      const key = [d.role, d.kind, d.tier, d.model, d.effort].join('\0')
      let g = groups.get(key)
      if (!g) groups.set(key, (g = { head: d, tasks: new Map(), members: new Set() }))
      g.tasks.set(taskKey, r)
      g.members.add(`${taskKey}\0${d.member}`)
    }
  }
  const byTask = new Map<string, TierCost[]>()
  for (const t of costs?.tasks ?? []) byTask.set(`${t.project}\0${t.taskDir}`, t.byConfigured ?? [])

  const out: TierAnalysisRow[] = []
  for (const [key, { head: d, tasks, members }] of groups) {
    let cost: number | null = null
    for (const taskKey of tasks.keys())
      for (const c of byTask.get(taskKey) ?? [])
        if (c.role === d.role && c.kind === d.kind && c.tier === d.tier && c.model === d.model && c.effort === d.effort) cost = (cost ?? 0) + c.cost
    const ts = [...tasks.values()]
    out.push({
      key,
      role: d.role!,
      kind: d.kind,
      tier: d.tier,
      model: d.model,
      effort: d.effort,
      tasks: tasks.size,
      members: members.size,
      cost,
      costPerMember: cost == null ? null : cost / members.size,
      avgTotalMin: mean(ts.flatMap((t) => (t.totalMin == null ? [] : [t.totalMin]))),
      avgWaves: mean(ts.map((t) => t.waves))!,
      avgRepairWaves: mean(ts.map((t) => t.repairWaves ?? 0))!,
      avgReReviews: mean(ts.map((t) => t.reReviews))!,
    })
  }
  const cmp = (a: string | null, b: string | null) => (a ?? '\uffff').localeCompare(b ?? '\uffff')
  return out.sort(
    (a, b) =>
      a.role.localeCompare(b.role) || a.kind.localeCompare(b.kind) || tierRank(a.tier) - tierRank(b.tier) || cmp(a.model, b.model) || cmp(a.effort, b.effort),
  )
}
