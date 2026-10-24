// 模型載入（AC14）：不用 drei 的 useGLTF —— 它會拉進 three-stdlib 的 GLTFLoader＋DRACOLoader＋MeshoptDecoder。
// Kenney 模型只用 EXT_meshopt_compression（沒有 Draco），所以直接用 three 本身的 GLTFLoader＋meshopt。
import { useLoader } from '@react-three/fiber'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

const withMeshopt = (loader: GLTFLoader) => void loader.setMeshoptDecoder(MeshoptDecoder)

/** 同一個 url 只載一次（useLoader 依 url 快取），載入中 suspend */
export function useGLTF(url: string): GLTF {
  return useLoader(GLTFLoader, url, withMeshopt)
}
