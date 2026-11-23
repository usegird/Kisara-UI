import type { StateCreator } from 'zustand';

import { inLevel } from '@/graph/level-edit';
import { withMultilineHeight } from '@/graph/multiline-height';
import { hasFlag, withFlag } from '@/graph/node-flags';
import { levelOfId } from '@/graph/subgraph-level';
import type { NodeDefinition, NodeId, Workflow } from '@/graph/types';
import { createGraphKit } from '@/store/slices/graph-kit';
import type { GraphState } from '@/store/use-graph-store';

type GraphNodeLookActions = Pick<GraphState, 'setTitle' | 'setMultilineHeight' | 'toggleCollapsed'>;

export const createGraphNodeLookSlice: StateCreator<GraphState, [], [], GraphNodeLookActions> = (
  rawSet,
  get,
) => {
  const { set, apply } = createGraphKit(rawSet, get);
  return {
    setTitle: (nodeId, title) => {
      const workflow = get().workflow;
      if (!workflow) return;

      const next = inLevel(workflow, levelOfId(nodeId), (target) => ({
        ...target,
        nodes: target.nodes.map((node) => (node.id === nodeId ? { ...node, title } : node)),
      }));
      if (next !== workflow) set({ workflow: next, dirty: true });
    },

    setMultilineHeight: (nodeId, definition, height) => {
      const workflow = get().workflow;
      if (!workflow) return;

      const next = inLevel(workflow, levelOfId(nodeId), (level) =>
        resizeMultiline(level, nodeId, definition, height),
      );
      if (next !== workflow) set(apply(workflow, next));
    },

    toggleCollapsed: (nodeId) => {
      const workflow = get().workflow;
      if (!workflow) return;

      set(
        apply(
          workflow,
          inLevel(workflow, levelOfId(nodeId), (level) => ({
            ...level,
            nodes: level.nodes.map((node) =>
              node.id === nodeId ? withFlag(node, 'collapsed', !hasFlag(node, 'collapsed')) : node,
            ),
          })),
        ),
      );
    },
  };
};

function resizeMultiline(
  level: Workflow,
  nodeId: NodeId,
  definition: NodeDefinition,
  height: number,
): Workflow {
  const target = level.nodes.find((node) => node.id === nodeId);
  if (!target) return level;
  const resized = withMultilineHeight(target, definition, height);
  if (resized === target) return level;
  return {
    ...level,
    nodes: level.nodes.map((node) => (node.id === nodeId ? resized : node)),
  };
}
