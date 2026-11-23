import { sharedLevel, subgraphLevel } from '@/graph/subgraph-level';
import { NODE_MODE, nodeMode, type NodeId, type Workflow } from '@/graph/types';

export type BypassState = 'normal' | 'bypassed' | 'mixed';

export function bypassStateOf(workflow: Workflow, nodeIds: readonly NodeId[]): BypassState | null {
  const level = sharedLevel(nodeIds);
  if (level === undefined) return null;
  const scope = level === null ? workflow : subgraphLevel(workflow, level);
  if (!scope) return null;

  const targets = new Set(nodeIds);
  const modes = scope.nodes.filter((node) => targets.has(node.id)).map(nodeMode);
  if (modes.length === 0) return null;
  if (modes.every((mode) => mode === NODE_MODE.normal)) return 'normal';
  return modes.every((mode) => mode === NODE_MODE.bypass) ? 'bypassed' : 'mixed';
}

export function setNodesBypassed(
  workflow: Workflow,
  nodeIds: readonly NodeId[],
  bypassed: boolean,
): Workflow {
  const targets = new Set(nodeIds);
  const mode = bypassed ? NODE_MODE.bypass : NODE_MODE.normal;
  let changed = false;
  const nodes = workflow.nodes.map((node) => {
    if (!targets.has(node.id) || nodeMode(node) === mode) return node;
    changed = true;
    return { ...node, mode };
  });
  return changed ? { ...workflow, nodes } : workflow;
}

export function disabledNodeIdsOf(
  workflow: Workflow | null,
  frames: readonly { readonly nodeId: NodeId }[],
): NodeId[] {
  if (!workflow) return [];
  const disabled = new Set(
    workflow.nodes.filter((node) => nodeMode(node) !== NODE_MODE.normal).map((node) => node.id),
  );
  return frames.map((frame) => frame.nodeId).filter((id) => disabled.has(id));
}
