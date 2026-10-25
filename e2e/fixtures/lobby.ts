import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, renameSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { DetailDoc, ListDoc, TaskSummary } from '../../packages/shared/src/index.ts'
import { claudeDir, codexDir, projectsDir } from './paths'
import { RUNNING_DIR } from './projects'

// 辦公室頁面物件與事件（任務 lobby）AC13：e2e 執行中改 fixture 的小工具。
// 假 dk-status 每次呼叫都重讀 `.dkbo/fake/*.json`，server 在下一輪輪詢（pollMs 5 秒）把變動推成 SSE，
// 所以「改檔 → 等 ≤ 10 秒」就是 e2e 裡的「任務資料變了」。每個 helper 都在 finally 還原，不留下會影響其他 spec 的狀態。

const teamflowDir = path.join(projectsDir, 'teamflow')
const fakeDir = path.join(teamflowDir, '.dkbo/fake')
const listFile = path.join(fakeDir, 'list.json')
const detailFile = (dir: string) => path.join(fakeDir, 'details', `${dir}.json`)

const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T
/** 先寫暫存檔再 rename：server 輪詢時不會讀到寫一半的 JSON */
const writeJson = (file: string, v: unknown) => {
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(v, null, 2) + '\n')
  renameSync(tmp, file)
}

export const localTs = (ms: number) => {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

type Task = DetailDoc['task']

/** 改進行中任務（RUNNING_DIR）的 detail 與 list 摘要；回傳還原函式 */
export function mutateRunning(edit: (task: Task, summary: TaskSummary, list: ListDoc) => void, dir = RUNNING_DIR): () => void {
  const list0 = readFileSync(listFile, 'utf8')
  const detail0 = readFileSync(detailFile(dir), 'utf8')
  const list = JSON.parse(list0) as ListDoc
  const doc = JSON.parse(detail0) as DetailDoc
  const summary = list.tasks.find((t) => t.dir === dir)!
  edit(doc.task, summary, list)
  writeJson(detailFile(dir), doc)
  writeJson(listFile, list)
  return () => {
    writeFileSync(detailFile(dir), detail0)
    writeFileSync(listFile, list0)
  }
}

/** 診斷用：跑一次假 dk-status 看它吐出的波 2（server 讀到的就是這個）與耗時 */
export function runFakeDkStatus(dir = RUNNING_DIR): string {
  const t0 = Date.now()
  try {
    const out = execFileSync(process.execPath, [path.join(__dirname, 'fake-dk-status.mjs'), '--json', dir], { env: { ...process.env, DK_ROOT: path.join(teamflowDir, '.dkbo') }, encoding: 'utf8', timeout: 20_000 })
    const w = (JSON.parse(out) as DetailDoc).task.waves.find((x) => x.wave === 2)
    return JSON.stringify([w?.review_spawned_at, w?.review_verdict]) + ` ${Date.now() - t0}ms`
  } catch (e) {
    return `失敗 ${(e as Error).message.split('\n')[0]} ${Date.now() - t0}ms`
  }
}

/** 診斷用：fixture 檔目前的波 2 verdict（區分「檔沒寫進去」與「server 沒讀到」） */
export function peekWave2(dir = RUNNING_DIR): unknown {
  const w = readJson<DetailDoc>(detailFile(dir)).task.waves.find((x) => x.wave === 2)
  return w ? [w.review_spawned_at, w.review_verdict, w.review_verdict_at] : null
}

/** list 層的 kinds_down（E4 跳電）：until 之前該 kind 視為熔斷 */
export function setKindsDown(kinds: string[], untilMs: number): () => void {
  const list0 = readFileSync(listFile, 'utf8')
  const list = JSON.parse(list0) as ListDoc
  const at = localTs(Date.now())
  list.kinds_down = kinds.map((kind) => ({ kind, until: localTs(untilMs), until_epoch: Math.floor(untilMs / 1000), exact: true, recorded_at: at, from_task: RUNNING_DIR, agent: `e2erun-${kind}`, reason: 'e2e' }))
  writeJson(listFile, list)
  return () => writeFileSync(listFile, list0)
}

/** 讓 e2erun 任務依序走過四幕的資料變動（每個函式回傳還原函式；測試自己控制節奏） */
export const act = {
  /** 幕一：波 2 開審查（本波 dev 兩位 → 目標白板，E6） */
  reviewSpawned: () =>
    mutateRunning((t) => {
      t.brief.waves = [
        { wave: 2, type: '實作', member: 'frontend-shell', what: 'e2e', tier: 'M', done: null, review: null },
        { wave: 2, type: '實作', member: 'backend', what: 'e2e', tier: 'M', done: null, review: null },
      ]
      const w = t.waves.find((x) => x.wave === 2)!
      w.dev_done_at = localTs(Date.now())
      w.review_spawned_at = localTs(Date.now())
    }),
  /** 幕二：審查要修（important K，演員＝本波全部 dev） */
  reviewFix: (k = 2) =>
    mutateRunning((t) => {
      const w = t.waves.find((x) => x.wave === 2)!
      w.review_verdict_at = localTs(Date.now())
      w.review_verdict = `a: important ${k}`
    }),
  /** 幕二之二：複看由 important 轉 ok → 「通過」 */
  reviewPass: () =>
    mutateRunning((t) => {
      const w = t.waves.find((x) => x.wave === 2)!
      w.review_verdict_at = localTs(Date.now())
      w.review_verdict = 'a: ok'
    }),
  /** 幕三：波 2 關閉（waves_closed 1 → 2） */
  waveClosed: () =>
    mutateRunning((t, s) => {
      const w = t.waves.find((x) => x.wave === 2)!
      w.closed_at = localTs(Date.now())
      t.waves_closed = 2
      s.waves_closed = 2
    }),
  /** 幕四：結案 done（以 list 的 close_result 判定；任務離開進行中） */
  taskDone: () =>
    mutateRunning((t, s) => {
      for (const x of [t, s]) {
        x.status = 'done'
        x.close_result = 'merged e2erun'
        x.closed_at = localTs(Date.now())
        x.current_wave = null
      }
    }),
}

/**
 * E5 衝突燈：在 teamflow 的 git 上造一個合併衝突（只在拋棄式分支上做，main 與 commit 數不動），
 * body 跑完用 `merge --abort` 回到 main 並刪分支。基準 repo 的 README 有未暫存改動，所以 conflict.txt 另開。
 */
export async function withGitConflict(body: () => Promise<void>) {
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'E2E', GIT_AUTHOR_EMAIL: 'e2e@example.com', GIT_COMMITTER_NAME: 'E2E', GIT_COMMITTER_EMAIL: 'e2e@example.com' }
  const git = (...args: string[]) => execFileSync('git', args, { cwd: teamflowDir, env, stdio: 'pipe' })
  const file = path.join(teamflowDir, 'conflict.txt')
  try {
    for (const b of ['e2e-conflict-a', 'e2e-conflict-b']) {
      git('checkout', '-q', '-b', b, 'main')
      writeFileSync(file, `${b}\n`)
      git('add', 'conflict.txt')
      git('commit', '-q', '-m', b)
    }
    git('checkout', '-q', 'e2e-conflict-a')
    try {
      git('merge', '-q', 'e2e-conflict-b')
    } catch {
      /* 預期衝突 */
    }
    await body()
  } finally {
    try {
      git('merge', '--abort')
    } catch {
      /* 沒在合併 */
    }
    // 每個動作各自 try：某步失敗（如第一個 checkout -b 就失敗、分支不存在）不能蓋掉 body 原本的錯誤
    try {
      git('checkout', '-q', 'main')
    } catch {
      /* 已在 main */
    }
    for (const b of ['e2e-conflict-a', 'e2e-conflict-b']) {
      try {
        git('branch', '-q', '-D', b)
      } catch {
        /* 分支沒建成 */
      }
    }
  }
}

