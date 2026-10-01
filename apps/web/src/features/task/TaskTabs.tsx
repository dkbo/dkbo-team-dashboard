import { useState } from 'react'
import { CheckSquare, Square } from 'lucide-react'
import type { TaskDetail } from '@dash/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { fmtTs } from './format'
import { ALL_TYPES, filterMessages, messageTypes } from './model'

function Empty({ children }: { children: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>
}

function Globs({ items }: { items: string[] }) {
  if (items.length === 0) return <span className="text-muted-foreground">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((g) => (
        <code key={g} className="rounded bg-muted px-1.5 py-0.5 text-xs">
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
            <CheckSquare className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-label="已勾選" />
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
        <TableRow>
          <TableHead>成員</TableHead>
          <TableHead>可改</TableHead>
          <TableHead>只讀</TableHead>
          <TableHead>獨佔資源</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {owners.map((o) => (
          <TableRow key={o.member} className="align-top">
            <TableCell className="font-medium">{o.member}</TableCell>
            <TableCell className="whitespace-normal">
              <Globs items={o.writable} />
            </TableCell>
            <TableCell className="whitespace-normal">
              <Globs items={o.readonly} />
            </TableCell>
            <TableCell className="whitespace-normal">
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
              <Badge variant="outline" className="mr-2 border-violet-500/50 text-violet-700 dark:text-violet-400">
                自主
              </Badge>
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
      <div className="flex flex-wrap gap-1" role="group" aria-label="依類型篩選">
        <Button
          size="xs"
          variant={type === ALL_TYPES ? 'default' : 'outline'}
          aria-pressed={type === ALL_TYPES}
          onClick={() => setType(ALL_TYPES)}
        >
          全部 {task.messages.length}
        </Button>
        {types.map((t) => (
          <Button
            key={t.type}
            size="xs"
            variant={type === t.type ? 'default' : 'outline'}
            aria-pressed={type === t.type}
            onClick={() => setType(t.type)}
          >
            {t.type} {t.count}
          </Button>
        ))}
      </div>
      <ul data-testid="message-list" className="flex flex-col divide-y">
        {shown.map((m, i) => (
          <li key={i} className="flex flex-wrap gap-x-3 gap-y-1 py-2">
            <span className="font-mono text-xs text-muted-foreground">{fmtTs(m.ts)}</span>
            <Badge variant="secondary">{m.type}</Badge>
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

export function TaskTabs({ task }: { task: TaskDetail }) {
  return (
    <Tabs defaultValue="acceptance">
      <TabsList className="flex-wrap">
        <TabsTrigger value="acceptance">驗收標準 {task.brief.acceptance.length}</TabsTrigger>
        <TabsTrigger value="owners">檔案所有權</TabsTrigger>
        <TabsTrigger value="rulings">裁定 {task.rulings.length}</TabsTrigger>
        <TabsTrigger value="messages">訊息 {task.messages.length}</TabsTrigger>
        <TabsTrigger value="events">事件原文 {task.events.length}</TabsTrigger>
      </TabsList>
      <Card>
        <CardContent>
          <TabsContent value="acceptance">
            <AcceptancePanel task={task} />
          </TabsContent>
          <TabsContent value="owners">
            <OwnersPanel task={task} />
          </TabsContent>
          <TabsContent value="rulings">
            <RulingsPanel task={task} />
          </TabsContent>
          <TabsContent value="messages">
            <MessagesPanel task={task} />
          </TabsContent>
          <TabsContent value="events">
            <EventsPanel task={task} />
          </TabsContent>
        </CardContent>
      </Card>
    </Tabs>
  )
}
