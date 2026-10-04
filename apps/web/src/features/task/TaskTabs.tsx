import { useState } from 'react'
import { CheckSquare, Square } from 'lucide-react'
import type { TaskDetail } from '@dash/shared'
import { EmptyState } from '@/components/app/EmptyState'
import { SegmentedControl } from '@/components/app/SegmentedControl'
import { Tag, activityTagVariant } from '@/components/app/Tag'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fmtTs } from './format'
import { ALL_TYPES, filterMessages, messageTypes } from './model'

function Empty({ children }: { children: string }) {
  return <EmptyState title={children} />
}

function Globs({ items }: { items: string[] }) {
  if (items.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((g) => (
        <code key={g} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">
          {g}
        </code>
      ))}
    </div>
  )
}

function AcceptancePanel({ task }: { task: TaskDetail }) {
  const items = task.brief.acceptance
  if (items.length === 0) return <Empty>brief 沒有驗收標準</Empty>
  return (
    <ul className="flex flex-col gap-2">
      {items.map((a, i) => (
        <li key={i} className="flex gap-2">
          {a.checked ? (
            <CheckSquare className="mt-0.5 size-4 shrink-0 text-status-ok-fg" aria-label="已勾選" />
          ) : (
            <Square className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="未勾選" />
          )}
          <span className="whitespace-pre-wrap">{a.text}</span>
        </li>
      ))}
    </ul>
  )
}

function OwnersPanel({ task }: { task: TaskDetail }) {
  const owners = task.brief.owners
  if (owners.length === 0) return <Empty>brief 沒有檔案所有權表</Empty>
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>成員</TableHead>
          <TableHead>可改</TableHead>
          <TableHead>只讀</TableHead>
          <TableHead>獨佔資源</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {owners.map((o) => (
          <TableRow key={o.member} className="align-top">
            <TableCell className="py-3 font-semibold">{o.member}</TableCell>
            <TableCell className="py-3 whitespace-normal">
              <Globs items={o.writable} />
            </TableCell>
            <TableCell className="py-3 whitespace-normal">
              <Globs items={o.readonly} />
            </TableCell>
            <TableCell className="py-3 whitespace-normal">
              <Globs items={o.exclusive} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

const AUTO_PREFIX = /^\[自主\]\s*/

function RulingsPanel({ task }: { task: TaskDetail }) {
  if (task.rulings.length === 0) return <Empty>沒有裁定</Empty>
  return (
    <ol className="flex flex-col gap-3">
      {task.rulings.map((r, i) => (
        <li key={i} data-testid={`ruling-${i}`} className="flex gap-3">
          <span className="shrink-0 font-mono text-xs text-muted-foreground">{fmtTs(r.ts)}</span>
          <div className="min-w-0">
            {r.autonomous && (
              <Tag variant="brand" className="mr-2 align-middle">
                自主
              </Tag>
            )}
            <span className="whitespace-pre-wrap break-words">{r.text.replace(AUTO_PREFIX, '')}</span>
          </div>
        </li>
      ))}
    </ol>
  )
}

function MessagesPanel({ task }: { task: TaskDetail }) {
  const [type, setType] = useState(ALL_TYPES)
  const types = messageTypes(task.messages)
  const shown = filterMessages(task.messages, type)
  if (task.messages.length === 0) return <Empty>沒有訊息</Empty>
  return (
    <div className="flex flex-col gap-3">
      <SegmentedControl
        kind="group"
        size="sm"
        aria-label="依類型篩選"
        className="self-start"
        value={type}
        onChange={setType}
        items={[{ value: ALL_TYPES, label: '全部', count: task.messages.length }, ...types.map((t) => ({ value: t.type, label: t.type, count: t.count }))]}
      />
      <ul data-testid="message-list" className="flex flex-col">
        {shown.map((m, i) => (
          <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b py-2 last:border-0">
            <span className="font-mono text-xs text-muted-foreground">{fmtTs(m.ts)}</span>
            <Tag variant={activityTagVariant(m.type)}>{m.type}</Tag>
            <span className="font-mono text-xs">
              {m.from}
              {m.to && <> → {m.to}</>}
            </span>
            {m.text && <span className="basis-full whitespace-pre-wrap break-words">{m.text}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

function EventsPanel({ task }: { task: TaskDetail }) {
  if (task.events.length === 0) return <Empty>沒有事件</Empty>
  return (
    <ol className="flex flex-col font-mono text-xs">
      {task.events.map((e, i) => (
        <li key={i} className="flex gap-3 py-0.5">
          <span className="shrink-0 text-muted-foreground">{e.ts}</span>
          <span className="whitespace-pre-wrap break-all">{e.text}</span>
        </li>
      ))}
    </ol>
  )
}

type TabKey = 'acceptance' | 'owners' | 'rulings' | 'messages' | 'events'

const PANELS: Record<TabKey, (p: { task: TaskDetail }) => React.ReactNode> = {
  acceptance: AcceptancePanel,
  owners: OwnersPanel,
  rulings: RulingsPanel,
  messages: MessagesPanel,
  events: EventsPanel,
}

/** 驗收標準／檔案所有權／裁定／訊息／事件原文：SegmentedControl（tablist）切換，內容放一張卡 */
export function TaskTabs({ task }: { task: TaskDetail }) {
  const [tab, setTab] = useState<TabKey>('acceptance')
  const items: { value: TabKey; label: string; count?: number }[] = [
    { value: 'acceptance', label: '驗收標準', count: task.brief.acceptance.length },
    { value: 'owners', label: '檔案所有權' },
    { value: 'rulings', label: '裁定', count: task.rulings.length },
    { value: 'messages', label: '訊息', count: task.messages.length },
    { value: 'events', label: '事件原文', count: task.events.length },
  ]
  const Panel = PANELS[tab]
  return (
    <section aria-label="任務內容" className="flex flex-col gap-3">
      <SegmentedControl<TabKey> aria-label="任務內容" items={items} value={tab} onChange={setTab} className="self-start" />
      <Card>
        <CardContent role="tabpanel" aria-label={items.find((i) => i.value === tab)?.label}>
          <Panel key={tab} task={task} />
        </CardContent>
      </Card>
    </section>
  )
}
