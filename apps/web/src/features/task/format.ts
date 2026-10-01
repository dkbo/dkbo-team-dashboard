import type { TaskStatus } from '@dash/shared'

// 時間／分鐘／cost／% 的格式化沿用殼層 @/lib/format，這裡只留詳情與歷史頁自己的標籤。
export {
  formatCost as fmtCost,
  formatMinutes as fmtMinutes,
  formatPct as fmtPct,
  formatTs as fmtTs,
} from '@/lib/format'

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  planning: '規劃中',
  running: '進行中',
  done: '已完成',
  abandoned: '已放棄',
  unknown: '狀態不明',
}
