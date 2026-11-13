import type { StateCreator } from 'zustand';

import { unlinkedDisplayIds } from '@/graph/subgraph-display';
import { levelOfId, setSubgraphOpen } from '@/graph/subgraph-level';
import type { NodeId } from '@/graph/types';
import { createGraphKit, keptSelection, NO_SELECTION } from '@/store/slices/graph-kit';
import type { GraphState } from '@/store/use-graph-store';

// ─────────────────────────────
// グラフのストアの、選択・隠す相手・subgraph の開閉（見え方の切り替え。取り消しの対象にしない）。
// ─────────────────────────────

/** この slice が持つ操作 */
type GraphSelectionActions = Pick<
  GraphState,
  'refreshHiddenCandidates' | 'select' | 'setSubgraphOpen'
>;

/** 選択・隠す相手・subgraph の開閉の操作を作る */
export const createGraphSelectionSlice: StateCreator<GraphState, [], [], GraphSelectionActions> = (
  rawSet,
  get,
) => {
  const { set } = createGraphKit(rawSet, get);
  return {
    refreshHiddenCandidates: () => {
      const workflow = get().workflow;
      set({ hiddenCandidates: workflow ? unlinkedDisplayIds(workflow) : new Set() });
    },

    select: (nodeId, additive = false) => {
      const current = get().selectedNodeIds;
      if (nodeId === null) {
        if (current.length > 0) set({ selectedNodeIds: NO_SELECTION });
        return;
      }
      // 別の階層のカードは一緒に選べない。選び直しになる
      const sameLevel = current.every((id) => levelOfId(id) === levelOfId(nodeId));
      if (!additive || !sameLevel) {
        if (current.length !== 1 || current[0] !== nodeId) set({ selectedNodeIds: [nodeId] });
        return;
      }
      set({
        selectedNodeIds: current.includes(nodeId)
          ? current.filter((id) => id !== nodeId)
          : [...current, nodeId],
      });
    },

    setSubgraphOpen: (instanceId, open) => {
      const state = get();
      const workflow = state.workflow;
      if (!workflow) return;
      const next = setSubgraphOpen(workflow, instanceId, open);
      if (next === workflow) return;

      // 閉じた中のカードは選択から外す
      const selected = state.selectedNodeIds.filter((id) => levelOfId(id) !== instanceId);
      set({
        workflow: next,
        dirty: true,
        hiddenCandidates: new Set(candidatesAfterToggle(state, next, instanceId, open)),
        selectedNodeIds: keptSelection(state.selectedNodeIds, selected),
      });
    },
  };
};

/**
 * 開閉した後の隠す相手。開いた中の隠す相手は、開いたときに決める
 */
function candidatesAfterToggle(
  state: GraphState,
  next: NonNullable<GraphState['workflow']>,
  instanceId: NodeId,
  open: boolean,
): NodeId[] {
  const candidates = [...state.hiddenCandidates].filter((id) => levelOfId(id) !== instanceId);
  if (!open) return candidates;
  for (const id of unlinkedDisplayIds(next)) {
    if (levelOfId(id) === instanceId) candidates.push(id);
  }
  return candidates;
}
