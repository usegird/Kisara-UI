import { subgraphDefinitions } from '@/graph/normalize';
import type { NodeId, Workflow, WorkflowNode } from '@/graph/types';
import { isRecord } from '@/lib/guards';

export type NodeFlag = 'collapsed' | 'pinned';

export function hasFlag(node: WorkflowNode, flag: NodeFlag): boolean {
  return isRecord(node.flags) && node.flags[flag] === true;
}

export function withFlag(node: WorkflowNode, flag: NodeFlag, on: boolean): WorkflowNode {
  if (hasFlag(node, flag) === on) return node;
  const had = isRecord(node.flags);
  const flags: Record<string, unknown> = had ? { ...(node.flags as Record<string, unknown>) } : {};
  if (on) flags[flag] = true;
  else delete flags[flag];

  if (!had && Object.keys(flags).length === 0) {
    const next: WorkflowNode = { ...node };
    delete next.flags;
    return next;
  }
  return { ...node, flags };
}

export function withoutPins(workflow: Workflow): Workflow {
  if (!workflow.nodes.some((node) => hasFlag(node, 'pinned'))) return workflow;
  return { ...workflow, nodes: workflow.nodes.map((node) => withFlag(node, 'pinned', false)) };
}

function posKey(node: WorkflowNode | undefined): string {
  const pos: unknown = node?.pos;
  return Array.isArray(pos) ? `${String(pos[0])},${String(pos[1])}` : '';
}

function unpinNodes(
  before: readonly WorkflowNode[],
  after: readonly WorkflowNode[],
): WorkflowNode[] | null {
  if (!after.some((node) => hasFlag(node, 'pinned'))) return null;
  const was = new Map<NodeId, WorkflowNode>(before.map((node) => [node.id, node]));
  let changed = false;
  const nodes = after.map((node) => {
    const previous = was.get(node.id);
    if (!hasFlag(node, 'pinned') || previous === undefined) return node;
    if (posKey(previous) === posKey(node)) return node;
    changed = true;
    return withFlag(node, 'pinned', false);
  });
  return changed ? nodes : null;
}

export function unpinMoved(before: Workflow, after: Workflow): Workflow {
  if (before === after) return after;
  const nodes = unpinNodes(before.nodes, after.nodes);

  const oldDefinitions = new Map(subgraphDefinitions(before).map((sub) => [sub.id, sub]));
  let subgraphsChanged = false;
  const subgraphs = subgraphDefinitions(after).map((sub) => {
    const old = oldDefinitions.get(sub.id);
    if (old === undefined || old === sub) return sub;
    const inner = unpinNodes(old.nodes, sub.nodes);
    if (inner === null) return sub;
    subgraphsChanged = true;
    return { ...sub, nodes: inner };
  });

  if (nodes === null && !subgraphsChanged) return after;
  return {
    ...after,
    ...(nodes === null ? {} : { nodes }),
    ...(subgraphsChanged ? { definitions: { ...after.definitions, subgraphs } } : {}),
  };
}
