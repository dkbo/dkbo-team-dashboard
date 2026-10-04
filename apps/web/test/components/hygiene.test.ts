// AC10：舊色階覆寫已刪、apps/web/src 的任意值／舊色階只剩 chart 色盤與終端（brief AC10 兩條 grep 的守門）
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(import.meta.dirname, '../../src')

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? files(path.join(dir, d.name)) : [path.join(dir, d.name)],
  )
}

/** 回傳 `相對路徑:行號` 清單，等同 grep -rnE */
function grep(re: RegExp, only?: RegExp): string[] {
  return files(SRC)
    .filter((f) => !only || only.test(f))
    .flatMap((f) =>
      readFileSync(f, 'utf8')
        .split('\n')
        .flatMap((line, i) => (re.test(line) ? [`${path.relative(SRC, f)}:${i + 1}`] : [])),
    )
}

// 允許清單：只剩 chart 色盤與終端（理由見 frontend-base 波 3 report）
const CHART_PALETTE = [
  'components/ui/chart.tsx', // shadcn 對 recharts 預設 stroke（#ccc／#fff）的屬性選擇器，改成格線 token
  'features/git/CommitHistory.tsx', // commit 圖 lane 色盤＝dataviz 類別色盤 slot 1–8（同 trends/palette.ts）
]
const allowed = (hit: string) => CHART_PALETTE.some((f) => hit.startsWith(`${f}:`))

describe('AC10 收尾', () => {
  it('index.css 不再有第二個 @theme 的舊色階覆寫', () => {
    const css = readFileSync(path.join(SRC, 'index.css'), 'utf8')
    expect(css).not.toMatch(/--color-(red|amber|emerald|sky|orange|yellow|violet)-\d+\s*:/)
    expect(css.match(/@theme\s*\{/g) ?? []).toHaveLength(0)
  })

  it('grep text-[ / rounded-[ / 舊色階 只剩 chart 色盤與終端', () => {
    const hits = grep(/text-\[|rounded-\[|(red|amber|emerald|sky|orange|yellow|violet)-[0-9]/)
    expect(hits.filter((h) => !allowed(h))).toEqual([])
  })

  it('grep .tsx 的 hex 與 -[Npx] 只剩 chart 色盤與終端', () => {
    const hits = grep(/#[0-9a-fA-F]{3,8}\b|-\[[0-9.]+px\]/, /\.tsx$/)
    expect(hits.filter((h) => !allowed(h))).toEqual([])
  })
})
