import type { ActivityItem } from '@dash/shared'
import { memberName } from './avatar'

/** Q6「需處理」：danger／warn 類訊息 */
export const ATTENTION_TYPES: ReadonlySet<string> = new Set(['ESCALATE', 'BUG', 'BLOCKED', 'LIMIT', 'TIMEOUT', 'STOP'])

export type ActivityFilter = 'all' | 'attention'

export function filterActivity(items: ActivityItem[], filter: ActivityFilter): ActivityItem[] {
  return filter === 'all' ? items : items.filter((x) => ATTENTION_TYPES.has(x.type))
}

export interface ActivityGroupData {
  key: string
  project: string
  taskDir: string
  taskShort: string
  /** 組內最新一則的時間 */
  at: number
  items: ActivityItem[]
}

/** §6.22：新到舊，相鄰且同 project/taskDir 併一組 */
export function groupActivity(items: ActivityItem[]): ActivityGroupData[] {
  const groups: ActivityGroupData[] = []
  for (const it of items) {
    const last = groups.at(-1)
    if (last && last.project === it.project && last.taskDir === it.taskDir) last.items.push(it)
    else groups.push({ key: `${groups.length}:${it.project}/${it.taskDir}`, project: it.project, taskDir: it.taskDir, taskShort: it.taskShort, at: it.at, items: [it] })
  }
  return groups
}

export const GROUP_MAX = 4
export const GROUP_KEEP = 3

/** 組內 > 4 則只顯示前 3 則，其餘收成「再看 N 則」 */
export function collapseGroup(items: ActivityItem[]): { shown: ActivityItem[]; hidden: number } {
  return items.length > GROUP_MAX ? { shown: items.slice(0, GROUP_KEEP), hidden: items.length - GROUP_KEEP } : { shown: items, hidden: 0 }
}

/** 依序取前 n 則（分組後）；被切開的組只留前段 */
export function takeItems(groups: ActivityGroupData[], n: number): ActivityGroupData[] {
  const out: ActivityGroupData[] = []
  let left = n
  for (const g of groups) {
    if (left <= 0) break
    out.push(g.items.length <= left ? g : { ...g, items: g.items.slice(0, left) })
    left -= g.items.length
  }
  return out
}

/** leader／process 事件用 compact 列（不重複頭像） */
export function isLeaderItem(item: ActivityItem): boolean {
  return item.actor == null || memberName(item.actor, item.taskShort).startsWith('leader')
}
