import { linkIndex } from '@/graph/link-read';
import { addLink, findNode } from '@/graph/links';
import {
  nodeInputs,
  nodeOutputs,
  type NodeId,
  type Workflow,
  type WorkflowNode,
} from '@/graph/types';
import { nextNodeId } from '@/graph/workflow-ids';

export function cloneNodes(
  workflow: Workflow,
  nodeIds: readonly NodeId[],
): { readonly workflow: Workflow; readonly ids: readonly NodeId[] } | null {
  const originals = [...new Set(nodeIds)].flatMap((id) => findNode(workflow, id) ?? []);
  if (originals.length === 0) return null;

  const first = nextNodeId(workflow);
  const cloneOf = new Map(originals.map((original, at) => [original.id, first + at]));
  const clones = originals.map((original): WorkflowNode => {
    const copy = structuredClone(original);
    return {
      ...copy,
      id: cloneOf.get(original.id) ?? first,
      ...(Array.isArray(copy.inputs)
        ? { inputs: nodeInputs(copy).map((input) => ({ ...input, link: null })) }
        : {}),
      ...(Array.isArray(copy.outputs)
        ? { outputs: nodeOutputs(copy).map((output) => ({ ...output, links: [] })) }
        : {}),
    };
  });

  let next: Workflow = {
    ...workflow,
    nodes: [...workflow.nodes, ...clones],
    last_node_id: Math.max(
      first + clones.length - 1,
      typeof workflow.last_node_id === 'number' ? workflow.last_node_id : 0,
    ),
  };
  const links = linkIndex(workflow.links);
  for (const original of originals) {
    const targetId = cloneOf.get(original.id) ?? first;
    nodeInputs(original).forEach((input, targetSlot) => {
      const link = typeof input.link === 'number' ? links.get(input.link) : undefined;
      if (!link) return;
      next = addLink(next, {
        originId: cloneOf.get(link.originId) ?? link.originId,
        originSlot: link.originSlot,
        targetId,
        targetSlot,
      });
    });
  }
  return { workflow: next, ids: originals.map((original) => cloneOf.get(original.id) ?? first) };
}
