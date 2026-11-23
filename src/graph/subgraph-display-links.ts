import { readLink } from '@/graph/link-read';
import {
  nodeInputs,
  nodeOutputs,
  SUBGRAPH_IO_NODE_ID,
  type LinkId,
  type NodeId,
  type ResolvedLink,
  type SubgraphDefinition,
  type Workflow,
  type WorkflowLink,
  type WorkflowNode,
} from '@/graph/types';

interface End {
  readonly id: NodeId;
  readonly slot: number;
}

export interface OpenLevel {
  readonly definition: SubgraphDefinition;
  readonly level: Workflow;
  readonly links: readonly ResolvedLink[];
}

function innerOriginOf(
  levels: ReadonlyMap<NodeId, OpenLevel>,
  instanceId: NodeId,
  slot: number,
): End | null {
  const open = levels.get(instanceId);
  if (!open) return null;
  const link = open.links.find(
    (candidate) =>
      candidate.targetId === SUBGRAPH_IO_NODE_ID.output && candidate.targetSlot === slot,
  );
  if (!link) return null;
  if (link.originId === SUBGRAPH_IO_NODE_ID.input) return { id: instanceId, slot: link.originSlot };
  return { id: link.originId, slot: link.originSlot };
}

function rerouted(link: ResolvedLink, origin: End): WorkflowLink {
  return [link.id, origin.id, origin.slot, link.targetId, link.targetSlot, link.type];
}

export function displayLinks(
  workflow: Workflow,
  levels: ReadonlyMap<NodeId, OpenLevel>,
): WorkflowLink[] {
  const result: WorkflowLink[] = [];

  for (const raw of workflow.links) {
    const link = readLink(raw);
    if (!link) continue;
    if (!levels.has(link.originId)) {
      result.push(raw);
      continue;
    }
    const origin = innerOriginOf(levels, link.originId, link.originSlot);
    if (origin) result.push(rerouted(link, origin));
  }

  for (const [instanceId, open] of levels) {
    for (const link of open.links) {
      if (link.targetId === SUBGRAPH_IO_NODE_ID.output) continue;
      const origin =
        link.originId === SUBGRAPH_IO_NODE_ID.input
          ? { id: instanceId, slot: link.originSlot }
          : { id: link.originId, slot: link.originSlot };
      result.push(rerouted(link, origin));
    }
  }
  return result;
}

export function withDisplayLinks(
  node: WorkflowNode,
  links: ReadonlyMap<LinkId, ResolvedLink>,
  outgoing: ReadonlyMap<string, readonly LinkId[]>,
): WorkflowNode {
  let changed = false;
  const inputs = Array.isArray(node.inputs)
    ? nodeInputs(node).map((input, slot) => {
        const link = input.link === null ? undefined : links.get(input.link);
        const keep = link?.targetId === node.id && link.targetSlot === slot;
        if (keep || input.link === null) return input;
        changed = true;
        return { ...input, link: null };
      })
    : undefined;
  const outputs = Array.isArray(node.outputs)
    ? nodeOutputs(node).map((output, slot) => {
        const ids = outgoing.get(`${String(node.id)}:${String(slot)}`) ?? [];
        const current = output.links ?? [];
        const kept = current.filter((id) => ids.includes(id));
        const next = [...kept, ...ids.filter((id) => !kept.includes(id))];
        if (next.length === current.length && next.every((id, at) => current[at] === id)) {
          return output;
        }
        changed = true;
        return { ...output, links: next };
      })
    : undefined;
  if (!changed) return node;
  return {
    ...node,
    ...(inputs ? { inputs } : {}),
    ...(outputs ? { outputs } : {}),
  };
}
