// 共用契約「OfficeEvent」（擁有者 frontend-events）：/office 的角色互動事件（§6.17、E6–E8）。

export type OfficeEventKind =
  | 'review-spawned'
  | 'review-pass'
  | 'review-fix'
  | 'escalate'
  | 'escalate-resolved'
  | 'wave-closed'
  | 'task-done'
  | 'task-abandoned'

export interface OfficeEvent {
  /** 穩定、去重用 */
  id: string
  kind: OfficeEventKind
  taskDir: string
  wave: number | null
  /** OfficeSession.id */
  actors: string[]
  target: { kind: 'session' | 'board'; id: string } | null
  /** Important K（review-fix）；其他事件為 null */
  count: number | null
  /** epoch ms */
  at: number
  /** live region 文字 */
  announce: string
}

export interface OfficeEventsResult {
  /** 只含即時事件，已去重、已套佇列規則 */
  events: OfficeEvent[]
  announce: string | null
}
