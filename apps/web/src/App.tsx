import type { ReactNode } from 'react'
import { BrowserRouter, Link, Route, Routes } from 'react-router'
import { AppLayout } from '@/components/app/AppLayout'
import { TooltipProvider } from '@/components/ui/tooltip'
import GitPage from '@/pages/git/GitPage'
import HerdrPage from '@/pages/herdr/HerdrPage'
import HistoryPage from '@/pages/history/HistoryPage'
import OverviewPage from '@/pages/overview/OverviewPage'
import TaskPage from '@/pages/task/TaskPage'
import TrendsPage from '@/pages/trends/TrendsPage'

export function AppProviders({ children }: { children: ReactNode }) {
  return <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
}

function NotFound() {
  return (
    <div className="mx-auto max-w-7xl p-8 text-center text-muted-foreground">
      <p>找不到這個頁面</p>
      <Link to="/" className="text-sm underline">
        回總覽
      </Link>
    </div>
  )
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<OverviewPage />} />
        <Route path="p/:project/t/:dir" element={<TaskPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="trends" element={<TrendsPage />} />
        <Route path="herdr" element={<HerdrPage />} />
        <Route path="git" element={<GitPage />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <AppProviders>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppProviders>
  )
}
