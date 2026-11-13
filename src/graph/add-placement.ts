import { groupMembership } from '@/graph/groups';
import { insertNodesAfter, orderedNodeIds, previousFor, type PlacementAnchor } from '@/graph/order';
import type { NodeId, Workflow } from '@/graph/types';

// ─────────────────────────────
// 足して繋いだノード（追加・クローン・貼り付け）を並びのどこへ置くかを決めて置く。
// ─────────────────────────────

/**
 * 足して繋いだノードを置く。
 * 基準の向きで「直前」を決め（無ければ入力元の次、それも無ければ末尾）、その後ろに入れる
 * （列の途中なら列を分けて間に挟み、後ろだけを右へ送る）。
 * `workflow` には足すノードと線が入っている。直前を決めるときは足すノードを数えない。
 * **基準があれば基準と同じグループに入る**。無ければ前後が同じグループのときだけ
 */
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

/** 足して繋いだノードを 1 つ置く（`placeNewNodes` の 1 つ版）。 */
export function placeNewNode(
  workflow: Workflow,
  nodeId: NodeId,
  anchor: PlacementAnchor | undefined,
  origin: NodeId | undefined,
): Workflow {
  return placeNewNodes(workflow, [nodeId], anchor, origin);
}

/** 横位置の順で最後のノードを求める。末尾に足すときの「直前」 */
export function lastNodeId(workflow: Workflow): NodeId | null {
  return orderedNodeIds(workflow).at(-1) ?? null;
}
