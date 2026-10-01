import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export interface CopyCommandProps {
  command: string
  className?: string
}

export function CopyCommand({ command, className }: CopyCommandProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
    } catch {
      // 非安全來源或被拒：使用者仍可手動選取文字
    }
  }

  return (
    <div className={cn('flex items-center gap-1 rounded-md border bg-muted/50 py-0.5 pr-0.5 pl-2', className)}>
      <code className="min-w-0 flex-1 truncate font-mono text-xs select-all">{command}</code>
      <Button type="button" variant="ghost" size="xs" aria-label="複製指令" onClick={copy}>
        {copied ? <Check /> : <Copy />}
        <span className={cn(!copied && 'sr-only')}>{copied ? '已複製' : '複製'}</span>
      </Button>
    </div>
  )
}
