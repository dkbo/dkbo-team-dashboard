import type { ChartConfig } from '@/components/ui/chart'

// dataviz 參考色盤的類別色 slot 1–8（淺／深色各自一階），固定順序、不循環。
export const SERIES_COLORS = [
  { light: '#2a78d6', dark: '#3987e5' },
  { light: '#eb6834', dark: '#d95926' },
  { light: '#1baf7a', dark: '#199e70' },
  { light: '#eda100', dark: '#c98500' },
  { light: '#e87ba4', dark: '#d55181' },
  { light: '#008300', dark: '#008300' },
  { light: '#4a3aa7', dark: '#9085e9' },
  { light: '#e34948', dark: '#e66767' },
] as const

export const MAX_SERIES = SERIES_COLORS.length

export function seriesConfig(series: { key: string; label: string }[]): ChartConfig {
  return Object.fromEntries(series.map((s, i) => [s.key, { label: s.label, theme: SERIES_COLORS[i % MAX_SERIES] }]))
}
