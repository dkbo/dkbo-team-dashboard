import { CircleAlert, GitBranch, Hand, Terminal, TriangleAlert, Zap, type LucideIcon } from 'lucide-react'
import { Tag } from '../Tag'
import type { ObjectChip } from './types'

/** 契約 `Chip.icon`（字串）的內建對照；不認得的名稱就不畫圖示 */
export const CHIP_ICONS: Record<string, LucideIcon> = {
  alert: TriangleAlert,
  warn: TriangleAlert,
  escalate: CircleAlert,
  zap: Zap,
  hand: Hand,
  git: GitBranch,
  pane: Terminal,
}

/** 標籤上的小 Tag：danger／warn 用語意色，neutral 用 muted */
export function ChipTag({ chip }: { chip: ObjectChip }) {
  const Icon = typeof chip.icon === 'string' ? CHIP_ICONS[chip.icon] : chip.icon
  return (
    <Tag variant={chip.tone}>
      {Icon && <Icon aria-hidden />}
      {chip.label}
    </Tag>
  )
}

/** 異常語意色：danger 優先於 warn；都沒有回 null（neutral chip、ok／null 燈都不算異常） */
export function abnormalTone(chip: ObjectChip | null | undefined, lamp: string | null | undefined): 'danger' | 'warn' | null {
  if (chip?.tone === 'danger' || lamp === 'danger') return 'danger'
  if (chip?.tone === 'warn' || lamp === 'warn') return 'warn'
  return null
}
