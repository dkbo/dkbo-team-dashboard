// 角色模型對應（AC10）：member 完整名命中 → 去掉 `-` 後綴再比 → default；leader 用 leader。
// manifest 形狀是共用契約「Kenney 素材」（擁有者 it），url 相對 /office/。

export type ClipName = 'idle' | 'walk' | 'sit' | 'type' | 'wave' | 'think' | 'sleep' | 'cheer'

export interface OfficeManifest {
  characters: Record<string, { url: string; clips: Record<ClipName, string | null> }>
  furniture: Record<string, string>
}

export const ASSET_BASE = '/office/'

export const assetUrl = (rel: string) => `${ASSET_BASE}${rel}`

export function characterKey(s: { member: string | null; leader: boolean }, keys: readonly string[]): string {
  const has = (k: string) => keys.includes(k)
  if (s.leader) return has('leader') ? 'leader' : 'default'
  const m = s.member
  if (m) {
    if (has(m)) return m
    const dash = m.indexOf('-')
    if (dash > 0 && has(m.slice(0, dash))) return m.slice(0, dash)
  }
  return 'default'
}

export async function loadManifest(fetcher: typeof fetch = fetch): Promise<OfficeManifest> {
  const res = await fetcher(assetUrl('manifest.json'))
  if (!res.ok) throw new Error(`manifest.json ${res.status}`)
  return (await res.json()) as OfficeManifest
}
