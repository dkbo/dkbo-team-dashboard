import { execFileSync } from 'node:child_process'
import { chmodSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  teamflowDetailBklog,
  teamflowDetailOps,
  teamflowDkboFiles,
  teamflowList,
} from '../../packages/shared/fixtures/index.ts'
import { configFile, fixturesDir, gitBinFile, gitLogFile, projectsDir, runtimeDir, snapshotSeedFile } from './paths'

// 在執行期目錄建假專案，e2e 不讀任何真實專案：
// - teamflow：原生模式，.dkbo/bin/dk-status 是假 dk-status，資料取自 packages/shared/fixtures 的 teamflow-*，
//   另加一件進行中任務 RUNNING_DIR（波 2 在 setup 時已開 300 分鐘，驗總覽「波 N 進行中 · 已 X」）
// - collect：相容模式（沒有 bin/dk-status），server 經 overlay 用 vendor/dkbo-status 讀它手造的 tasks/
// - missing-project：路徑故意不存在
// 產生的 dashboard config 與 herdr 快照 seed 也寫在執行期目錄；任何專案路徑不在執行期目錄底下就 throw。

const teamflowDir = path.join(projectsDir, 'teamflow')
const collectDir = path.join(projectsDir, 'collect')
const missingDir = path.join(projectsDir, 'missing-project')

type Detail = typeof teamflowDetailOps
type ListTask = (typeof teamflowList)['tasks'][number]

/** fixture 裡的 repo 路徑換成假專案底下 */
const relocate = (d: Detail): Detail => ({
  ...d,
  task: {
    ...d.task,
    repos: d.task.repos.map((r) => ({ ...r, path: teamflowDir, worktree: r.worktree && path.join(teamflowDir, '.worktrees', d.task.short) })),
  },
})

/** 沒有真實 detail fixture 的任務：摘要欄位照 list，詳情欄位全空 */
const synthDetail = (t: ListTask): Detail => ({
  ...teamflowDetailOps,
  task: {
    ...t,
    repos: [],
    brief: { goal: null, acceptance: [], owners: [], waves: [] },
    waves: [],
    members: [],
    panes: [],
    rulings: [],
    events: [],
    messages: [],
    skipped_lines: { process: 0, messages: 0 },
  },
})

/** server 若執行（source）了 kinds 檔就會建出這個檔；e2e 斷言它不存在 */
export const kindsCanaryFile = path.join(runtimeDir, 'kinds-executed')

export const RUNNING_DIR = '2026-09-26-e2erun'
const localTs = (ms: number) => {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 進行中任務：3 波中已結 1 波，波 2 在 setup 當下 300 分鐘前開 */
function runningTask(now: number): { summary: ListTask; detail: Detail } {
  const base = teamflowList.tasks.find((t) => t.status === 'done')!
  const summary: ListTask = {
    ...base,
    dir: RUNNING_DIR,
    short: 'e2erun',
    date: RUNNING_DIR.slice(0, 10),
    status: 'running',
    current_wave: 2,
    waves_planned: 3,
    waves_closed: 1,
    closed_at: null,
    close_result: null,
    updated_at: localTs(now),
    panes_open: 0,
  }
  const [w1, w2] = teamflowDetailOps.task.waves
  const detail = synthDetail(summary)
  // 兩位成員各有 live pane（herdr-snapshot.json 的 wE:p2、wE:p3）：frontend-shell 設定 M＝sonnet/medium、實際 sonnet 5/high（不一致）；
  // backend 先 M 後以 L 重派（設定 opus/high、共 2 次），實際 opus 5.5/high（一致）
  const member = (name: string) => ({ ...teamflowDetailOps.task.members[0], name, status: 'working', wave: 2, current: 'e2e', touched: [], todo: [], notes: null })
  detail.task.members = [member('frontend-shell'), member('backend')]
  detail.task.panes = [
    { agent: 'e2erun-frontend-shell', pane: 'wE:p2', since_epoch: null, group: 'dev', tab: null, slot: null },
    { agent: 'e2erun-backend', pane: 'wE:p3', since_epoch: null, group: 'dev', tab: null, slot: null },
  ]
  detail.task.events = [
    { ts: localTs(now - 290 * 60_000), kind: 'spawn', text: 'spawn e2erun-frontend-shell (claude M)' },
    { ts: localTs(now - 290 * 60_000), kind: 'spawn', text: 'spawn e2erun-backend (claude M)' },
    { ts: localTs(now - 200 * 60_000), kind: 'spawn', text: 'spawn e2erun-backend (claude L) resume handoff' },
  ]
  detail.task.waves = [
    { ...w1, wave: 1 },
    { ...w2, wave: 2, opened_at: localTs(now - 300 * 60_000), dev_done_at: null, review_spawned_at: null, review_verdict_at: null, review_verdict: null, closed_at: null },
  ]
  return { summary, detail }
}

const writeJson = (file: string, v: unknown) => {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(v, null, 2) + '\n')
}

