import type { StateCreator } from 'zustand';

import { moveAppInput } from '@/graph/app-input-order';
import {
  removeAppInputs,
  setAppInputHeight,
  setAppInputSpan,
  toggleAppInput,
} from '@/graph/app-inputs';
import { levelOfId } from '@/graph/subgraph-level';
import { withWorkflowTool } from '@/graph/workflow-tool';
import { createGraphKit } from '@/store/slices/graph-kit';
import type { GraphState } from '@/store/use-graph-store';

type GraphAppInputActions = Pick<
  GraphState,
  | 'toggleAppInput'
  | 'moveAppInput'
  | 'setWorkflowTool'
  | 'setAppInputSpan'
  | 'setAppInputHeight'
  | 'removeAppInputs'
>;

export const createGraphAppInputSlice: StateCreator<GraphState, [], [], GraphAppInputActions> = (
  rawSet,
  get,
) => {
  const { set, apply } = createGraphKit(rawSet, get);
  return {
    toggleAppInput: (nodeId, widgetName) => {
      const workflow = get().workflow;
      if (!workflow) return;

      if (levelOfId(nodeId) !== null) return;
      set({ workflow: toggleAppInput(workflow, nodeId, widgetName), dirty: true });
    },

    moveAppInput: (from, to) => {
      const workflow = get().workflow;
      if (!workflow) return;

      set(apply(workflow, moveAppInput(workflow, from, to)));
    },

    setWorkflowTool: (tool) => {
      const workflow = get().workflow;
      if (!workflow) return;
      set({ workflow: withWorkflowTool(workflow, tool), dirty: true });
    },

    setAppInputSpan: (nodeId, widgetName, span) => {
      const workflow = get().workflow;
      if (!workflow) return;

      const next = setAppInputSpan(workflow, nodeId, widgetName, span);
      if (next !== workflow) set({ workflow: next, dirty: true });
    },

    setAppInputHeight: (nodeId, widgetName, height) => {
      const workflow = get().workflow;
      if (!workflow) return;

      const next = setAppInputHeight(workflow, nodeId, widgetName, height);
      if (next !== workflow) set({ workflow: next, dirty: true });
    },

    removeAppInputs: (refs) => {
      const workflow = get().workflow;
      if (!workflow) return;

      const next = removeAppInputs(workflow, refs);
      if (next !== workflow) set({ workflow: next, dirty: true });
    },
  };
};
