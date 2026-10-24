import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// 連結字用 text-link-fg（亮暗對 background／card／muted ≥ 4.5:1），不用 text-primary（亮 3.16／暗 3.81）
const FILES = [
  'src/features/office/FinderPanel.tsx',
  'src/features/office/OfficeList.tsx',
  'src/features/office/OfficeCanvas.tsx',
  'src/pages/office/OfficePage.tsx',
]

describe('office 連結字 token', () => {
  it.each(FILES)('%s 沒有 text-primary 連結字', (f) => {
    expect(readFileSync(f, 'utf8')).not.toMatch(/(?<![\w-])text-primary(?![\w-])/)
  })

  it('找人清單「展開全部」用 text-link-fg', () => {
    const src = readFileSync('src/features/office/FinderPanel.tsx', 'utf8')
    expect(src).toMatch(/text-link-fg[^"]*"[^>]*>\s*\{collapsed/)
  })
})
