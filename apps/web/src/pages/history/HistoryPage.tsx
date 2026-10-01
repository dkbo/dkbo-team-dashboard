import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { HistoryView } from '@/features/history/HistoryView'
import { useCostsAll, useHistory } from '@/store'

export default function HistoryPage() {
  const { data, error, loading, reload } = useHistory()
  const { data: costs } = useCostsAll()
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold tracking-tight">歷史與分析</h1>
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400"
        >
          <span>
            {data ? '更新失敗，顯示的是舊資料：' : '載入失敗：'}
            {error}
          </span>
          <Button size="sm" variant="outline" onClick={reload}>
            重試
          </Button>
        </div>
      )}
      {data ? (
        <HistoryView rows={data} costs={costs} />
      ) : (
        loading && (
          <div data-testid="history-loading" className="flex flex-col gap-4">
            <Skeleton className="h-8 w-96" />
            <div className="grid gap-4 lg:grid-cols-2">
              <Skeleton className="h-64" />
              <Skeleton className="h-64" />
            </div>
            <Skeleton className="h-48" />
          </div>
        )
      )}
    </div>
  )
}