/** 找 session transcript（claude／codex 目錄遞迴找檔名含 sid 的 .jsonl） */
function findTranscript(root: string, sid: string): string {
  for (const e of readdirSync(root, { withFileTypes: true, recursive: true })) {
    if (e.isFile() && e.name.endsWith('.jsonl') && e.name.includes(sid)) return path.join(e.parentPath, e.name)
  }
  throw new Error(`找不到 session ${sid} 的 transcript（${root}）`)
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/
// 去掉毫秒：server 以「檔案大小 === 已讀位移」判斷沒新內容，改時間不改長度會被略過；變小才會從頭重讀
const shift = (v: unknown, ms: number): unknown => {
  if (typeof v === 'string' && ISO.test(v)) return new Date(Date.parse(v) - ms).toISOString().replace(/\.\d+Z$/, 'Z')
  if (Array.isArray(v)) return v.map((x) => shift(x, ms))
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shift(x, ms)]))
  return v
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * 把某個 session 的所有事件時間與檔案 mtime 往前推 ms（模擬「過了這麼久」）；回傳還原函式（async）。
 * server 的 tail 是增量讀（位移＝上次讀到的大小）：改寫後的檔必須比現有的小才會被重讀（去毫秒保證），
 * 還原時檔案變大、增量讀會讀到半行，所以先清空、等 server 輪詢（1 秒）重置、再寫回原文。
 */
export function ageSession(kind: 'claude' | 'codex', sid: string, ms: number): () => Promise<void> {
  const file = findTranscript(kind === 'claude' ? claudeDir : codexDir, sid)
  const text0 = readFileSync(file, 'utf8')
  const st0 = statSync(file)
  const lines = text0.split('\n').filter(Boolean).map((l) => JSON.stringify(shift(JSON.parse(l), ms)))
  const aged = lines.join('\n') + '\n'
  if (Buffer.byteLength(aged) >= st0.size) throw new Error(`ageSession(${sid})：改寫後沒有變小（${Buffer.byteLength(aged)} ≥ ${st0.size}），server 不會重讀；transcript 時間沒有毫秒？`)
  writeFileSync(file, aged)
  const mt = (st0.mtimeMs - ms) / 1000
  utimesSync(file, mt, mt)
  return async () => {
    writeFileSync(file, '')
    await sleep(2_500)
    writeFileSync(file, text0)
    utimesSync(file, st0.atimeMs / 1000, st0.mtimeMs / 1000)
  }
}
