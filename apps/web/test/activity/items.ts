// 手造的 ActivityItem（形狀照 brief 共用契約「活動型別與 API」）；backend fixture 定稿後另以 fixture 跑一次。
import type { ActivityItem, ActivityResponse } from '@dash/shared'

export const NOW = new Date(2026, 9, 3, 12, 0).getTime()
const MIN = 60_000
const pad = (n: number) => String(n).padStart(2, '0')
const tsOf = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function item(over: Partial<ActivityItem> & { ago?: number } = {}): ActivityItem {
  const { ago = 5, ...rest } = over
  const at = NOW - ago * MIN
  return {
    project: 'demo',
    taskDir: '2026-10-03-glow',
    taskShort: 'glow',
    ts: tsOf(at),
    at,
    source: 'message',
    type: 'DONE',
    actor: 'glow-frontend',
    text: '完成，見 report',
    ...rest,
  }
}

export const response = (items: ActivityItem[]): ActivityResponse => ({ generatedAt: NOW, items })
