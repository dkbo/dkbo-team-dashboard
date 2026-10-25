// AC7：lib/rank.ts —— E9 Claude model→職等、E10 Codex model→職等與 effort→星數（比對順序是規格的一部分）
import { describe, expect, it } from 'vitest'
import { RANK_LABEL, rankOf, starsOf } from '@/lib/rank'

describe('rankOf：claude 依 opus／sonnet／haiku 前綴', () => {
  it.each([
    ['opus', 'senior'],
    ['opus[1m]', 'senior'],
    ['claude-opus-4-1-20250805', 'senior'],
    ['sonnet', 'mid'],
    ['claude-sonnet-4-5', 'mid'],
    ['haiku', 'junior'],
    ['claude-haiku-4-5', 'junior'],
    ['OPUS', 'senior'],
  ] as const)('claude %s → %s', (model, rank) => {
    expect(rankOf('claude', model)).toBe(rank)
  })

  it.each([null, undefined, '', 'gpt-5.5', 'mystery'])('claude 讀不到或不在表上（%s）→ visitor', (model) => {
    expect(rankOf('claude', model)).toBe('visitor')
  })
})

describe('rankOf：codex 依序比對，第一個命中', () => {
  it.each([
    ['gpt-5.1-codex-mini', 'junior'],
    ['gpt-5-nano', 'junior'],
    ['gpt-5-mini', 'junior'],
    ['gpt-5.1-codex-max', 'senior'],
    ['gpt-5.1-codex', 'mid'],
    ['gpt-5-codex', 'mid'],
    ['gpt-5.5', 'senior'],
    ['gpt-5', 'senior'],
    ['GPT-5.5', 'senior'],
  ] as const)('codex %s → %s', (model, rank) => {
    expect(rankOf('codex', model)).toBe(rank)
  })

  it('-codex-mini 先中 -mini（junior），不被 -codex 搶走（mid）', () => {
    expect(rankOf('codex', 'gpt-5.1-codex-mini')).toBe('junior')
  })

  it('-codex-max 先於 -codex', () => {
    expect(rankOf('codex', 'gpt-5.1-codex-max')).toBe('senior')
  })

  it.each([null, undefined, '', 'opus', 'gpt-5.5-preview', 'o3'])('codex 讀不到或不在表上（%s）→ visitor', (model) => {
    expect(rankOf('codex', model)).toBe('visitor')
  })
})

describe('rankOf：未知 kind', () => {
  it.each(['gemini', 'agy', '', null, undefined])('kind %s → visitor（即使 model 長得像 opus）', (kind) => {
    expect(rankOf(kind, 'opus')).toBe('visitor')
  })
})

describe('RANK_LABEL', () => {
  it('四個職等的中文', () => {
    expect(RANK_LABEL).toEqual({ senior: '資深', mid: '中階', junior: '初階', visitor: '訪客' })
  })
})

describe('starsOf：effort → 星數（E10；§1.7）', () => {
  it.each([
    ['low', 1],
    ['medium', 2],
    ['high', 3],
    ['xhigh', 4],
    ['max', 5],
    ['HIGH', 3],
  ] as const)('claude %s → %i', (effort, n) => {
    expect(starsOf('claude', effort)).toBe(n)
  })

  it.each([
    ['minimal', 1],
    ['low', 1],
    ['medium', 2],
    ['high', 3],
    ['xhigh', 4],
  ] as const)('codex %s → %i', (effort, n) => {
    expect(starsOf('codex', effort)).toBe(n)
  })

  it('codex 沒有 max；claude 沒有 minimal → 0', () => {
    expect(starsOf('codex', 'max')).toBe(0)
    expect(starsOf('claude', 'minimal')).toBe(0)
  })

  it.each([null, undefined, '', 'turbo'])('讀不到或不認得（%s）→ 0（不畫）', (effort) => {
    expect(starsOf('claude', effort)).toBe(0)
    expect(starsOf('codex', effort)).toBe(0)
  })

  it('未知 kind → 0', () => {
    expect(starsOf('gemini', 'high')).toBe(0)
    expect(starsOf(null, 'high')).toBe(0)
  })
})

// lobby AC12：BACKLOG rank.ts:8 —— 認得 Bedrock 區域前綴／舊命名（claude-3-5-sonnet）
describe('rankOf：claude 的 Bedrock 與舊命名 model id', () => {
  it.each([
    ['anthropic.claude-sonnet-4-5-20250929-v1:0', 'mid'],
    ['us.anthropic.claude-opus-4-1-20250805-v1:0', 'senior'],
    ['eu.anthropic.claude-haiku-4-5-20251001-v1:0', 'junior'],
    ['global.anthropic.claude-sonnet-4-20250514-v1:0', 'mid'],
    ['apac.anthropic.claude-opus-4-20250514-v1:0', 'senior'],
    ['claude-3-5-sonnet-20241022', 'mid'],
    ['claude-3-7-sonnet-20250219', 'mid'],
    ['claude-3-opus-20240229', 'senior'],
    ['claude-3-haiku-20240307', 'junior'],
    ['anthropic.claude-3-5-sonnet-20241022-v2:0', 'mid'],
    ['us.anthropic.claude-3-5-haiku-20241022-v1:0', 'junior'],
    ['claude-sonnet-4@20250514', 'mid'],
    ['CLAUDE-3-OPUS-20240229', 'senior'],
  ] as const)('claude %s → %s', (model, rank) => {
    expect(rankOf('claude', model)).toBe(rank)
  })

  it.each(['claude-instant-1.2', 'anthropic.claude-v2:1', 'anthropic.titan-text-express-v1', 'claude-3-mystery', 'us.anthropic.'])(
    '不認得的 claude 家族／殘缺 id（%s）→ visitor',
    (model) => {
      expect(rankOf('claude', model)).toBe('visitor')
    },
  )

  it('既有寫法不受影響（opus[1m]、anthropic/claude-opus-4）', () => {
    expect(rankOf('claude', 'opus[1m]')).toBe('senior')
    expect(rankOf('claude', 'anthropic/claude-opus-4')).toBe('senior')
  })
})
