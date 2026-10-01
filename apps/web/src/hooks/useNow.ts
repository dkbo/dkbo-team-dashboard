import { useEffect, useState } from 'react'

/** 每 intervalMs 更新一次的現在時間（epoch ms），給倒數與「已 M 分」用。 */
export function useNow(intervalMs = 10_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}
