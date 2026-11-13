import type { StateCreator } from 'zustand';

import { inLevel } from '@/graph/level-edit';
import { writeNodeSettings } from '@/graph/node-settings';
import { advanceSeeds } from '@/graph/seed-control';
import { writeSubgraphWidget } from '@/graph/subgraph';
import { levelOfId } from '@/graph/subgraph-level';
import type { NodeDefinition, NodeId, Workflow } from '@/graph/types';
import { writeWidgetValue } from '@/graph/widgets';
import { createGraphKit } from '@/store/slices/graph-kit';
import type { GraphState } from '@/store/use-graph-store';

// ─────────────────────────────
// グラフのストアの、ノードの値（widget・subgraph の昇格 widget・seed・カードに出していない設定）の操作。
// ─────────────────────────────

/** この slice が持つ操作 */
type GraphNodeValueActions = Pick<
  GraphState,
  'setWidgetValue' | 'setProxyWidgetValue' | 'updateNodeSettings' | 'advanceSeeds'
>;

/** widget の値を書いたノードを載せた階層 */
interface WrittenLevel {
  readonly level: Workflow;
}

/** ノードの値の操作を作る */
export const createGraphNodeValueSlice: StateCreator<GraphState, [], [], GraphNodeValueActions> = (
  rawSet,
  get,
) => {
  const { set, apply } = createGraphKit(rawSet, get);
  return {
    setWidgetValue: (nodeId, definition, inputName, value) => {
      const workflow = get().workflow;
      if (!workflow) return false;

      let written = false;
      const next = inLevel(workflow, levelOfId(nodeId), (level) => {
        const result = writeWidgetIn(level, nodeId, definition, { inputName, value });
        if (result === null) return level;
        written = true;
        return result.level;
      });
      if (!written) return false;

      set({ workflow: next, dirty: true });
      return true;
    },

    setProxyWidgetValue: (target, value) => {
      const workflow = get().workflow;
      if (!workflow) return false;

      const next = writeSubgraphWidget(workflow, target, value);
      if (!next) return false;

      set({ workflow: next, dirty: true });
      return true;
    },

    updateNodeSettings: (nodeId, patch) => {
      const workflow = get().workflow;
      if (!workflow) return;

      const next = inLevel(workflow, levelOfId(nodeId), (level) => ({
        ...level,
        nodes: level.nodes.map((node) =>
          node.id === nodeId ? writeNodeSettings(node, patch) : node,
        ),
      }));
      // 幅が変わったら、変える前の並びで位置を求め直す（`settleLayout`）
      set(apply(workflow, next));
    },

    advanceSeeds: (definitions) => {
      const workflow = get().workflow;
      if (!workflow) return;

      set(apply(workflow, advanceSeeds(workflow, definitions)));
    },
  };
};

/**
 * 階層の中の 1 つのノードの widget に値を書く。位置対応を解決できないノードは編集させない
 */
function writeWidgetIn(
  level: Workflow,
  nodeId: NodeId,
  definition: NodeDefinition,
  input: { readonly inputName: string; readonly value: unknown },
): WrittenLevel | null {
  const target = level.nodes.find((node) => node.id === nodeId);
  const updated = target
    ? writeWidgetValue(target, definition, input.inputName, input.value)
    : null;
  if (!updated) return null;
  return {
    level: {
      ...level,
      nodes: level.nodes.map((node) => (node.id === nodeId ? updated : node)),
    },
  };
}
