import { describe, expect, it } from 'vitest'
import {
  fmtConfigured,
  fmtModelEffort,
  fmtTier,
  mismatchTip,
  tierAnalysis,
  fmtTierCounts,
  type Dispatch,
} from '@/lib/modelcost'

const d = (over: Partial<Dispatch>): Dispatch => ({
  agent: 'demo-backend',
  member: 'backend',
  role: 'backend',
  kind: 'claude',
  tier: 'M',
  model: 'opus',
  effort: 'medium',
  at: 0,
  notes: [],
  ...over,
})

describe('顯示格式', () => {
  it('model／effort：null 顯示「未知」，兩者都 null 只顯示一次', () => {
    expect(fmtModelEffort({ model: 'opus', effort: 'high' })).toBe('opus/high')
    expect(fmtModelEffort({ model: 'opus 5.5', effort: null })).toBe('opus 5.5/未知')
    expect(fmtModelEffort({ model: null, effort: null })).toBe('未知')
    expect(fmtModelEffort(null)).toBe('未知')
  })

  it('設定：kind tier · model/effort；全 null 顯示「未知」', () => {
    expect(fmtConfigured({ kind: 'codex', tier: 'M', model: 'gpt-5', effort: 'high' })).toBe('codex M · gpt-5/high')
    expect(fmtConfigured({ kind: 'claude', tier: 'L', model: null, effort: null })).toBe('claude L · 未知')
    expect(fmtConfigured({ kind: null, tier: null, model: null, effort: null })).toBe('未知')
    expect(fmtConfigured(null)).toBe('未知')
  })

  it('檔位標記：tier · model/effort', () => {
    expect(fmtTier(d({ tier: 'L', model: 'opus', effort: 'high' }))).toBe('L · opus/high')
    expect(fmtTier(d({ tier: 'S', model: null, effort: null }))).toBe('S · 未知')
    expect(fmtTier(null)).toBe('未知')
  })

  it('不一致 tooltip：寫死格式', () => {
    expect(mismatchTip({ model: 'sonnet 5', effort: 'high' }, { model: 'opus', effort: 'high' })).toBe('實際 sonnet 5/high，設定 opus/high')
    expect(mismatchTip(null, { model: 'opus', effort: null })).toBe('實際 未知，設定 opus/未知')
  })
})

describe('fmtTierCounts', () => {
  it('(成員, 檔位) 去重後依檔位計數，L→M→S，排除 reviewer 與 null 角色', () => {
    expect(
      fmtTierCounts([
        d({ member: 'backend', tier: 'L' }),
        d({ member: 'backend', tier: 'L', notes: ['resume'] }),
        d({ member: 'backend', tier: 'M' }),
        d({ member: 'frontend', role: 'frontend', tier: 'L' }),
        d({ member: 'reviewer-a', role: 'reviewer', tier: 'S' }),
        d({ member: 'x', role: null, tier: 'S' }),
      ]),
    ).toBe('L×2 M×1')
  })

  it('沒有派工顯示「—」', () => {
    expect(fmtTierCounts([])).toBe('—')
    expect(fmtTierCounts([d({ role: 'reviewer' })])).toBe('—')
  })
})

describe('tierAnalysis', () => {
  const row = (dir: string, over: Record<string, unknown> = {}) => ({
    project: 'p',
    dir,
    totalMin: 60,
    waves: 2,
    repairWaves: 0,
    reReviews: 1,
    dispatch: [] as Dispatch[],
    ...over,
  })
  const L = { kind: 'claude', tier: 'L' as const, model: 'opus', effort: 'high' }
  const rows = [
    row('t1', {
      totalMin: 100,
      waves: 3,
      repairWaves: 1,
      reReviews: 2,
      dispatch: [d({ ...L, member: 'backend' }), d({ ...L, member: 'backend', notes: ['resume'] }), d({ ...L, member: 'backend-b' }), d({ member: 'reviewer-a', role: 'reviewer' })],
    }),
    row('t2', { totalMin: null, waves: 1, repairWaves: 0, reReviews: 0, dispatch: [d({ ...L, member: 'backend' }), d({ member: 'qa', role: 'qa', tier: 'S', model: null, effort: null })] }),
    row('t3', { totalMin: 50, dispatch: [d({ member: 'x', role: null })] }),
  ]
  const costs = {
    tasks: [
      { project: 'p', taskDir: 't1', byConfigured: [{ role: 'backend', ...L, cost: 6 }, { role: null, kind: null, tier: null, model: null, effort: null, cost: 1 }] },
      { project: 'p', taskDir: 't2', byConfigured: [{ role: 'backend', ...L, cost: 3 }] },
    ],
  }

  it('列＝角色 × (kind, tier, model, effort)；任務數、(任務, 成員) 去重的成員數、花費與平均', () => {
    const out = tierAnalysis(rows, costs)
    expect(out.map((r) => `${r.role} ${fmtConfigured(r)}`)).toEqual(['backend claude L · opus/high', 'qa claude S · 未知'])
    const be = out[0]
    expect(be.tasks).toBe(2)
    expect(be.members).toBe(3)
    expect(be.cost).toBe(9)
    expect(be.costPerMember).toBe(3)
    expect(be.avgTotalMin).toBe(100) // t2 的 null 不計入
    expect(be.avgWaves).toBe(2)
    expect(be.avgRepairWaves).toBe(0.5)
    expect(be.avgReReviews).toBe(1)
    const qa = out[1]
    expect(qa.tasks).toBe(1)
    expect(qa.cost).toBeNull()
    expect(qa.costPerMember).toBeNull()
    expect(qa.avgTotalMin).toBeNull() // 全為 null
  })

  it('沒有花費資料：cost 為 null', () => {
    const out = tierAnalysis(rows, null)
    expect(out[0].cost).toBeNull()
    expect(out[0].costPerMember).toBeNull()
  })

  it('沒有 dispatch 欄的舊資料不炸', () => {
    expect(tierAnalysis([{ ...row('t9'), dispatch: undefined as never }], null)).toEqual([])
  })
})
