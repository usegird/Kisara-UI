import type { StateCreator } from 'zustand';

import { openSubgraphIds, withOpenSubgraphs } from '@/graph/subgraph-level';
import { momentOf } from '@/store/slices/graph-kit';
import type { GraphState } from '@/store/use-graph-store';

// ─────────────────────────────
// グラフのストアの、カードを足す・消す操作の取り消しとやり直し。
// ─────────────────────────────

/** この slice が持つ操作 */
type GraphUndoActions = Pick<GraphState, 'undo' | 'redo'>;

/** 取り消しとやり直しの操作を作る */
export const createGraphUndoSlice: StateCreator<GraphState, [], [], GraphUndoActions> = (
  rawSet,
  get,
) => ({
  undo: () => {
    const state = get();
    const { past, future } = state.history;
    const previous = past.at(-1);
    if (previous === undefined || state.workflow === null) return false;
    // 戻した後の位置は控えたときのまま（並びから求め直さない）。開閉は取り消さない
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
