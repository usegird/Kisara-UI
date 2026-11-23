import { linkIndex } from '@/graph/link-read';
import type { LinkId, NodeId, Workflow, WorkflowNode } from '@/graph/types';

export function node(
  id: number,
  type: string,
  overrides: Partial<WorkflowNode> = {},
): WorkflowNode {
  return {
    id,
    type,
    pos: [0, 0],
    inputs: [{ name: 'in', type: 'IMAGE', link: null }],
    outputs: [{ name: 'out', type: 'IMAGE', links: [] }],
    ...overrides,
  };
}

export function bareNode(overrides: Partial<WorkflowNode> = {}): WorkflowNode {
  return { id: 1, type: 'A', pos: [0, 0], ...overrides };
}

export function linkBetween(workflow: Workflow, originId: NodeId, targetId: NodeId): LinkId | null {
  for (const link of linkIndex(workflow.links).values()) {
    if (link.originId === originId && link.targetId === targetId) return link.id;
  }
  return null;
}
