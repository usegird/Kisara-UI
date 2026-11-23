import type { StateCreator } from 'zustand';

import { openSubgraphIds, withOpenSubgraphs } from '@/graph/subgraph-level';
import { momentOf } from '@/store/slices/graph-kit';
import type { GraphState } from '@/store/use-graph-store';

type GraphUndoActions = Pick<GraphState, 'undo' | 'redo'>;

export const createGraphUndoSlice: StateCreator<GraphState, [], [], GraphUndoActions> = (
  rawSet,
  get,
) => ({
  undo: () => {
    const state = get();
    const { past, future } = state.history;
    const previous = past.at(-1);
    if (previous === undefined || state.workflow === null) return false;
    rawSet({
      ...previous,
      workflow: withOpenSubgraphs(previous.workflow, openSubgraphIds(state.workflow)),
      dirty: true,
      history: { past: past.slice(0, -1), future: [...future, momentOf(state, state.workflow)] },
    });
    return true;
  },

  redo: () => {
    const state = get();
    const { past, future } = state.history;
    const next = future.at(-1);
    if (next === undefined || state.workflow === null) return false;
    rawSet({
      ...next,
      workflow: withOpenSubgraphs(next.workflow, openSubgraphIds(state.workflow)),
      dirty: true,
      history: { past: [...past, momentOf(state, state.workflow)], future: future.slice(0, -1) },
    });
    return true;
  },
});
