// 家具 instancing（§4.7）：每種 Kenney 模型 useGLTF 只載一次，每個 primitive 一個 InstancedMesh。
// Kenney 家具原點在角落，這裡把整個模型移到底面中心（x、z 置中、y 貼地）再縮放到指定寬。
import { useLayoutEffect, useMemo } from 'react'
import { useGLTF } from './gltf'
import * as THREE from 'three'

export interface Placement {
  x: number
  z: number
  rotY: number
  /** 預設 0 */
  y?: number
}

interface Part {
  geometry: THREE.BufferGeometry
  materialName: string
  matrix: THREE.Matrix4
}

/** 拆出各 primitive 與它相對模型根、已正規化的矩陣；結果快取在 gltf 上 */
export function modelParts(scene: THREE.Object3D, width: number): { parts: Part[]; size: THREE.Vector3 } {
  const cacheKey = `__parts_${width}`
  const cached = (scene.userData as Record<string, unknown>)[cacheKey] as { parts: Part[]; size: THREE.Vector3 } | undefined
  if (cached) return cached
  scene.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(scene)
  const size = box.getSize(new THREE.Vector3())
  const k = width / Math.max(size.x, 1e-6)
  const norm = new THREE.Matrix4()
    .makeScale(k, k, k)
    .multiply(new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2))
  const parts: Part[] = []
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const mat = mesh.material as THREE.Material
    parts.push({ geometry: mesh.geometry, materialName: mat.name, matrix: norm.clone().multiply(mesh.matrixWorld) })
  })
  const out = { parts, size: size.multiplyScalar(k) }
  ;(scene.userData as Record<string, unknown>)[cacheKey] = out
  return out
}

const tmp = new THREE.Matrix4()
const rot = new THREE.Matrix4()

function InstancedPart({ part, material, placements, castShadow }: { part: Part; material: THREE.Material; placements: Placement[]; castShadow: boolean }) {
  const mesh = useMemo(() => {
    const m = new THREE.InstancedMesh(part.geometry, material, Math.max(1, placements.length))
    m.castShadow = castShadow
    m.receiveShadow = false
    return m
    // 數量變了才重建
  }, [part, material, placements.length, castShadow])
  useLayoutEffect(() => {
    placements.forEach((p, i) => {
      rot.makeRotationY(p.rotY).setPosition(p.x, p.y ?? 0, p.z)
      mesh.setMatrixAt(i, tmp.multiplyMatrices(rot, part.matrix))
    })
    mesh.count = placements.length
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [mesh, part, placements])
  useLayoutEffect(() => () => mesh.dispose(), [mesh])
  return <primitive object={mesh} />
}

export function InstancedModel({
  url,
  width,
  placements,
  material,
  only,
  castShadow = false,
}: {
  url: string
  width: number
  placements: Placement[]
  material: (name: string) => THREE.Material
  /** 只畫這些材質名的 primitive（螢幕亮／暗分開畫） */
  only?: (name: string) => boolean
  castShadow?: boolean
}) {
  const gltf = useGLTF(url)
  const { parts } = modelParts(gltf.scene, width)
  if (placements.length === 0) return null
  return (
    <>
      {parts
        .filter((p) => !only || only(p.materialName))
        .map((p, i) => (
          <InstancedPart key={i} part={p} material={material(p.materialName)} placements={placements} castShadow={castShadow} />
        ))}
    </>
  )
}
