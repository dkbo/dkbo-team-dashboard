// 素材（glb）載入失敗會從 Suspense 丟出來。「再試 3D」＝重掛：掛上時先把之前失敗的 url 清出載入快取，讓它們重新下載。
// 不在 componentDidCatch 清：接到第一個錯誤時，其他 glb 可能還在途中、稍後才失敗，那時清會漏掉它們。
import { Component, type ReactNode } from 'react'
import { clearFailedGLTF } from './gltf'

type Props = { onError(): void; children: ReactNode }

export class AssetBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }
  constructor(props: Props) {
    super(props)
    clearFailedGLTF()
  }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    this.props.onError()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}
