import type { LucideIcon } from 'lucide-react'

/** 物件燈號／標籤異常色；對應契約 ObjectStat.lamp（null＝不亮） */
export type ObjectTone = 'danger' | 'warn' | 'ok'

/** 標籤上的小 Tag；形狀與契約 `Chip` 相容（icon 字串見 CHIP_ICONS，也可直接給 LucideIcon） */
export interface ObjectChip {
  label: string
  tone: 'danger' | 'warn' | 'neutral'
  icon?: string | LucideIcon
}

/** 標籤密度（E2）：full 拉近、compact 預設視角、alert-only 遠景只留有異常的 */
export type LabelDensity = 'full' | 'compact' | 'alert-only'

/** 碰撞讓位（§6.14）：none 正常、dot 縮成圓點、hidden 完全隱藏 */
export type LabelYield = 'none' | 'dot' | 'hidden'

/** 標籤共同的互動 props：點擊走 SPA 導頁，⌘／Ctrl／Shift／中鍵交給瀏覽器開新分頁 */
export interface LabelInteraction {
  href: string
  /** 一般左鍵點擊或 Enter：呼叫它並 preventDefault；沒給就讓 <a href> 原生導頁 */
  onOpen?: (href: string) => void
  /** hover／focus 進出，場景據此給物件描邊（§6.16） */
  onActiveChange?: (active: boolean) => void
  className?: string
}
