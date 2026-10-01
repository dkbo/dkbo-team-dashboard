import type { PaneLive } from '@dash/shared'

/** 連到 herdr 鏡像頁並選好這個 pane */
export const herdrHref = (p: Pick<PaneLive, 'workspaceId' | 'tabId' | 'paneId'>): string =>
  `/herdr?${new URLSearchParams({ w: p.workspaceId, t: p.tabId, p: p.paneId })}`
