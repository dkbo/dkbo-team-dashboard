import { useCallback, useEffect, useRef, useState } from 'react'
import type { GitCommitDetail, GitFileDiff } from '@dash/shared'
import { api, errorText } from '@/api/client'

export interface Polled<T> {
  data: T | null
  error: string | null
  loading: boolean
  reload(): void
}

/** 依 key 輪詢；key 改變時不沿用別的 key 的資料，只收最後一次請求的結果 */
export function usePolled<T>(key: string | null, load: () => Promise<T>, everyMs: number): Polled<T> {
  const [state, setState] = useState<{ key: string | null; data: T | null; error: string | null; loading: boolean }>({
    key,
    data: null,
    error: null,
    loading: key != null,
  })
  const seq = useRef(0)
  const loader = useRef(load)
  loader.current = load

  const run = useCallback(async (k: string | null) => {
    if (k == null) return
    const id = ++seq.current
    setState((s) => (s.key === k ? { ...s, loading: true } : { key: k, data: null, error: null, loading: true }))
    try {
      const data = await loader.current()
      if (id === seq.current) setState({ key: k, data, error: null, loading: false })
    } catch (e) {
      if (id === seq.current) setState((s) => ({ ...s, error: errorText(e), loading: false }))
    }
  }, [])

  useEffect(() => {
    void run(key)
    if (key == null) return
    const t = setInterval(() => void run(key), everyMs)
    return () => clearInterval(t)
  }, [key, everyMs, run])

  const reload = useCallback(() => void run(key), [run, key])
  const current = state.key === key
  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    loading: current ? state.loading : key != null,
    reload,
  }
}

/** commit 與它的 diff 內容不會變：抓過就快取，不輪詢 */
const immutable = new Map<string, unknown>()

function useImmutable<T>(key: string | null, load: () => Promise<T>): { data: T | null; error: string | null } {
  const [state, setState] = useState<{ key: string | null; data: T | null; error: string | null }>({ key: null, data: null, error: null })
  const loader = useRef(load)
  loader.current = load
  useEffect(() => {
    if (!key) return
    const hit = immutable.get(key) as T | undefined
    if (hit) {
      setState({ key, data: hit, error: null })
      return
    }
    let live = true
    loader.current().then(
      (d) => {
        immutable.set(key, d)
        if (live) setState({ key, data: d, error: null })
      },
      (e) => live && setState({ key, data: null, error: errorText(e) }),
    )
    return () => {
      live = false
    }
  }, [key])
  if (state.key !== key) return { data: key ? ((immutable.get(key) as T | undefined) ?? null) : null, error: null }
  return { data: state.data, error: state.error }
}

export function useCommit(project: string | null, hash: string | null): { data: GitCommitDetail | null; error: string | null } {
  return useImmutable(project && hash ? `c\0${project}\0${hash}` : null, () => api.gitCommit(project!, hash!))
}

export function useFileDiff(project: string | null, hash: string | null, path: string | null): { data: GitFileDiff | null; error: string | null } {
  return useImmutable(project && hash && path ? `d\0${project}\0${hash}\0${path}` : null, () => api.gitDiff(project!, hash!, path!))
}
