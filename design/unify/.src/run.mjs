// usage: node run.mjs <snippets.js> <in.pen|-> <out.pen> <preview.png>   (lib.js prepended to every snippet)
import { readFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const [src, inp, out, prev] = process.argv.slice(2)
const dir = new URL('./', import.meta.url)
const lib = readdirSync(dir).filter(f => /^lib.*\.js$/.test(f)).sort().map(f => readFileSync(new URL(f, dir), 'utf8')).join('\n')
const parts = readFileSync(src, 'utf8').split(/^\/\/---.*$/m).map(s => s.trim()).filter(Boolean)
let stdin = parts.map(p => `execute({ input: ${JSON.stringify(lib + '\n' + p)} })`).join('\n') + '\nsave()\nexit()\n'
const args = ['interactive', '--out', out, '--preview-output', prev]
if (inp !== '-') args.push('--in', inp)
const r = spawnSync('pen', args, { input: stdin, encoding: 'utf8', maxBuffer: 1 << 28, timeout: 900000 })
const txt = (r.stdout + r.stderr).split('\n').filter(l => !/Update available|npm i -g|╭|╰|^\s*│|^\s*$/.test(l)).join('\n')
console.log(txt.replace(/data:image[^"'\s]{100,}/g, '[img]').replace(/## Created nodes by name[\s\S]*?```[\s\S]*?```/g, '[nodes]').slice(-6000))
