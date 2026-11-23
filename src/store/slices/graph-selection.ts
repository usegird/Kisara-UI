import type { StateCreator } from 'zustand';

import { unlinkedDisplayIds } from '@/graph/subgraph-display';
import { levelOfId, setSubgraphOpen } from '@/graph/subgraph-level';
import type { NodeId } from '@/graph/types';
import { createGraphKit, keptSelection, NO_SELECTION } from '@/store/slices/graph-kit';
import type { GraphState } from '@/store/use-graph-store';

type GraphSelectionActions = Pick<
  GraphState,
  'refreshHiddenCandidates' | 'select' | 'setSubgraphOpen'
>;

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
