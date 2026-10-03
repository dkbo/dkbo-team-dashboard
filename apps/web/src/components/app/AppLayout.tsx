import { Outlet } from 'react-router'
import { useBlockedAlerts } from '@/features/alerts/useBlockedAlerts'
import { TopBar } from '@/features/topbar/TopBar'
import { useLiveStream } from '@/hooks/useLiveStream'
import { useNow } from '@/hooks/useNow'
import { useOverview } from '@/store'

export function AppLayout() {
  useLiveStream()
  useOverview() // 頂部列每頁都要 overview（熔斷、額度、燈號）
  useBlockedAlerts()
  const now = useNow(10_000)
  return (
    <div className="min-h-svh">
      <TopBar now={now} />
      <main>
        <Outlet />
      </main>
    </div>
  )
}
