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
