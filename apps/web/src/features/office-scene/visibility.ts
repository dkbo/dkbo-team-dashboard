// 背景分頁停 render（§4.7）：hidden → frameloop 'never'；切回 'demand'、invalidate 一次（不補播，E7）。
import { useEffect, useRef } from 'react'

export type Frameloop = 'always' | 'demand' | 'never'

export const frameloopFor = (v: DocumentVisibilityState): Frameloop => (v === 'hidden' ? 'never' : 'demand')

export function useVisibilityFrameloop(opts: { setFrameloop: (f: Frameloop) => void; invalidate: () => void; onResume?: () => void }) {
  const ref = useRef(opts)
  ref.current = opts
  useEffect(() => {
    if (document.visibilityState === 'hidden') ref.current.setFrameloop('never')
    const onChange = () => {
      const next = frameloopFor(document.visibilityState)
      ref.current.setFrameloop(next)
      if (next === 'demand') {
        ref.current.onResume?.()
        ref.current.invalidate()
      }
    }
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])
}
