// 極簡 ANSI 解析：只吃 SGR（顏色、粗體、斜體、底線、反白…），其他 CSI／OSC 控制序列直接丟掉。
// herdr `pane read --format ansi` 給的是已排版好的畫面，逐行輸出，不需要游標定位。

export interface AnsiStyle {
  fg?: string
  bg?: string
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
  inverse?: boolean
  strike?: boolean
}

export interface AnsiSegment {
  text: string
  style: AnsiStyle
}

/** xterm 預設 16 色 */
export const BASIC = [
  '#000000', '#cd3131', '#0dbc79', '#e5e510', '#2472c8', '#bc3fbc', '#11a8cd', '#e5e5e5',
  '#666666', '#f14c4c', '#23d18b', '#f5f543', '#3b8eea', '#d670d6', '#29b8db', '#ffffff',
]

const hex = (n: number) => n.toString(16).padStart(2, '0')

export function color256(n: number): string {
  if (n < 16) return BASIC[n]
  if (n < 232) {
    const i = n - 16
    const v = (c: number) => (c === 0 ? 0 : 55 + c * 40)
    return `#${hex(v(Math.floor(i / 36)))}${hex(v(Math.floor(i / 6) % 6))}${hex(v(i % 6))}`
  }
  const g = 8 + (n - 232) * 10
  return `#${hex(g)}${hex(g)}${hex(g)}`
}

function applySgr(style: AnsiStyle, params: number[]): AnsiStyle {
  const s = { ...style }
  if (params.length === 0) params = [0]
  for (let i = 0; i < params.length; i++) {
    const p = params[i]
    if (p === 0) for (const k of Object.keys(s)) delete s[k as keyof AnsiStyle]
    else if (p === 1) s.bold = true
    else if (p === 2) s.dim = true
    else if (p === 3) s.italic = true
    else if (p === 4) s.underline = true
    else if (p === 7) s.inverse = true
    else if (p === 9) s.strike = true
    else if (p === 22) s.bold = s.dim = undefined
    else if (p === 23) s.italic = undefined
    else if (p === 24) s.underline = undefined
    else if (p === 27) s.inverse = undefined
    else if (p === 29) s.strike = undefined
    else if (p >= 30 && p <= 37) s.fg = BASIC[p - 30]
    else if (p === 39) s.fg = undefined
    else if (p >= 40 && p <= 47) s.bg = BASIC[p - 40]
    else if (p === 49) s.bg = undefined
    else if (p >= 90 && p <= 97) s.fg = BASIC[p - 90 + 8]
    else if (p >= 100 && p <= 107) s.bg = BASIC[p - 100 + 8]
    else if (p === 38 || p === 48) {
      const key = p === 38 ? 'fg' : 'bg'
      if (params[i + 1] === 5 && params[i + 2] !== undefined) {
        s[key] = color256(params[i + 2])
        i += 2
      } else if (params[i + 1] === 2 && params[i + 4] !== undefined) {
        s[key] = `#${hex(params[i + 2] & 255)}${hex(params[i + 3] & 255)}${hex(params[i + 4] & 255)}`
        i += 4
      }
    }
  }
  for (const k of Object.keys(s) as (keyof AnsiStyle)[]) if (s[k] === undefined) delete s[k]
  return s
}

// CSI（ESC [ ... 終止字元）、OSC（ESC ] ... BEL 或 ESC \）、其他兩字元 ESC 序列
const SEQ = /\u001b\[([0-9;:?]*)([@-~])|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-Z\\-_]/g

/** 解析成逐行的片段；樣式跨行延續（跟終端一樣） */
export function parseAnsi(input: string): AnsiSegment[][] {
  const lines: AnsiSegment[][] = [[]]
  let style: AnsiStyle = {}
  const push = (text: string) => {
    const parts = text.replace(/\r\n?/g, '\n').split('\n')
    parts.forEach((t, i) => {
      if (i > 0) lines.push([])
      // eslint-disable-next-line no-control-regex
      const clean = t.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
      if (!clean) return
      const line = lines[lines.length - 1]
      const last = line[line.length - 1]
      if (last && last.style === style) last.text += clean
      else line.push({ text: clean, style })
    })
  }
  let at = 0
  for (const m of input.matchAll(SEQ)) {
    push(input.slice(at, m.index))
    at = m.index + m[0].length
    if (m[2] === 'm' && !m[1].includes('?')) style = applySgr(style, m[1] === '' ? [] : m[1].split(/[;:]/).map((x) => Number(x) || 0))
  }
  push(input.slice(at))
  if (lines.length > 1 && lines[lines.length - 1].length === 0) lines.pop()
  return lines
}
