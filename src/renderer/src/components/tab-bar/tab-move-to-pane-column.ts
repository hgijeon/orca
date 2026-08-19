import { useAppStore } from '../../store'
import type { TabSplitDirection } from '../../store/slices/tabs'
import { mirrorWebRuntimeTabMove } from './web-runtime-tab-move-mirror'

type TabMovePaneColumnState = Pick<
  ReturnType<typeof useAppStore.getState>,
  'activeWorktreeId' | 'getActiveTab' | 'unifiedTabsByWorktree' | 'groupsByWorktree'
>

export type TabPaneColumnMoveTarget = {
  worktreeId: string
  unifiedTabId: string
  groupId: string
}

function resolveTabPaneColumnMoveTargetInWorktree(
  state: TabMovePaneColumnState,
  worktreeId: string,
  unifiedTabId: string,
  groupId: string
): TabPaneColumnMoveTarget | null {
  const tab = (state.unifiedTabsByWorktree[worktreeId] ?? []).find(
    (candidate) => candidate.id === unifiedTabId && candidate.groupId === groupId
  )
  const group = (state.groupsByWorktree[worktreeId] ?? []).find(
    (candidate) => candidate.id === groupId
  )
  // Why: dropUnifiedTab rejects splitting a group's only tab, so unavailable commands fall through.
  if (!tab || !group || group.tabOrder.length < 2) {
    return null
  }
  return { worktreeId, unifiedTabId, groupId }
}

export function resolveTabPaneColumnMoveTarget(
  state: TabMovePaneColumnState,
  unifiedTabId: string,
  groupId: string
): TabPaneColumnMoveTarget | null {
  const worktreeId = Object.entries(state.unifiedTabsByWorktree).find(([, tabs]) =>
    tabs.some((candidate) => candidate.id === unifiedTabId && candidate.groupId === groupId)
  )?.[0]
  return worktreeId
    ? resolveTabPaneColumnMoveTargetInWorktree(state, worktreeId, unifiedTabId, groupId)
    : null
}

// Why: activeTabId is a terminal entity id; commands must resolve the active unified tab via its group.
export function resolveActiveTabPaneColumnMoveTarget(
  state: TabMovePaneColumnState
): TabPaneColumnMoveTarget | null {
  const worktreeId = state.activeWorktreeId
  if (!worktreeId) {
    return null
  }
  const tab = state.getActiveTab(worktreeId)
  return tab
    ? resolveTabPaneColumnMoveTargetInWorktree(state, worktreeId, tab.id, tab.groupId)
    : null
}

export function moveTabToNewPaneColumn(args: {
  target: TabPaneColumnMoveTarget
  direction: TabSplitDirection
}): boolean {
  const state = useAppStore.getState()
  const moved = state.dropUnifiedTab(args.target.unifiedTabId, {
    groupId: args.target.groupId,
    splitDirection: args.direction
  })
  if (moved) {
    mirrorWebRuntimeTabMove({
      kind: 'split',
      worktreeId: args.target.worktreeId,
      tabId: args.target.unifiedTabId,
      targetGroupId: args.target.groupId,
      splitDirection: args.direction
    })
  }
  return moved
}
