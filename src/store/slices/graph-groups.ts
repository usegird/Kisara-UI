import type { StateCreator } from 'zustand';

import { groupIndexOf, renameGroup, setGroupColor } from '@/graph/groups';
import { groupKeyIn, inLevel } from '@/graph/level-edit';
import { setNodesBypassed } from '@/graph/node-bypass';
import { groupNodes, ungroup } from '@/graph/order';
import { groupToSubgraph, subgraphToGroup } from '@/graph/subgraph-convert';
import { levelOfId, sharedLevel } from '@/graph/subgraph-level';
import { createGraphKit, NO_SELECTION } from '@/store/slices/graph-kit';
import type { GraphState } from '@/store/use-graph-store';

type GraphGroupActions = Pick<
  GraphState,
  | 'groupNodes'
  | 'ungroup'
  | 'convertGroupToSubgraph'
  | 'convertSubgraphToGroup'
  | 'renameGroup'
  | 'setGroupColor'
  | 'setNodesBypassed'
>;

export const createGraphGroupSlice: StateCreator<GraphState, [], [], GraphGroupActions> = (
  rawSet,
  get,
) => {
  const { set, apply, record } = createGraphKit(rawSet, get);
  return {
    groupNodes: (nodeIds) => {
      const workflow = get().workflow;
      if (!workflow) return;

      const next = inLevel(workflow, sharedLevel(nodeIds), (level) => groupNodes(level, nodeIds));
      if (next !== workflow) set({ workflow: next, dirty: true });
    },

    ungroup: (key) => {
      const workflow = get().workflow;
      if (!workflow) return;

      const target = groupKeyIn(key);
      const next = inLevel(workflow, target.level, (level) =>
        ungroup(level, groupIndexOf(level, target.key)),
      );
      if (next !== workflow) set({ workflow: next, dirty: true });
    },

    convertGroupToSubgraph: (key) => {
      const workflow = get().workflow;
      const target = groupKeyIn(key);
      if (!workflow || target.level !== null) return;
      const converted = groupToSubgraph(workflow, groupIndexOf(workflow, target.key));
      if (!converted) return;
      record(workflow, { ...apply(workflow, converted.workflow), selectedNodeIds: NO_SELECTION });
    },

    convertSubgraphToGroup: (instanceId) => {
      const workflow = get().workflow;
      if (!workflow || levelOfId(instanceId) !== null) return;
      const next = subgraphToGroup(workflow, instanceId);
      if (!next) return;
      record(workflow, { ...apply(workflow, next), selectedNodeIds: NO_SELECTION });
    },

    renameGroup: (key, title) => {
      const workflow = get().workflow;
      if (!workflow) return;

      const target = groupKeyIn(key);
      const next = inLevel(workflow, target.level, (level) =>
        renameGroup(level, groupIndexOf(level, target.key), title),
      );
      if (next !== workflow) set({ workflow: next, dirty: true });
    },

    setGroupColor: (key, color) => {
      const workflow = get().workflow;
      if (!workflow) return;

      const target = groupKeyIn(key);
      const next = inLevel(workflow, target.level, (level) =>
        setGroupColor(level, groupIndexOf(level, target.key), color),
      );
      if (next !== workflow) set({ workflow: next, dirty: true });
    },

    setNodesBypassed: (nodeIds, bypassed) => {
      const workflow = get().workflow;
      if (!workflow) return;
      const next = inLevel(workflow, sharedLevel(nodeIds), (level) =>
        setNodesBypassed(level, nodeIds, bypassed),
      );
      record(workflow, { workflow: next, dirty: true });
    },
  };
};
