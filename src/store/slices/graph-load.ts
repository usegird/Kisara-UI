import type { StateCreator } from 'zustand';

import { parseWorkflow, removeDanglingLinks } from '@/graph/normalize';
import { unlinkedDisplayIds } from '@/graph/subgraph-display';
import { createGraphKit, EMPTY_HISTORY, NO_SELECTION } from '@/store/slices/graph-kit';
import type { GraphState } from '@/store/use-graph-store';

type GraphLoadActions = Pick<
  GraphState,
  'loadWorkflow' | 'setName' | 'markDirty' | 'markSaved' | 'disownSaved' | 'clear' | 'restore'
>;

export const createGraphLoadSlice: StateCreator<GraphState, [], [], GraphLoadActions> = (
  rawSet,
  get,
) => {
  const { set } = createGraphKit(rawSet, get);
  return {
    loadWorkflow: (raw, name = '', saved = null) => {
      const workflow = removeDanglingLinks(parseWorkflow(raw));
      rawSet({
        workflow,
        name,
        savedPath: saved?.path ?? null,
        savedOn: saved?.baseUrl ?? null,
        savedOwn: saved?.own ?? false,
        selectedNodeIds: NO_SELECTION,
        dirty: false,
        hiddenCandidates: unlinkedDisplayIds(workflow),
        history: EMPTY_HISTORY,
      });
    },

    setName: (name) => set({ name }),

    markDirty: () => {
      if (get().workflow) set({ dirty: true });
    },

    markSaved: (savedPath, baseUrl, unchanged = true) =>
      set({ savedPath, savedOn: baseUrl, savedOwn: true, dirty: unchanged ? false : get().dirty }),

    disownSaved: () => set({ savedOwn: false }),

    clear: () =>
      rawSet({
        workflow: null,
        name: '',
        savedPath: null,
        savedOn: null,
        savedOwn: false,
        selectedNodeIds: NO_SELECTION,
        dirty: false,
        hiddenCandidates: new Set(),
        history: EMPTY_HISTORY,
      }),

    restore: (snapshot) =>
      rawSet({
        workflow: snapshot.workflow,
        name: snapshot.name,
        savedPath: snapshot.savedPath,
        savedOn: snapshot.savedOn ?? null,
        savedOwn: snapshot.savedOwn ?? false,
        selectedNodeIds: snapshot.selectedNodeIds,
        dirty: snapshot.dirty,
        hiddenCandidates: snapshot.hiddenCandidates,
        history: snapshot.history ?? EMPTY_HISTORY,
      }),
  };
};
