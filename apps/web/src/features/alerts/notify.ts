// 桌面通知偏好：存在 localStorage（每個瀏覽器各自的），讀寫失敗就當成關閉。
const KEY = 'dash.notify.blocked'

export const notifySupported = (): boolean => typeof window !== 'undefined' && 'Notification' in window

export function notifyEnabled(): boolean {
  try {
    return notifySupported() && Notification.permission === 'granted' && localStorage.getItem(KEY) === 'on'
  } catch {
    return false
  }
}

export function setNotifyPref(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    // 無痕或封鎖儲存時忽略
  }
}

/** 開啟：必要時先要權限；回傳最後是否真的開了 */
export async function enableNotify(): Promise<boolean> {
  if (!notifySupported()) return false
  const perm = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
  setNotifyPref(perm === 'granted')
  return perm === 'granted'
}
