import type { StateCreator } from 'zustand';

import { inLevel, sortKeyIn, sortTarget } from '@/graph/level-edit';
import { withoutPins } from '@/graph/node-flags';
import { arrangeByProcessing } from '@/graph/order';
import { moveInX, moveTarget } from '@/graph/order-move';
import { openSubgraphIds } from '@/graph/subgraph-level';
import type { Workflow } from '@/graph/types';
import { createGraphKit } from '@/store/slices/graph-kit';
import type { GraphState } from '@/store/use-graph-store';

type GraphOrderActions = Pick<
  GraphState,
  'reorder' | 'moveNode' | 'moveSortable' | 'sortByProcessing'
>;

export const createGraphOrderSlice: StateCreator<GraphState, [], [], GraphOrderActions> = (
  rawSet,
  get,
) => {
  const { set, apply } = createGraphKit(rawSet, get);
  return {
    reorder: (from, to) => {
      const workflow = get().workflow;
      if (!workflow) return;

      const next = moveInX(workflow, from, to);
      if (next !== workflow) set({ workflow: next, dirty: true });
    },

    moveNode: (activeId, overId) => {
      const workflow = get().workflow;
      if (!workflow || activeId === overId) return;

      const next = moveTarget(
        workflow,
        { kind: 'node', id: activeId },
        { over: { kind: 'node', id: overId } },
      );
      if (next !== workflow) set({ workflow: next, dirty: true });
    },

    moveSortable: (active, over, side) => {
      const workflow = get().workflow;
      if (!workflow) return;

      const from = sortKeyIn(active);
      const to = sortKeyIn(over);
      if (from.level !== to.level) return;
      const next = inLevel(workflow, from.level, (level) => {
        const source = sortTarget(level, from.key);
        const target = sortTarget(level, to.key);
        return source && target ? moveTarget(level, source, { over: target, side }) : level;
      });
      if (next !== workflow) set({ workflow: next, dirty: true });
    },

    sortByProcessing: (fromOrigin = false) => {
      const workflow = get().workflow;
      if (!workflow) return;
      const arrange = (level: Workflow): Workflow =>
        arrangeByProcessing(withoutPins(level), undefined, { fromOrigin });
      const arranged = openSubgraphIds(workflow).reduce(
        (current, instanceId) => inLevel(current, instanceId, arrange),
        arrange(workflow),
      );
      set(apply(workflow, arranged));
    },
  };
};
