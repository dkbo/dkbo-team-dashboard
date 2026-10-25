// 場景分區與座位（office 規格 §4.3、§4.4；decisions Q5–Q8）。純函式：同樣的輸入永遠得到同樣的座位。
// 世界座標：1 格＝1 公尺；x 往右、z 往前（後牆 z=0、左牆 x=0），y 往上。
import type { OfficeSession, Substate } from '@dash/shared'

export interface TaskInfo {
  project: string
  display: string
  /** 座位順序（Q5）：brief 波次表的成員順序 */
  members: string[]
  wave: { current: number; planned: number } | null
}

export type LayoutSession = Pick<OfficeSession, 'id' | 'project' | 'taskDir' | 'member' | 'leader' | 'substateSince'> & {
  /** 已套 Q3／Q7 的有效細狀態 */
  substate: Substate
}

export interface Rect {
  x: number
  z: number
  w: number
  d: number
}

export type Area = 'task' | 'hot' | 'lounge'

export interface Place {
  x: number
  z: number
  /** 角色面向（繞 y 軸，0＝面向 +z，朝鏡頭） */
  rotY: number
  deskId: string | null
  area: Area
  pose: 'sit' | 'stand'
}

export interface Desk {
  id: string
  /** 任務 dir，或 'hot' */
  group: string
  kind: 'leader' | 'member' | 'hot'
  x: number
  z: number
  w: number
  d: number
  /** 坐在這張桌子的人面向（螢幕在他面前） */
  rotY: number
  occupant: string | null
}

export interface Zone {
  key: string
  kind: 'project' | 'hot' | 'lounge'
  title: string
  subtitle: string | null
  count: number
  needs: boolean
  rect: Rect
  /** 區牌錨點 [x, y, z] */
  sign: [number, number, number]
  /** project 區才有：區內各任務 dir */
  tasks: string[]
  /** AC9：桌群坐不下（第 13 位以後）而坐到散座區的人數，區牌顯示「+K 在散座」 */
  overflow: number
}

export type Tier = 'small' | 'medium'

export interface OfficeLayout {
  tier: Tier
  present: number
  /** 一般標記的預設倍數（中階 0.8） */
  markerScale: number
  room: { w: number; d: number }
  /** 辦公區寬；x ≥ officeW 是大廳（任務二才放東西） */
  officeW: number
  zones: Zone[]
  desks: Desk[]
  /** 現在該在的位置 */
  places: Record<string, Place>
  /** 自己的座位（done 從休息區回來的目的地） */
  homes: Record<string, Place>
  /** 休息區先到先佔的順序 */
  loungeOrder: string[]
  /** 任務白板中心（板面朝 +z，§4.6：桌群原點 +(0.2, 5.6) 起、寬 1.8） */
  boards: Record<string, { x: number; z: number }>
}

export const PAD = 0.4
export const ZONE_W = 9.2
export const ZONE_D = 6.6
export const AISLE = 0.6
export const FRONT_D = 5.6
export const LOBBY_W = 4.4
export const BASE_W = 20
export const BASE_D = 14
export const MEDIUM_EXTRA_D = 8
export const UNITS_PER_ROW = 3
export const SMALL_MAX = 12
export const MEMBER_DESK = { w: 1.4, d: 0.8 }
export const LEADER_DESK = { w: 1.9, d: 1.0 }
export const BOARD = { x: 0.2, z: 5.6, w: 1.8 }
/** AC9：成員桌 2 × N，N 預設 ≤ 4（區寬 9.2），最多 6（區依需要加寬） */
const BASE_COLS = 4
const MAX_COLS = 6
const MAX_MEMBERS = MAX_COLS * 2
const MEMBER_PITCH = 1.8
const HOT_PER_ROW = 4
const HOT_PITCH_X = 2.3
const HOT_PITCH_Z = 2.4
/** 人坐在桌子後方多遠（桌半深＋椅） */
const SEAT_GAP = 0.35
const FACE_FRONT = 0
const FACE_BACK = Math.PI

const NEEDS: ReadonlySet<Substate> = new Set(['waiting', 'error'])

const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** 人坐在桌子哪一側：面向 +z 時坐在桌子 -z 側 */
function seatOf(desk: Desk, area: Area): Place {
  const off = desk.d / 2 + SEAT_GAP
  const dz = desk.rotY === FACE_FRONT ? -off : off
  return { x: desk.x, z: desk.z + dz, rotY: desk.rotY, deskId: desk.id, area, pose: 'sit' }
}

const colsOf = (task: TaskInfo) => Math.max(1, Math.ceil(Math.min(MAX_MEMBERS, task.members.length) / 2))

