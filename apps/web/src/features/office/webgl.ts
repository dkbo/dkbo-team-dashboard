/** 瀏覽器能不能開 WebGL（試建一個 context 就丟掉）；不能就整頁走清單（AC9） */
export function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'))
  } catch {
    return false
  }
}
