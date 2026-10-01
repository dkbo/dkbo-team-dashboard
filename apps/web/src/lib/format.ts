// dk-status 的時間戳是本地時間 `YYYY-MM-DDTHH:MM`；倒數一律用 epoch 計算。

const TS_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/

const pad = (n: number) => String(n).padStart(2, '0')

export function parseLocalTs(ts: string | null | undefined): Date | null {
  if (!ts) return null
  const m = TS_RE.exec(ts)
  if (!m) return null
  const [, y, mo, d, h, mi] = m.map(Number)
  return new Date(y, mo - 1, d, h, mi)
}

export function formatTs(ts: string | null | undefined): string {
  const d = parseLocalTs(ts)
  if (!d) return '—'
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function formatEpochMs(ms: number | null | undefined): string {
  if (ms == null) return '—'
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function minutesBetween(startMs: number, endMs: number): number {
  return Math.max(0, Math.floor((endMs - startMs) / 60_000))
}

export function formatMinutes(min: number | null | undefined): string {
  if (min == null) return '—'
  const m = Math.max(0, Math.floor(min))
  const days = Math.floor(m / 1440)
  const hours = Math.floor((m % 1440) / 60)
  const mins = m % 60
  if (days > 0) return `${days} 天 ${hours} 小時`
  if (hours > 0) return `${hours} 小時 ${mins} 分`
  return `${mins} 分`
}

/** 距 untilEpoch（Unix 秒）還剩多久；已過給「已恢復」，不足一分鐘進位成 1 分。 */
export function formatCountdown(untilEpoch: number, nowMs: number): string {
  const leftMs = untilEpoch * 1000 - nowMs
  if (leftMs <= 0) return '已恢復'
  return formatMinutes(Math.max(1, Math.floor(leftMs / 60_000)))
}

export function formatPct(n: number | null | undefined): string {
  return n == null ? '—' : `${Math.round(n)}%`
}

export function formatCost(n: number | null | undefined): string {
  return n == null ? '—' : `$${n.toFixed(2)}`
}
