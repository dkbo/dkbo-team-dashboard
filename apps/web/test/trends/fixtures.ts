// 手造的 TrendsResponse／CostsResponse，形狀照 brief 共用契約「趨勢型別與計算」。
import type { CostsResponse, TrendRange, TrendsResponse } from '@dash/shared'
import type { Dispatch } from '@/lib/modelcost'

export const NOW = new Date(2026, 8, 26, 10, 0).getTime()
const H = 3_600_000

export function trends(range: TrendRange = '24h', over: Partial<TrendsResponse> = {}): TrendsResponse {
  return {
    range,
    from: NOW - 24 * H,
    to: NOW,
    bucketMs: 15 * 60_000,
    generatedAt: NOW,
    skipped: 0,
    dataDir: '/home/u/.local/state/dkbo-dashboard',
    usage: {
      claude: [
        { t: NOW - 2 * H, fiveHourPct: 20, weekPct: 40 },
        { t: NOW - H, fiveHourPct: 40, weekPct: 41 },
        { t: NOW, fiveHourPct: 60, weekPct: null },
      ],
      codex: [{ t: NOW - H, fiveHourPct: 5, weekPct: 10 }],
    },
    projection: {
      claude: { fiveHourAt: new Date(2026, 8, 26, 12, 30).getTime(), weekAt: new Date(2026, 8, 28, 9, 5).getTime() },
      codex: { fiveHourAt: null, weekAt: null },
    },
    ctx: [
      { paneId: 'p1', label: 'frontend', points: [{ t: NOW - H, ctxPct: 30 }, { t: NOW, ctxPct: 55 }] },
      { paneId: 'p2', label: 'dashv1-qa', points: [{ t: NOW, ctxPct: 12 }] },
    ],
    costByDay: [
      { day: '2026-09-25', project: 'teamflow', cost: 1.25 },
      { day: '2026-09-26', project: 'teamflow', cost: 2 },
      { day: '2026-09-26', project: null, cost: 0.5 },
    ],
    costByKind: { claude: 3.25, codex: 0.5 },
    ...over,
  }
}

export function dispatch(over: Partial<Dispatch> = {}): Dispatch {
  return { agent: 'x-backend', member: 'backend', role: 'backend', kind: 'claude', tier: 'M', model: 'opus', effort: 'medium', at: NOW - 2 * H, notes: [], ...over }
}

export function costs(range: CostsResponse['range'] = '24h', over: Partial<CostsResponse> = {}): CostsResponse {
  return {
    range,
    generatedAt: NOW,
    from: NOW - 24 * H,
    to: NOW,
    skipped: 0,
    tasks: [
      {
        project: 'teamflow',
        taskDir: '2026-09-25-x',
        cost: 3,
        members: { 'frontend-shell': 2, qa: 0.75 },
        unmatched: 0.25,
        byConfigured: [
          { role: 'frontend', kind: 'claude', tier: 'L', model: 'opus', effort: 'high', cost: 2 },
          { role: 'qa', kind: 'claude', tier: 'M', model: 'opus', effort: 'medium', cost: 0.75 },
          { role: null, kind: null, tier: null, model: null, effort: null, cost: 0.25 },
        ],
        memberInfo: {
          'frontend-shell': {
            configured: dispatch({ agent: 'x-frontend-shell', member: 'frontend-shell', role: 'frontend', tier: 'L', model: 'opus', effort: 'high' }),
            dispatchCount: 2,
            actual: { model: 'opus 5.5', effort: 'high' },
            mismatch: true,
          },
          qa: {
            configured: dispatch({ agent: 'x-qa', member: 'qa', role: 'qa', tier: 'M', model: 'opus', effort: 'medium' }),
            dispatchCount: 1,
            actual: { model: 'opus 5.5', effort: 'medium' },
            mismatch: false,
          },
        },
      },
      {
        project: 'teamflow',
        taskDir: '2026-01-01-gone',
        cost: 0.25,
        members: { backend: 0.25 },
        unmatched: 0,
        byConfigured: [{ role: 'backend', kind: null, tier: null, model: null, effort: null, cost: 0.25 }],
        memberInfo: { backend: { configured: null, dispatchCount: 0, actual: null, mismatch: false } },
      },
    ],
    byRole: { frontend: 2, qa: 0.75, backend: 0.25 },
    unknownRole: 0.75,
    unattributed: 0.5,
    byActual: [
      { model: 'opus 5.5', effort: 'medium', cost: 1.5 },
      { model: 'sonnet 5', effort: 'high', cost: 1.25 },
      { model: null, effort: null, cost: 1 },
    ],
    byConfigured: [
      { kind: 'claude', tier: 'L', model: 'opus', effort: 'high', cost: 2 },
      { kind: null, tier: null, model: null, effort: null, cost: 1 },
      { kind: 'claude', tier: 'M', model: 'opus', effort: 'medium', cost: 0.75 },
    ],
    mismatch: {
      cost: 10.5,
      panes: [
        {
          paneId: 'w9-p1',
          project: 'teamflow',
          taskDir: '2026-01-01-gone',
          member: 'frontend-shell',
          actual: { model: 'gpt-5', effort: 'xhigh' },
          configured: { model: 'opus', effort: 'high' },
          cost: 9,
        },
        {
          paneId: 'w1-p3',
          project: 'teamflow',
          taskDir: '2026-09-25-x',
          member: 'frontend-shell',
          actual: { model: 'sonnet 5', effort: 'high' },
          configured: { model: 'opus', effort: 'high' },
          cost: 1.25,
        },
        {
          paneId: 'w1-p3',
          project: 'teamflow',
          taskDir: '2026-09-25-x',
          member: 'frontend-shell',
          actual: { model: 'haiku 4.5', effort: 'low' },
          configured: { model: 'opus', effort: 'high' },
          cost: 0.25,
        },
      ],
    },
    ...over,
  }
}

export function emptyTrends(range: TrendRange = '24h'): TrendsResponse {
  return trends(range, { usage: {}, projection: {}, ctx: [], costByDay: [], costByKind: {} })
}

export function emptyCosts(range: CostsResponse['range'] = '24h'): CostsResponse {
  return costs(range, { tasks: [], byRole: {}, unknownRole: 0, unattributed: 0, byActual: [], byConfigured: [], mismatch: { cost: 0, panes: [] } })
}
