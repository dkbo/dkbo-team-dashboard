import { describe, expect, it } from 'vitest'
import { BASIC, color256, parseAnsi } from '@/lib/ansi'

describe('parseAnsi', () => {
  it('切行（CRLF）、純文字無樣式', () => {
    expect(parseAnsi('ab\r\ncd\r\n')).toEqual([[{ text: 'ab', style: {} }], [{ text: 'cd', style: {} }]])
  })

  it('SGR：粗體、16 色、256 色、truecolor、重設', () => {
    const [line] = parseAnsi('\u001b[1;31mA\u001b[0mB\u001b[38;5;196mC\u001b[48;2;1;2;3mD\u001b[39;49mE')
    expect(line).toEqual([
      { text: 'A', style: { bold: true, fg: BASIC[1] } },
      { text: 'B', style: {} },
      { text: 'C', style: { fg: color256(196) } },
      { text: 'D', style: { fg: color256(196), bg: '#010203' } },
      { text: 'E', style: {} },
    ])
  })

  it('樣式跨行延續；非 SGR 控制序列與 OSC 被丟掉', () => {
    const lines = parseAnsi('\u001b[32mx\ny\u001b[?25l\u001b[2J\u001b]0;title\u0007z')
    expect(lines).toEqual([[{ text: 'x', style: { fg: BASIC[2] } }], [{ text: 'yz', style: { fg: BASIC[2] } }]])
  })

  it('256 色表：cube 與灰階', () => {
    expect(color256(16)).toBe('#000000')
    expect(color256(231)).toBe('#ffffff')
    expect(color256(232)).toBe('#080808')
  })
})
