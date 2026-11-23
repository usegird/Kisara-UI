import { groupMembership } from '@/graph/groups';
import { insertNodesAfter, orderedNodeIds, previousFor, type PlacementAnchor } from '@/graph/order';
import type { NodeId, Workflow } from '@/graph/types';

export function placeNewNodes(
  workflow: Workflow,
  nodeIds: readonly NodeId[],
  anchor: PlacementAnchor | undefined,
  origin: NodeId | undefined,
): Workflow {
  const adding = new Set(nodeIds);
  const others = { ...workflow, nodes: workflow.nodes.filter((node) => !adding.has(node.id)) };

  const found = anchor ? previousFor(others, anchor) : undefined;
  const previous = found !== undefined ? found : (origin ?? lastNodeId(others));
  const group = anchor ? (groupMembership(others).get(anchor.nodeId) ?? null) : undefined;
  return insertNodesAfter(workflow, nodeIds, { previousId: previous, group });
}

export function placeNewNode(
  workflow: Workflow,
  nodeId: NodeId,
  anchor: PlacementAnchor | undefined,
  origin: NodeId | undefined,
): Workflow {
  return placeNewNodes(workflow, [nodeId], anchor, origin);
}

export function lastNodeId(workflow: Workflow): NodeId | null {
  return orderedNodeIds(workflow).at(-1) ?? null;
}
