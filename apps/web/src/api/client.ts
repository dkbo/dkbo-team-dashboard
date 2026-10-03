import type {
  ActivityResponse,
  CostRange,
  CostsResponse,
  GitCommitDetail,
  GitFileDiff,
  GitRepoResponse,
  GitSummaryResponse,
  HerdrScreen,
  HerdrSearchResponse,
  HerdrView,
  HistoryResponse,
  OverviewDoc,
  TaskDetailResponse,
  TrendRange,
  TrendsResponse,
} from '@dash/shared'

export class HttpError extends Error {
  readonly status: number
  constructor(status: number, url: string) {
    super(`HTTP ${status}：${url}`)
    this.status = status
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new HttpError(res.status, url)
  return (await res.json()) as T
}

export const api = {
  overview: () => getJson<OverviewDoc>('/api/overview'),
  activity: (limit: number) => getJson<ActivityResponse>(`/api/activity?limit=${limit}`),
  task: (project: string, dir: string) =>
    getJson<TaskDetailResponse>(`/api/projects/${encodeURIComponent(project)}/tasks/${encodeURIComponent(dir)}`),
  history: () => getJson<HistoryResponse>('/api/history'),
  trends: (range: TrendRange) => getJson<TrendsResponse>(`/api/trends?range=${range}`),
  costs: (range: CostRange) => getJson<CostsResponse>(`/api/costs?range=${range}`),
  herdrView: () => getJson<HerdrView>('/api/herdr/view'),
  herdrSearch: (q: string) => getJson<HerdrSearchResponse>(`/api/herdr/search?q=${encodeURIComponent(q)}`),
  herdrScreen: (paneId: string, recentLines?: number) =>
    getJson<HerdrScreen>(
      `/api/herdr/panes/${encodeURIComponent(paneId)}/screen${recentLines ? `?source=recent&lines=${recentLines}` : ''}`,
    ),
  gitSummaries: () => getJson<GitSummaryResponse>('/api/git'),
  gitRepo: (project: string, limit: number) => getJson<GitRepoResponse>(`/api/git/${encodeURIComponent(project)}?limit=${limit}`),
  gitCommit: (project: string, hash: string) =>
    getJson<GitCommitDetail>(`/api/git/${encodeURIComponent(project)}/commits/${encodeURIComponent(hash)}`),
  gitDiff: (project: string, hash: string, path: string) =>
    getJson<GitFileDiff>(`/api/git/${encodeURIComponent(project)}/commits/${encodeURIComponent(hash)}/diff?path=${encodeURIComponent(path)}`),
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
