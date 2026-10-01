import type { GitStatus, GitStatusFile } from '@dash/shared'

export const GIT_POLL_MS = 10_000
export const GIT_PAGE = 200

export const shortHash = (h: string | null | undefined): string => (h ? h.slice(0, 7) : '—')

export interface FileGroups {
  conflicts: GitStatusFile[]
  staged: GitStatusFile[]
  unstaged: GitStatusFile[]
  untracked: GitStatusFile[]
}

/** 同一檔案可同時出現在已暫存與未暫存 */
export function groupFiles(s: GitStatus): FileGroups {
  const g: FileGroups = { conflicts: [], staged: [], unstaged: [], untracked: [] }
  for (const f of s.files) {
    if (f.conflict) g.conflicts.push(f)
    else if (f.x === '?') g.untracked.push(f)
    else {
      if (f.x !== '.') g.staged.push(f)
      if (f.y !== '.') g.unstaged.push(f)
    }
  }
  return g
}

export const CHANGE_LABEL: Record<string, string> = {
  M: '修改',
  A: '新增',
  D: '刪除',
  R: '改名',
  C: '複製',
  T: '型別',
  U: '衝突',
  '?': '未追蹤',
}

export type RefKind = 'head' | 'branch' | 'remote' | 'tag'

export interface RefBadge {
  kind: RefKind
  label: string
}

/** %D 的一項 → 徽章；遠端分支只認常見的 origin／upstream 前綴（本機分支名也可能含 /） */
export function parseRef(r: string): RefBadge[] {
  if (r.startsWith('HEAD -> ')) return [{ kind: 'head', label: `HEAD → ${r.slice(8)}` }]
  if (r === 'HEAD') return [{ kind: 'head', label: 'HEAD' }]
  if (r.startsWith('tag: ')) return [{ kind: 'tag', label: r.slice(5) }]
  if (/^(origin|upstream)\//.test(r)) return [{ kind: 'remote', label: r }]
  return [{ kind: 'branch', label: r }]
}

/** epoch 秒 → 「3 分鐘前」「2 天前」；超過 30 天顯示日期 */
export function formatAgo(sec: number, nowMs: number): string {
  const d = Math.max(0, Math.floor(nowMs / 1000 - sec))
  if (d < 60) return '剛剛'
  if (d < 3600) return `${Math.floor(d / 60)} 分鐘前`
  if (d < 86400) return `${Math.floor(d / 3600)} 小時前`
  if (d < 30 * 86400) return `${Math.floor(d / 86400)} 天前`
  return formatDate(sec)
}

const pad = (n: number) => String(n).padStart(2, '0')

export function formatDate(sec: number): string {
  const t = new Date(sec * 1000)
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}`
}

/** worktree 在專案底下時顯示相對路徑 */
export function relPath(path: string, root: string): string {
  if (path === root) return '.'
  return path.startsWith(root + '/') ? path.slice(root.length + 1) : path
}
