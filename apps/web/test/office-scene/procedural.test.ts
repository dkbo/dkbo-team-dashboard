// review I1：坐姿 clip（sit）沒有 head／torso 軌道，mixer 不會每幀把它們重設；
// 偏移若是相對轉動（rotateX／rotateY）就會每幀累加。要求：骨頭永遠是「rest × 絕對偏移」。
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { actionFor } from '@/features/office-scene/motion'
import { animatedBones, applyProcedural, captureRest, type PoseBones } from '@/features/office-scene/procedural'

/** 跟 Kenney sit 一樣只有腿的軌道（沒有 head、torso） */
function legsOnlyClip() {
  return new THREE.AnimationClip('sit', 1, [new THREE.QuaternionKeyframeTrack('leg-left.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1])])
}

function rig() {
  const root = new THREE.Group()
  const torso = new THREE.Bone()
  torso.name = 'torso'
  const head = new THREE.Bone()
  head.name = 'head'
  const leg = new THREE.Bone()
  leg.name = 'leg-left'
  torso.add(head)
  root.add(torso, leg)
  // 非單位的 rest，確認偏移是疊在 rest 上而不是在單位上
  head.quaternion.setFromEuler(new THREE.Euler(0.1, 0.2, 0.05))
  torso.quaternion.setFromEuler(new THREE.Euler(-0.05, 0, 0.1))
  return { root, bones: { head, torso } as PoseBones }
}

const angleFrom = (q: THREE.Quaternion, rest: THREE.Quaternion) => q.angleTo(rest)

describe.each(['thinking', 'error', 'idle'] as const)('坐姿動作 %s 播放中骨頭角度有界', (substate) => {
  it('播 360 幀後 head／torso 離 rest 的角度不超過單次偏移', () => {
    const action = actionFor(substate, 'task')
    const { root, bones } = rig()
    const rest = captureRest(bones)
    const clip = legsOnlyClip()
    const animated = animatedBones([clip])
    const mixer = new THREE.AnimationMixer(root)
    mixer.clipAction(clip).play()
    let t = 0
    for (let i = 0; i < 360; i++) {
      t += 1 / 60
      mixer.update(1 / 60)
      applyProcedural(action, bones, rest, t, true, animated)
    }
    // 單次偏移上限：head slump 0.45＋doze 0.3 弧度 / think 8°；留一點浮點餘裕
    expect(angleFrom(bones.head!.quaternion, rest.head!)).toBeLessThan(0.5)
    expect(angleFrom(bones.torso!.quaternion, rest.torso!)).toBeLessThan(0.4)
  })

  it('不播放時重複擺姿勢是冪等的（hover 進出、重算座位不會越來越歪）', () => {
    const action = actionFor(substate, 'task')
    const { bones } = rig()
    const rest = captureRest(bones)
    const animated = animatedBones([legsOnlyClip()])
    applyProcedural(action, bones, rest, 0, false, animated)
    const once = { head: bones.head!.quaternion.clone(), torso: bones.torso!.quaternion.clone() }
    for (let i = 0; i < 50; i++) applyProcedural(action, bones, rest, 0, false, animated)
    expect(bones.head!.quaternion.angleTo(once.head)).toBeLessThan(1e-6)
    expect(bones.torso!.quaternion.angleTo(once.torso)).toBeLessThan(1e-6)
  })
})

describe('切換動作', () => {
  it('錯誤（趴桌）切到打字：head／torso 回 rest，不殘留上一個動作的偏移', () => {
    const { bones } = rig()
    const rest = captureRest(bones)
    const animated = animatedBones([legsOnlyClip()])
    applyProcedural(actionFor('error', 'task'), bones, rest, 0, false, animated)
    expect(angleFrom(bones.head!.quaternion, rest.head!)).toBeGreaterThan(0.3)
    applyProcedural(actionFor('running', 'task'), bones, rest, 0, false, animated)
    expect(angleFrom(bones.head!.quaternion, rest.head!)).toBeLessThan(1e-6)
    expect(angleFrom(bones.torso!.quaternion, rest.torso!)).toBeLessThan(1e-6)
  })

  it('clip 有這根骨頭的軌道時由 mixer 負責，不被拉回 rest', () => {
    const { bones } = rig()
    const rest = captureRest(bones)
    const driven = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.7, 0, 0))
    bones.head!.quaternion.copy(driven) // 假裝 mixer 剛寫了 head
    const clip = new THREE.AnimationClip('c', 1, [new THREE.QuaternionKeyframeTrack('head.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1])])
    applyProcedural(actionFor('running', 'task'), bones, rest, 0, false, animatedBones([clip]))
    expect(bones.head!.quaternion.angleTo(driven)).toBeLessThan(1e-6)
  })
})
