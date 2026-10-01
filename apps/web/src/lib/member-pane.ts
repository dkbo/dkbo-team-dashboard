// 成員 → herdr pane 的對應，總覽與任務詳情共用。參數用結構型別，與 @dash/shared 的型別相容。

export interface MemberPaneLive {
  paneId: string
  member: string | null
  taskDir: string | null
}

/**
 * detail.panes 的 agent ＝ `<短名>-<成員>` → pane id → live pane；
 * 找不到（沒有 id 或 id 不在 live）再退回 server 已標好 taskDir＋member 的 pane。
 * recordedId 是 detail.panes 記的 id（可能已不在 herdr）。
 */
export function findMemberPane<P extends MemberPaneLive>(
  task: { dir: string; short: string },
  panes: { agent: string; pane: string | null }[],
  member: string,
  live: P[],
): { recordedId: string | null; pane: P | null } {
  const recordedId = panes.find((p) => p.agent === `${task.short}-${member}`)?.pane ?? null
  const pane =
    (recordedId ? live.find((p) => p.paneId === recordedId) : undefined) ??
    live.find((p) => p.taskDir === task.dir && p.member === member) ??
    null
  return { recordedId, pane }
}
