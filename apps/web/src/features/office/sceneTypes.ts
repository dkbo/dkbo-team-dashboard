import type { OfficeSession } from '@dash/shared'
import type { SceneTask } from './model'
import type { OfficeEvent } from './events/types'

/** 物件標籤的小膠囊（§6.14） */
export interface Chip {
  label: string
  tone: 'danger' | 'warn' | 'neutral'
  icon?: string
}

/** 單一數字的頁面物件（監控牆、檔案室、git 櫃、公告板、電表） */
export interface ObjectStat {
  value: string
  unit?: string
  lamp: 'danger' | 'warn' | 'ok' | null
  chip: Chip | null
  href: string
}

/** 任務白板：一個進行中（或結案 10 分鐘內，E8）的任務一塊 */
export interface BoardStat {
  project: string
  display: string
  closed: number
  planned: number
  tone: 'danger' | 'warn' | null
  chips: Chip[]
  closedState: 'done' | 'abandoned' | null
  closedAt: number | null
  href: string
}

/** 共用契約「OfficeObjects」（擁有者 frontend-office）；boards 的 key＝任務 dir（同 tasks） */
export interface OfficeObjects {
  boards: Record<string, BoardStat>
  monitor: ObjectStat
  archive: ObjectStat
  git: ObjectStat
  notice: ObjectStat
  meter: ObjectStat
}

export type FallbackReason = 'webgl' | 'assets' | 'context-lost'

/** 共用契約「OfficeScene 元件」的 props（擁有者 frontend-scene） */
export interface OfficeSceneProps {
  sessions: OfficeSession[]
  tasks: Record<string, SceneTask>
  selectedId: string | null
  hoveredId: string | null
  onSelect(id: string | null): void
  onHover(id: string | null): void
  focusRequest: { id: string; nonce: number } | null
  resetRequest: number
  theme: 'light' | 'dark'
  reducedMotion: boolean
  onFallback(reason: FallbackReason): void
  onUserMovedCamera(moved: boolean): void
  /** 頁面物件資料；還沒算好（或清單模式）是 null */
  objects: OfficeObjects | null
  /** 只含即時事件（已去重、已套佇列規則，契約「OfficeEvent」） */
  events: OfficeEvent[]
  /** 點物件或其標籤：頁面 navigate(href) */
  onOpenObject(href: string): void
}
