// 3D 場景的唯一入口：只有進 /office 且是 3D 視圖時才 import()，three／r3f 不進入口 chunk（AC14）
export const loadScene = () => import('@/features/office-scene/OfficeScene')
