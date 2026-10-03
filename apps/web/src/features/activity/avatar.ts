// 成員頭像：依成員名雜湊到固定的小動物與底色，同名永遠同頭像；leader 戴皇冠。

export const AVATAR_ANIMALS = ['🐱', '🐶', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🐸', '🐧', '🐹', '🦉'] as const

export const AVATAR_COLORS = [
  '#ffd6dc',
  '#ffe2c2',
  '#fff1b8',
  '#dff5c4',
  '#c6f0dc',
  '#c4ecf2',
  '#cfe0ff',
  '#dcd6ff',
  '#ecd3ff',
  '#ffd3ef',
  '#e4e7f2',
  '#f6e3cf',
] as const

export interface Avatar {
  emoji: string
  color: string
}

export const LEADER_AVATAR: Avatar = { emoji: '👑', color: '#ffe7a3' }

/** 去掉 `<任務短名>-` 前綴後的成員名 */
export function memberName(actor: string, taskShort: string): string {
  const prefix = `${taskShort}-`
  return actor.startsWith(prefix) ? actor.slice(prefix.length) : actor
}

// FNV-1a 32 位元
function hash(s: string): number {
  let h = 0x811c9dc5
  for (const ch of s) {
    h ^= ch.codePointAt(0)!
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

/** actor 為 null（process 事件）或成員名以 leader 開頭時給皇冠 */
export function avatarFor(actor: string | null, taskShort: string): Avatar {
  if (actor == null) return LEADER_AVATAR
  const name = memberName(actor, taskShort)
  if (name.startsWith('leader')) return LEADER_AVATAR
  const h = hash(name)
  return { emoji: AVATAR_ANIMALS[h % AVATAR_ANIMALS.length], color: AVATAR_COLORS[(h >>> 8) % AVATAR_COLORS.length] }
}
