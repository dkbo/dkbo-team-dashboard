import { useEffect, useRef, useState } from 'react'

/** 離開 hover 後再留 `ms` 毫秒才放掉（§6.8：離開 100 ms 後關）。有新的 id 就立刻換、舊計時作廢 */
export function useLingerId(id: string | null, ms = 100): string | null {
  const [kept, setKept] = useState<string | null>(id)
  const last = useRef(id)
  useEffect(() => {
    last.current = id
    if (id) return setKept(id)
    const t = setTimeout(() => setKept(null), ms)
    return () => clearTimeout(t)
  }, [id, ms])
  // 有 id 的那一個 render 就回傳它，不等 effect 的 setState 多繞一輪
  return id ?? kept
}
