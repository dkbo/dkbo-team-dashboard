import { History } from 'lucide-react'
import { Banner, BannerAction } from '@/components/app/Banner'
import { PageHeader } from '@/components/app/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'
import { HistoryView } from '@/features/history/HistoryView'
import { useCostsAll, useHistory } from '@/store'

export default function HistoryPage() {
  const { data, error, loading, reload } = useHistory()
  const { data: costs } = useCostsAll()
  const banner = error && (
    <Banner tone={data ? 'warn' : 'danger'} title={data ? '更新失敗，顯示的是舊資料' : '載入失敗'} action={<BannerAction onClick={reload}>重試</BannerAction>}>
      <code className="font-mono text-xs break-all">{error}</code>
    </Banner>
  )
  return (
    <div className="mx-auto flex w-full max-w-page flex-col gap-6 px-4 py-6 lg:px-6">
      {data ? (
        <HistoryView rows={data} costs={costs} banner={banner} />
      ) : (
        <>
          <PageHeader icon={History} title="歷史與分析" />
          {banner}
          {loading && (
            <div data-testid="history-loading" className="flex flex-col gap-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <Skeleton className="h-(--chart-h-lg) rounded-xl" />
                <Skeleton className="h-(--chart-h-lg) rounded-xl" />
              </div>
              <Skeleton className="h-(--chart-h-lg) rounded-xl" />
            </div>
          )}
        </>
      )}
    </div>
  )
}
