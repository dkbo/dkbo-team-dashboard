import type { KindUsage, ProjectKindsDown } from '@dash/shared'

/** 同 kind 跨專案取 until_epoch 最晚者；已過期的不列；依 kind 升冪。 */
export function latestKindsDown(rows: ProjectKindsDown[], nowMs: number): ProjectKindsDown[] {
  const best = new Map<string, ProjectKindsDown>()
  for (const r of rows) {
    if (r.until_epoch * 1000 <= nowMs) continue
    const cur = best.get(r.kind)
    if (!cur || r.until_epoch > cur.until_epoch) best.set(r.kind, r)
  }
  return [...best.values()].sort((a, b) => a.kind.localeCompare(b.kind))
}

export function usageRows(usage: Record<string, KindUsage>): (KindUsage & { kind: string })[] {
  return Object.entries(usage)
    .map(([kind, u]) => ({ kind, fiveHourPct: u.fiveHourPct, weekPct: u.weekPct }))
    .sort((a, b) => a.kind.localeCompare(b.kind))
}
