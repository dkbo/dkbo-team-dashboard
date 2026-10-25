// 職等與 effort 星數（office 規格 §1.6、§1.7；decisions E9、E10）

export type Rank = 'senior' | 'mid' | 'junior' | 'visitor'

export const RANK_LABEL: Record<Rank, string> = { senior: '資深', mid: '中階', junior: '初階', visitor: '訪客' }

/** 比對順序是規格的一部分：claude 先比 opus／sonnet／haiku 前綴；codex 先比 -mini|-nano → -codex-max → -codex → ^gpt-<版本>$ */
function claudeRank(model: string): Rank {
  // 去掉 Bedrock／Vertex 的區域與供應商前綴（us.anthropic.、anthropic/）再去 claude-
  const m = model.replace(/^(?:[a-z]+\.)?anthropic[./]/, '').replace(/^claude-/, '')
  // 新命名 sonnet-4-5…；舊命名 3-5-sonnet-…、3-opus-…（版本數字在家族名前面）
  const family = /^(?:\d+(?:[-.]\d+)*-)?(opus|sonnet|haiku)/.exec(m)?.[1]
  if (family === 'opus') return 'senior'
  if (family === 'sonnet') return 'mid'
  if (family === 'haiku') return 'junior'
  return 'visitor'
}

function codexRank(model: string): Rank {
  if (/-(mini|nano)$/.test(model)) return 'junior'
  if (model.endsWith('-codex-max')) return 'senior'
  if (model.endsWith('-codex')) return 'mid'
  if (/^gpt-[0-9.]+$/.test(model)) return 'senior'
  return 'visitor'
}

export function rankOf(kind: string | null | undefined, model: string | null | undefined): Rank {
  const m = model?.trim().toLowerCase()
  if (!m) return 'visitor'
  if (kind === 'claude') return claudeRank(m)
  if (kind === 'codex') return codexRank(m)
  return 'visitor'
}

const CLAUDE_STARS: Record<string, number> = { low: 1, medium: 2, high: 3, xhigh: 4, max: 5 }
const CODEX_STARS: Record<string, number> = { minimal: 1, low: 1, medium: 2, high: 3, xhigh: 4 }

/** effort → 星數；讀不到、不認得、該 kind 沒有的檔位（codex 無 max）回 0＝不畫 */
export function starsOf(kind: string | null | undefined, effort: string | null | undefined): number {
  const e = effort?.trim().toLowerCase()
  if (!e) return 0
  const table = kind === 'claude' ? CLAUDE_STARS : kind === 'codex' ? CODEX_STARS : null
  return table && Object.hasOwn(table, e) ? table[e] : 0
}