function makeTeamflow() {
  const dkbo = path.join(teamflowDir, '.dkbo')
  const bin = path.join(dkbo, 'bin/dk-status')
  mkdirSync(path.dirname(bin), { recursive: true })
  copyFileSync(path.join(fixturesDir, 'fake-dk-status.mjs'), bin)
  chmodSync(bin, 0o755)
  writeFileSync(path.join(dkbo, 'VERSION'), `${teamflowList.dkbo_version}\n`)
  // roles／kinds 檔：內容由 backend 定義（packages/shared/fixtures/dkbo-files.ts），server 只以文字讀
  for (const [rel, text] of Object.entries(teamflowDkboFiles)) {
    mkdirSync(path.dirname(path.join(dkbo, rel)), { recursive: true })
    writeFileSync(path.join(dkbo, rel), text)
  }
  // 沒有任何 spawn 用到的 kind：被 source 或執行就會 touch canary
  writeFileSync(path.join(dkbo, 'kinds/canary.sh'), `KIND_DEFAULT_TIERS="S=x/$(touch ${kindsCanaryFile}) M=x/y"\n$(touch ${kindsCanaryFile})\n`)
  const running = runningTask(Date.now())
  writeJson(path.join(dkbo, 'fake/list.json'), { ...teamflowList, tasks: [...teamflowList.tasks, running.summary] })
  writeJson(path.join(dkbo, 'fake/details', `${RUNNING_DIR}.json`), running.detail)
  const real = new Map([teamflowDetailOps, teamflowDetailBklog].map((d) => [d.task.dir, relocate(d)]))
  for (const t of teamflowList.tasks) writeJson(path.join(dkbo, 'fake/details', `${t.dir}.json`), real.get(t.dir) ?? synthDetail(t))
}

/** 0.16 舊版專案：只有 VERSION 與 tasks/，dk-status 由 server 的相容 overlay 提供 */
function makeCollect() {
  const task = path.join(collectDir, '.dkbo/tasks/2026-09-20-demo')
  mkdirSync(task, { recursive: true })
  writeFileSync(path.join(collectDir, '.dkbo/VERSION'), '0.16.0\n')
  writeFileSync(path.join(task, 'brief.md'), '# demo\n\n## 目標\ne2e 相容模式用的假任務\n')
}

/**
 * teamflow 同時是 git repo（/git 頁用）：main 上 init → feature 分支一個 commit → merge 回來、tag v1，
 * 再留一個未暫存的改動。另寫一支記錄參數的 git 包裝（DASH_GIT_BIN），e2e 斷言 server 只跑唯讀指令。
 */
function makeTeamflowGit() {
  const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 'E2E', GIT_AUTHOR_EMAIL: 'e2e@example.com', GIT_COMMITTER_NAME: 'E2E', GIT_COMMITTER_EMAIL: 'e2e@example.com' }
  const git = (...args: string[]) => execFileSync('git', args, { cwd: teamflowDir, env, stdio: 'pipe' })
  git('init', '-q', '-b', 'main')
  writeFileSync(path.join(teamflowDir, 'README.md'), '# teamflow\n')
  git('add', '.')
  git('commit', '-q', '-m', 'init teamflow')
  git('tag', 'v1')
  git('checkout', '-q', '-b', 'feature/e2e')
  writeFileSync(path.join(teamflowDir, 'feature.txt'), 'feature\n')
  git('add', 'feature.txt')
  git('commit', '-q', '-m', 'e2e feature work')
  git('checkout', '-q', 'main')
  git('merge', '-q', '--no-ff', '-m', 'merge feature/e2e', 'feature/e2e')
  writeFileSync(path.join(teamflowDir, 'README.md'), '# teamflow\n\ndirty\n')
  mkdirSync(path.dirname(gitBinFile), { recursive: true })
  writeFileSync(gitBinFile, `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> '${gitLogFile}'\nexec git "$@"\n`)
  chmodSync(gitBinFile, 0o755)
}

export function setupProjects() {
  makeTeamflow()
  makeCollect()
  makeTeamflowGit()
  const projects = [
    { name: 'teamflow', path: teamflowDir },
    { name: 'collect', path: collectDir },
    { name: 'missing-project', path: missingDir },
  ]
  for (const p of projects) {
    if (!path.resolve(p.path).startsWith(runtimeDir + path.sep)) throw new Error(`e2e 專案路徑不在執行期目錄 ${runtimeDir} 底下：${p.name} → ${p.path}`)
  }
  writeJson(configFile, { projects, pollMs: 5000 })
  // herdr 快照 fixture 的 cwd 用 {{PROJECTS}} 佔位，換成本次的假專案目錄
  writeFileSync(snapshotSeedFile, readFileSync(path.join(fixturesDir, 'herdr-snapshot.json'), 'utf8').replaceAll('{{PROJECTS}}', projectsDir))
}
