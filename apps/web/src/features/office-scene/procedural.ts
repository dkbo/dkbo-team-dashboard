// clip 沒有的動作用骨頭補：趴桌、托下巴左右看、打瞌睡。
import type * as THREE from 'three'
import type { Action } from './motion'

export interface PoseBones {
  head?: THREE.Object3D
  torso?: THREE.Object3D
}
export type RestPose = Partial<Record<keyof PoseBones, THREE.Quaternion>>

export function captureRest(bones: PoseBones): RestPose {
  return { head: bones.head?.quaternion.clone(), torso: bones.torso?.quaternion.clone() }
}

/** 這些 clip 的軌道會寫哪些骨頭（軌道名 `<骨頭>.quaternion`） */
export function animatedBones(clips: THREE.AnimationClip[]): Set<string> {
  return new Set(clips.flatMap((c) => c.tracks.map((t) => t.name.split('.')[0])))
}

/**
 * 偏移是「rest × 絕對轉動」。sit 這類 clip 沒有 head／torso 軌道，mixer 不會每幀重設它們，
 * 所以這裡每次先把 mixer 沒負責的骨頭回 rest 再套偏移，不然 rotateX／rotateY 會逐幀累加。
 * mixer 有軌道的骨頭（剛被 mixer 寫過）直接疊在 clip 的值上。
 */
export function applyProcedural(action: Action, bones: PoseBones, rest: RestPose, t: number, playing: boolean, animated: Set<string>) {
  const { head, torso } = bones
  for (const key of ['head', 'torso'] as const) {
    const r = rest[key]
    if (r && !animated.has(key)) bones[key]?.quaternion.copy(r)
  }
  if (action.slump) {
    torso?.rotateX(0.35)
    head?.rotateX(0.45)
  }
  if (action.think) head?.rotateY((8 * Math.PI) / 180 * (playing ? Math.sin(t * 2) : 1))
  if (action.doze) head?.rotateX(0.3)
  // 拿板子：低頭看板、上身微後仰
  if (action.board) {
    torso?.rotateX(-0.08)
    head?.rotateX(0.28)
  }
  // 點頭兩下後停在微低頭
  if (action.nod) head?.rotateX(playing ? 0.25 * Math.max(0, Math.sin(t * 9)) : 0.08)
}
