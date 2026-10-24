// 模型載入（AC14）：不用 drei 的 useGLTF —— 它會拉進 three-stdlib 的 GLTFLoader＋DRACOLoader＋MeshoptDecoder。
// Kenney 模型只用 EXT_meshopt_compression（沒有 Draco），所以直接用 three 本身的 GLTFLoader＋meshopt。
import { useLoader } from '@react-three/fiber'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

const withMeshopt = (loader: GLTFLoader) => void loader.setMeshoptDecoder(MeshoptDecoder)

/** 載入失敗的 url：useLoader（suspend-react）會把錯誤快取起來，不清掉的話重試永遠丟同一個錯 */
const failed = new Set<string>()

/** 在 loader 層記失敗：斷線時多個 glb 一起失敗，但只有第一個丟錯的元件會 render 到錯誤，其他的錯誤只進快取 */
class TrackedGLTFLoader extends GLTFLoader {
  override load(...[url, onLoad, onProgress, onError]: Parameters<GLTFLoader['load']>) {
    super.load(url, onLoad, onProgress, (err) => {
      failed.add(url)
      onError?.(err)
    })
  }
}

/** 同一個 url 只載一次（useLoader 依 url 快取），載入中 suspend */
export function useGLTF(url: string): GLTF {
  return useLoader(TrackedGLTFLoader, url, withMeshopt)
}

/** 把失敗的 url 清出快取，下次 suspend 會重新下載。快取 key 是 [loader, url]，要逐個清 */
export function clearFailedGLTF() {
  for (const url of failed) useLoader.clear(TrackedGLTFLoader, url)
  failed.clear()
}