/** 一個桌群單位的寬：N > 4 時每多一欄加一個桌距 */
export const unitWidth = (task: TaskInfo) => ZONE_W + Math.max(0, colsOf(task) - BASE_COLS) * MEMBER_PITCH

function taskDesks(dir: string, task: TaskInfo, ux: number, uz: number): Desk[] {
  const desks: Desk[] = [
    { id: `${dir}#leader`, group: dir, kind: 'leader', x: ux + 1.35, z: uz + 4.9, ...LEADER_DESK, rotY: FACE_FRONT, occupant: null },
  ]
  const cols = colsOf(task)
  for (let i = 0; i < cols * 2; i++) {
    const col = Math.floor(i / 2)
    const back = i % 2 === 0
    desks.push({
      id: `${dir}#m${i}`,
      group: dir,
      kind: 'member',
      x: ux + 3.1 + col * MEMBER_PITCH,
      z: uz + (back ? 1.9 : 2.7),
      ...MEMBER_DESK,
      rotY: back ? FACE_FRONT : FACE_BACK,
      occupant: null,
    })
  }
  return desks
}

/** 休息區的位子：沙發（坐）→ 咖啡機旁（站）→ 其餘排成格子站著 */
function loungeSpot(rect: Rect, i: number): Place {
  const base = { deskId: null, area: 'lounge' as const }
  const sofa = [0, 1, 2]
  if (i < sofa.length) return { ...base, x: rect.x + 5.6 + i * 0.75, z: rect.z + 1.2, rotY: FACE_FRONT, pose: 'sit' }
  if (i < 5) return { ...base, x: rect.x + 1.6 + (i - 3) * 0.9, z: rect.z + 1.6, rotY: FACE_FRONT, pose: 'stand' }
  const k = i - 5
  const perRow = 8
  return { ...base, x: rect.x + 1 + (k % perRow) * 1, z: rect.z + 2.8 + Math.floor(k / perRow) * 0.9, rotY: FACE_FRONT, pose: 'stand' }
}

