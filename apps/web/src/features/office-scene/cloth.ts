// 職等換衣（E9；領導裁定採 it report 做法 (a)）：Kenney 角色只有一個 `colormap` material，衣服由 UV 落在調色盤哪一格決定。
// 做法：在 body-mesh 找出「有 torso 骨頭頂點」的調色盤格＝衣服格（含同格的袖子），算成頂點屬性 `clothMask`；
// 每個職等 clone 一份共用 material，onBeforeCompile 只把 clothMask=1 的片段換成職等色。素材不改。
import * as THREE from 'three'

/** colormap 512×512，每格 32 px */
export const CELL_GRID = 16
/** 少於這麼多 torso 頂點的格不算衣服（扣子、領口之類的小細節） */
export const MIN_CLOTH_VERTS = 8

const cellOf = (u: number, v: number) => {
  const cx = Math.min(CELL_GRID - 1, Math.max(0, Math.floor(u * CELL_GRID)))
  const cy = Math.min(CELL_GRID - 1, Math.max(0, Math.floor(v * CELL_GRID)))
  return cy * CELL_GRID + cx
}

/** uv 是 [u0,v0,u1,v1…]；joints 是每個頂點權重最大的骨頭 index；boneNames 對到 skeleton.bones */
export function clothCells(
  uv: ArrayLike<number>,
  joints: ArrayLike<number>,
  boneNames: readonly string[],
  { torso = 'torso', minCount = MIN_CLOTH_VERTS }: { torso?: string; minCount?: number } = {},
): Set<number> {
  const counts = new Map<number, number>()
  for (let i = 0; i < joints.length; i++) {
    if (boneNames[joints[i]] !== torso) continue
    const c = cellOf(uv[i * 2], uv[i * 2 + 1])
    counts.set(c, (counts.get(c) ?? 0) + 1)
  }
  return new Set([...counts].filter(([, n]) => n >= minCount).map(([c]) => c))
}

export function clothMask(uv: ArrayLike<number>, cells: ReadonlySet<number>): Float32Array {
  const n = uv.length / 2
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = cells.has(cellOf(uv[i * 2], uv[i * 2 + 1])) ? 1 : 0
  return out
}

/** 每個頂點權重最大的骨頭（skinIndex／skinWeight 各 4 個） */
function dominantJoints(geo: THREE.BufferGeometry): Uint16Array {
  const si = geo.getAttribute('skinIndex')
  const sw = geo.getAttribute('skinWeight')
  const out = new Uint16Array(si.count)
  for (let i = 0; i < si.count; i++) {
    let best = 0
    let bw = -1
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k)
      if (w > bw) {
        bw = w
        best = si.getComponent(i, k)
      }
    }
    out[i] = best
  }
  return out
}

/** 對 body-mesh 的 geometry 加上 clothMask 屬性（每種模型只做一次，clone 共用 geometry） */
export function addClothMask(mesh: THREE.SkinnedMesh) {
  const geo = mesh.geometry
  if (geo.getAttribute('clothMask')) return
  const uvAttr = geo.getAttribute('uv')
  const uv = new Float32Array(uvAttr.count * 2)
  for (let i = 0; i < uvAttr.count; i++) {
    uv[i * 2] = uvAttr.getX(i)
    uv[i * 2 + 1] = uvAttr.getY(i)
  }
  const cells = clothCells(uv, dominantJoints(geo), mesh.skeleton.bones.map((b) => b.name))
  geo.setAttribute('clothMask', new THREE.BufferAttribute(clothMask(uv, cells), 1))
}

/** 職等材質：clone 原 material，衣服片段換成 uRank（亮度保留一點原貼圖的漸層） */
export function makeRankMaterial(base: THREE.MeshStandardMaterial, rank: THREE.Color, opts: { opacity?: number } = {}) {
  const m = base.clone()
  const uniforms = { uRank: { value: rank } }
  if (opts.opacity != null && opts.opacity < 1) {
    m.transparent = true
    m.opacity = opts.opacity
    m.depthWrite = false
  }
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uRank = uniforms.uRank
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float clothMask;\nvarying float vCloth;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCloth = clothMask;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRank;\nvarying float vCloth;')
      .replace(
        '#include <map_fragment>',
        '#include <map_fragment>\nfloat clothLum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));\ndiffuseColor.rgb = mix(diffuseColor.rgb, uRank * (0.85 + 0.3 * clothLum), step(0.5, vCloth));',
      )
  }
  m.customProgramCacheKey = () => `rank-cloth-${opts.opacity ?? 1}`
  return { material: m, uniforms }
}
