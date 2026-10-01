import { useEffect } from 'react'
import { openStream } from '@/api/stream'
import { useDashStore } from '@/store'

/** 掛載期間維持 /api/stream 連線，事件與連線狀態交給 store。 */
export function useLiveStream() {
  useEffect(() => {
    const s = useDashStore.getState()
    return openStream({ onOpen: s.handleStreamOpen, onError: s.handleStreamError, onEvent: s.handleEvent })
  }, [])
}
