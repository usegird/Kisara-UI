import type { StateCreator } from 'zustand';

import { appInputNames, removeAppInputs } from '@/graph/app-inputs';
import { inLevel } from '@/graph/level-edit';
import { addLink, removeLink, removeNodeKeepingLinks, withWidgetInput } from '@/graph/links';
import { removeFromX } from '@/graph/order';
import { levelOfId, setSubgraphOpen, sharedLevel } from '@/graph/subgraph-level';
import type { NodeId, Workflow } from '@/graph/types';
import { createGraphKit, keptSelection } from '@/store/slices/graph-kit';
import type { GraphState } from '@/store/use-graph-store';

type GraphLinkActions = Pick<
  GraphState,
  'connect' | 'connectToWidget' | 'disconnect' | 'disconnectLinks' | 'removeNode' | 'removeNodes'
>;

export const createGraphLinkSlice: StateCreator<GraphState, [], [], GraphLinkActions> = (
  rawSet,
  get,
) => {
  const { set, apply, record } = createGraphKit(rawSet, get);
  return {
    connect: (originId, originSlot, targetId, targetSlot) => {
      const workflow = get().workflow;
      if (!workflow) return;
      const next = inLevel(workflow, sharedLevel([originId, targetId]), (level) =>
        addLink(level, { originId, originSlot, targetId, targetSlot }),
      );
      set(apply(workflow, next));
    },

    connectToWidget: (originId, originSlot, targetId, widget) => {
      const workflow = get().workflow;
      if (!workflow || originId === targetId) return;

      const next = inLevel(workflow, sharedLevel([originId, targetId]), (level) => {
        const target = withWidgetInput(level, targetId, widget.name, widget.type);
        if (!target) return level;
        return addLink(target.workflow, {
          originId,
          originSlot,
          targetId,
          targetSlot: target.slot,
        });
      });
      set(apply(workflow, next));
    },

    disconnect: (linkId) => {
      const workflow = get().workflow;
      if (!workflow) return;
      const next = inLevel(workflow, levelOfId(linkId), (level) => removeLink(level, linkId));
      set(apply(workflow, next));
    },

    disconnectLinks: (linkIds) => {
      const workflow = get().workflow;
      const first = linkIds[0];
      if (!workflow || first === undefined) return;
      const next = inLevel(workflow, levelOfId(first), (level) =>
        linkIds.reduce((current, linkId) => removeLink(current, linkId), level),
      );
      set(apply(workflow, next));
    },

    removeNode: (nodeId) => get().removeNodes([nodeId]),

    removeNodes: (nodeIds) => {
      const workflow = get().workflow;
      if (!workflow) return;

      const level = sharedLevel(nodeIds);
      const next = inLevel(workflow, level, (target) =>
        removeFromLevel(target, nodeIds, level === null),
      );
      const removed = new Set(nodeIds);
      const selected = get().selectedNodeIds;
      const kept = selected.filter((id) => !removed.has(id));
      record(workflow, {
        ...apply(workflow, next),
        selectedNodeIds: keptSelection(selected, kept),
      });
    },
  };
};

function removeFromLevel(target: Workflow, nodeIds: readonly NodeId[], outer: boolean): Workflow {
  let current = target;
  for (const nodeId of nodeIds) {
    const refs = [...appInputNames(current, nodeId)].map((widgetName) => ({
      nodeId,
      widgetName,
    }));
    const cleared = outer ? setSubgraphOpen(current, nodeId, false) : current;
    current = removeNodeKeepingLinks(removeFromX(removeAppInputs(cleared, refs), nodeId), nodeId);
  }
  return current;
}
