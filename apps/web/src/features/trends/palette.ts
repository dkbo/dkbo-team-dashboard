import type { ChartConfig } from '@/components/ui/chart'

// 馬卡龍調類別色 slot 1–8（淺／深色各自一階，已過 dataviz 驗證：亮度帶、CVD 分離），固定順序、不循環。
export const SERIES_COLORS = [
  { light: '#3d8fe0', dark: '#4290e2' },
  { light: '#f0804f', dark: '#dc6a3c' },
  { light: '#2cb68a', dark: '#1a9e74' },
  { light: '#e9a520', dark: '#c4880f' },
  { light: '#de7fb0', dark: '#d0659a' },
  { light: '#4c9f45', dark: '#2f8f34' },
  { light: '#7a6ad8', dark: '#8a7ce6' },
  { light: '#e05f60', dark: '#e06363' },
] as const

export const MAX_SERIES = SERIES_COLORS.length

export function seriesConfig(series: { key: string; label: string }[]): ChartConfig {
  return Object.fromEntries(series.map((s, i) => [s.key, { label: s.label, theme: SERIES_COLORS[i % MAX_SERIES] }]))
}
