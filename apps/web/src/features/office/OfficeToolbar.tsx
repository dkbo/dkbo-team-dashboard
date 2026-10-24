import { forwardRef } from 'react'
import { Ban, ChevronDown, CircleQuestionMark, Maximize2, RotateCcw } from 'lucide-react'
import { SegmentedControl } from '@/components/app/SegmentedControl'
import { StatusDot } from '@/components/app/StatusDot'
import { Tag } from '@/components/app/Tag'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { KindCounts, KindFilter, OfficeParams, OfficeView } from './model'
import { PickMenu } from './PickMenu'

const KEYS: [string, string][] = [
  ['/', '聚焦專案選單'],
  ['n', '切換「只看需要你」'],
  ['r', '重設視角'],
  ['l', '切換 3D／清單'],
  ['f', '聚焦找人清單'],
  ['↑ ↓／Enter', '清單移動／飛過去'],
  ['Esc', '取消選取'],
]

function KeyHelp() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="鍵盤說明">
          <CircleQuestionMark aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <p className="mb-2 text-sm font-bold">鍵盤操作</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {KEYS.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-mono text-muted-foreground">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">唯讀：不會回覆或審批任何 agent，要處理請到 herdr。</p>
      </PopoverContent>
    </Popover>
  )
}

export interface OfficeToolbarProps {
  params: OfficeParams
  counts: KindCounts
  projects: string[]
  view: OfficeView
  /** 無 WebGL：3D 項 disabled＋Ban */
  webglOk: boolean
  /** 鏡頭動過：重設視角變 selected-soft */
  moved: boolean
  /** 3D 視圖才有重設與全螢幕 */
  sceneOn: boolean
  /** < lg：重設視角只留圖示 */
  compact: boolean
  onParams(patch: Partial<OfficeParams>): void
  onView(v: OfficeView): void
  onReset(): void
  onFullscreen(): void
  className?: string
}

/** §6.1 PageHeader 工具列：kind → 專案 → 只看需要你 → 3D｜清單 → 重設視角 → 全螢幕 */
export const OfficeToolbar = forwardRef<HTMLButtonElement, OfficeToolbarProps>(function OfficeToolbar(
  { params, counts, projects, view, webglOk, moved, sceneOn, compact, onParams, onView, onReset, onFullscreen, className },
  projectRef,
) {
  const needsOn = params.needs
  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <SegmentedControl<KindFilter>
        size="sm"
        aria-label="kind 篩選"
        data-testid="office-kind-filter"
        value={params.kind}
        onChange={(kind) => onParams({ kind })}
        items={[
          { value: 'all', label: '全部', count: counts.all },
          { value: 'claude', label: 'Claude', count: counts.claude },
          { value: 'codex', label: 'Codex', count: counts.codex },
        ]}
      />
      <PickMenu
        label="專案"
        value={params.project}
        options={projects.map((p) => ({ value: p, label: p }))}
        allLabel="全部"
        onChange={(project) => onParams({ project })}
        trigger={
          <Button ref={projectRef} type="button" variant="outline" size="sm" data-testid="office-project-select" aria-label={`專案：${params.project ?? '全部'}`}>
            <span className="max-w-32 truncate">專案：{params.project ?? '全部'}</span>
            <ChevronDown aria-hidden className="text-muted-foreground" />
          </Button>
        }
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid="office-needs-toggle"
        aria-pressed={needsOn}
        disabled={counts.needs === 0 && !needsOn}
        onClick={() => onParams({ needs: !needsOn })}
        className={cn(needsOn && 'border-transparent bg-accent text-accent-foreground hover:bg-accent')}
      >
        <StatusDot tone="danger" size="sm" />
        只看需要你
        {counts.needs > 0 && <Tag variant="danger">{counts.needs}</Tag>}
      </Button>
      <SegmentedControl<OfficeView>
        size="sm"
        kind="group"
        aria-label="視圖"
        data-testid="office-view-toggle"
        value={view}
        onChange={onView}
        items={[
          {
            value: '3d',
            disabled: !webglOk,
            label: webglOk ? (
              '3D'
            ) : (
              <>
                <Ban aria-hidden className="mr-1 size-3" />
                3D
              </>
            ),
          },
          { value: 'list', label: '清單' },
        ]}
      />
      {sceneOn && (
        <>
          <Button
            type="button"
            variant="ghost"
            size={compact ? 'icon-sm' : 'sm'}
            aria-label="重設視角"
            data-moved={moved}
            onClick={onReset}
            className={cn(moved ? 'bg-accent text-accent-foreground hover:bg-accent' : 'text-muted-foreground')}
          >
            <RotateCcw />
            {!compact && '重設視角'}
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="全螢幕" onClick={onFullscreen} className="text-muted-foreground">
            <Maximize2 />
          </Button>
        </>
      )}
      <KeyHelp />
    </div>
  )
})
