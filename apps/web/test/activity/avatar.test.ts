import { describe, expect, it } from 'vitest'
import { AVATAR_ANIMALS, AVATAR_COLORS, LEADER_AVATAR, avatarFor, memberName } from '@/features/activity/avatar'

describe('memberName', () => {
  it('去掉 `<任務短名>-` 前綴；沒有前綴原樣', () => {
    expect(memberName('cuteui-frontend', 'cuteui')).toBe('frontend')
    expect(memberName('leader-cuteui', 'cuteui')).toBe('leader-cuteui')
    expect(memberName('frontend', 'cuteui')).toBe('frontend')
  })
})

describe('avatarFor', () => {
  it('固定 12 種動物與 12 種底色', () => {
    expect(AVATAR_ANIMALS).toHaveLength(12)
    expect(new Set(AVATAR_ANIMALS).size).toBe(12)
    expect(AVATAR_COLORS).toHaveLength(12)
    expect(new Set(AVATAR_COLORS).size).toBe(12)
  })

  it('同一個成員名永遠同頭像，跨任務也一樣（前綴去掉後比）', () => {
    const a = avatarFor('cuteui-frontend', 'cuteui')
    expect(avatarFor('cuteui-frontend', 'cuteui')).toEqual(a)
    expect(avatarFor('other-frontend', 'other')).toEqual(a)
    expect(AVATAR_ANIMALS).toContain(a.emoji)
    expect(AVATAR_COLORS).toContain(a.color)
  })

  it('不同名字會分散到不同頭像', () => {
    const names = ['frontend', 'backend', 'qa', 'reviewer-a', 'reviewer-b', 'it', 'designer', 'translator']
    const emojis = new Set(names.map((n) => avatarFor(`t-${n}`, 't').emoji))
    expect(emojis.size).toBeGreaterThan(3)
  })

  it('actor 為 null 或成員名以 leader 開頭時戴皇冠', () => {
    expect(avatarFor(null, 'cuteui').emoji).toBe('👑')
    expect(avatarFor('leader-cuteui', 'cuteui')).toEqual(LEADER_AVATAR)
    expect(avatarFor('cuteui-leader', 'cuteui')).toEqual(LEADER_AVATAR)
    expect(avatarFor('cuteui-backend', 'cuteui').emoji).not.toBe('👑')
  })
})
