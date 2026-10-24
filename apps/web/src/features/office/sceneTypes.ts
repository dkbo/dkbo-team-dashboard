import type { OfficeSession } from '@dash/shared'
import type { SceneTask } from './model'

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
}
