import type { HerdrView, HerdrViewPane, PaneStatus } from '@dash/shared'

export const vpane = (id: string, rect: [number, number, number, number], status: PaneStatus = 'idle', over: Partial<HerdrViewPane> = {}): HerdrViewPane => ({
  paneId: id,
  tabId: id.split(':')[0] + ':t',
  workspaceId: id.split(':')[0],
  name: null,
  agent: 'claude',
  status,
  cwd: '/p',
  model: 'opus 5.5',
  effort: null,
  cost: 1.5,
  ctxPct: 20,
  usage5hPct: null,
  usageWkPct: null,
  taskDir: null,
  member: null,
  rect: { x: rect[0], y: rect[1], width: rect[2], height: rect[3] },
  title: null,
  scrollback: 0,
  ...over,
})

/** wA：單 tab 單 pane；wB：tab1 單 pane、tab2 左右分割＋右半上下分割 */
export const view: HerdrView = {
  generatedAt: 1,
  live: false,
  focused: { workspaceId: 'wB', tabId: 'wB:t2', paneId: 'wB:p3' },
  workspaces: [
    {
      id: 'wA',
      label: 'alpha',
      number: 1,
      status: 'idle',
      activeTabId: 'wA:t1',
      tabs: [{ id: 'wA:t1', label: '1', number: 1, status: 'idle', focusedPaneId: 'wA:p1', zoomed: false, area: { width: 100, height: 40 }, panes: [vpane('wA:p1', [0, 0, 100, 40], 'idle', { name: 'alpha-dev' })] }],
    },
    {
      id: 'wB',
      label: 'beta',
      number: 2,
      status: 'working',
      activeTabId: 'wB:t2',
      tabs: [
        { id: 'wB:t1', label: 'main', number: 1, status: 'idle', focusedPaneId: 'wB:p1', zoomed: false, area: { width: 100, height: 40 }, panes: [vpane('wB:p1', [0, 0, 100, 40], 'idle', { agent: null })] },
        {
          id: 'wB:t2',
          label: 'split',
          number: 2,
          status: 'working',
          focusedPaneId: 'wB:p3',
          zoomed: false,
          area: { width: 100, height: 40 },
          panes: [
            vpane('wB:p2', [0, 0, 50, 40], 'working', { name: 'beta-lead' }),
            vpane('wB:p3', [50, 0, 50, 20], 'blocked'),
            vpane('wB:p4', [50, 20, 50, 20], 'idle'),
          ],
        },
      ],
    },
  ],
}