export function computeLayout({ sessions, tasks }: { sessions: LayoutSession[]; tasks: Record<string, TaskInfo> }): OfficeLayout {
  const present = sessions.length
  const tier: Tier = present > SMALL_MAX ? 'medium' : 'small'

  // 1. 專案區：依專案名、任務 dir 排序；一排最多 3 個桌群單位
  const byProject = new Map<string, string[]>()
  for (const dir of Object.keys(tasks).sort(byName)) {
    const p = tasks[dir].project
    byProject.set(p, [...(byProject.get(p) ?? []), dir])
  }
  const zones: Zone[] = []
  const desks: Desk[] = []
  const boards: Record<string, { x: number; z: number }> = {}
  let row = 0
  let used = 0
  let rowsUsed = 0
  let maxRowW = 0
  let rowX = PAD
  for (const project of [...byProject.keys()].sort(byName)) {
    const dirs = byProject.get(project)!
    if (used > 0 && used + dirs.length > UNITS_PER_ROW) {
      row++
      used = 0
    }
    if (used === 0) rowX = PAD
    const x = rowX
    const z = PAD + row * (ZONE_D + AISLE)
    let ux = x
    for (const dir of dirs) {
      desks.push(...taskDesks(dir, tasks[dir], ux, z))
      boards[dir] = { x: ux + BOARD.x + BOARD.w / 2, z: z + BOARD.z }
      ux += unitWidth(tasks[dir])
    }
    const rect = { x, z, w: ux - x, d: ZONE_D }
    rowX = ux + AISLE
    const only = dirs.length === 1 ? tasks[dirs[0]] : null
    const subtitle = only ? (only.wave ? `${only.display} · 波 ${only.wave.current}` : only.display) : `${dirs.length} 個任務`
    zones.push({ key: project, kind: 'project', title: project, subtitle, count: 0, needs: false, rect, sign: [x + 0.5, row === 0 ? 2.25 : 1.2, z], tasks: dirs, overflow: 0 })
    used += dirs.length
    rowsUsed = row + 1
    maxRowW = Math.max(maxRowW, x + rect.w - PAD)
  }

  // 2. 入座：leader 大桌、成員依 brief 順序；其餘進散座
  const homes: Record<string, Place> = {}
  const deskById = new Map(desks.map((d) => [d.id, d]))
  const hot: LayoutSession[] = []
  for (const s of [...sessions].sort((a, b) => byName(a.id, b.id))) {
    const task = s.taskDir ? tasks[s.taskDir] : undefined
    let desk: Desk | undefined
    if (task && s.leader) desk = deskById.get(`${s.taskDir}#leader`)
    else if (task && s.member) {
      const i = task.members.indexOf(s.member)
      if (i >= 0 && i < MAX_MEMBERS) desk = deskById.get(`${s.taskDir}#m${i}`)
    }
    if (desk && desk.occupant == null) {
      desk.occupant = s.id
      homes[s.id] = seatOf(desk, 'task')
    } else {
      hot.push(s)
      if (task) {
        const z = zones.find((z) => z.kind === 'project' && z.key === task.project)
        if (z) z.overflow++
      }
    }
  }

  // 3. 前排：散座區（一排 4 桌，依專案名）＋休息區
  const frontZ = rowsUsed > 0 ? PAD + rowsUsed * (ZONE_D + AISLE) : PAD
  hot.sort((a, b) => byName(a.project, b.project) || byName(a.id, b.id))
  const hotRows = Math.max(1, Math.ceil(hot.length / HOT_PER_ROW))
  const hotRect = { x: PAD, z: frontZ, w: ZONE_W, d: Math.max(FRONT_D, hotRows * HOT_PITCH_Z + 0.8) }
  const loungeRect = { x: PAD + ZONE_W + AISLE, z: frontZ, w: ZONE_W, d: FRONT_D }
  const hotDeskCount = Math.max(HOT_PER_ROW, hotRows * HOT_PER_ROW)
  for (let i = 0; i < hotDeskCount; i++) {
    const desk: Desk = {
      id: `hot#${i}`,
      group: 'hot',
      kind: 'hot',
      x: hotRect.x + 1.15 + (i % HOT_PER_ROW) * HOT_PITCH_X,
      z: hotRect.z + 1.6 + Math.floor(i / HOT_PER_ROW) * HOT_PITCH_Z,
      ...MEMBER_DESK,
      rotY: FACE_FRONT,
      occupant: hot[i]?.id ?? null,
    }
    desks.push(desk)
    if (hot[i]) homes[hot[i].id] = seatOf(desk, 'hot')
  }

  // 4. 現在位置：done 去休息區（先到先佔）、等你站在座位旁
  const places: Record<string, Place> = {}
  const loungeOrder = sessions
    .filter((s) => s.substate === 'done')
    .sort((a, b) => (a.substateSince ?? Infinity) - (b.substateSince ?? Infinity) || byName(a.id, b.id))
    .map((s) => s.id)
  loungeOrder.forEach((id, i) => (places[id] = loungeSpot(loungeRect, i)))
  for (const s of sessions) {
    if (places[s.id]) continue
    const home = homes[s.id]
    places[s.id] = s.substate === 'waiting' ? { ...home, x: home.x + 0.6, rotY: FACE_FRONT, pose: 'stand' } : home
  }

  // 5. 區的人數與等你
  const zoneOfHome = (s: LayoutSession): string => {
    const h = homes[s.id]
    if (h.area === 'hot') return 'hot'
    return tasks[s.taskDir!].project
  }
  const hotZone: Zone = {
    key: 'hot',
    kind: 'hot',
    title: '無任務 session',
    subtitle: null,
    count: 0,
    needs: false,
    rect: hotRect,
    sign: [hotRect.x + 1.4, 0, hotRect.z + hotRect.d - 0.3],
    tasks: [],
    overflow: 0,
  }
  const loungeZone: Zone = {
    key: 'lounge',
    kind: 'lounge',
    title: '休息區',
    subtitle: null,
    count: loungeOrder.length,
    needs: false,
    rect: loungeRect,
    sign: [loungeRect.x + 1.2, 0, loungeRect.z + loungeRect.d - 0.3],
    tasks: [],
    overflow: 0,
  }
  zones.push(hotZone, loungeZone)
  const zoneByKey = new Map(zones.filter((z) => z.kind !== 'lounge').map((z) => [z.key, z]))
  for (const s of sessions) {
    const z = zoneByKey.get(zoneOfHome(s))!
    z.count++
    if (NEEDS.has(s.substate)) z.needs = true
  }

  const officeW = Math.max(BASE_W, maxRowW + 2 * PAD, loungeRect.x + loungeRect.w + PAD)
  const frontEnd = frontZ + Math.max(hotRect.d, loungeRect.d) + PAD
  const roomD = Math.max(tier === 'medium' ? BASE_D + MEDIUM_EXTRA_D : BASE_D, frontEnd)
  return {
    tier,
    present,
    markerScale: tier === 'medium' ? 0.8 : 1,
    room: { w: officeW + LOBBY_W, d: roomD },
    officeW,
    zones,
    desks,
    places,
    homes,
    loungeOrder,
    boards,
  }
}
