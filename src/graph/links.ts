import { linkIndex, readLink } from '@/graph/link-read';
import { inputSlotFor, outputSlotFor, typesMatch } from '@/graph/slot-types';
import {
  nodeInputs,
  nodeOutputs,
  slotTypeName,
  type LinkId,
  type NodeId,
  type Workflow,
  type WorkflowLink,
  type WorkflowNode,
} from '@/graph/types';
import { nextLinkId, nextNodeId } from '@/graph/workflow-ids';

export function findNode(workflow: Workflow, id: NodeId): WorkflowNode | undefined {
  return workflow.nodes.find((node) => node.id === id);
}

function replaceNode(
  nodes: readonly WorkflowNode[],
  id: NodeId,
  update: (node: WorkflowNode) => WorkflowNode,
): WorkflowNode[] {
  return nodes.map((node) => (node.id === id ? update(node) : node));
}

function clearInputLink(node: WorkflowNode, slot: number, linkId: LinkId): WorkflowNode {
  if (!Array.isArray(node.inputs)) return node;
  const inputs = nodeInputs(node);

  return {
    ...node,
    inputs: inputs.map((input, index) =>
      index === slot && input.link === linkId ? { ...input, link: null } : input,
    ),
  };
}

function removeOutputLink(node: WorkflowNode, slot: number, linkId: LinkId): WorkflowNode {
  if (!Array.isArray(node.outputs)) return node;
  const outputs = nodeOutputs(node);

  return {
    ...node,
    outputs: outputs.map((output, index) => {
      if (index !== slot || !output.links) return output;
      return { ...output, links: output.links.filter((id) => id !== linkId) };
    }),
  };
}

export function removeLink(workflow: Workflow, linkId: LinkId): Workflow {
  const target = linkIndex(workflow.links).get(linkId);
  if (!target) return workflow;

  let nodes = replaceNode(workflow.nodes, target.targetId, (node) =>
    clearInputLink(node, target.targetSlot, linkId),
  );
  nodes = replaceNode(nodes, target.originId, (node) =>
    removeOutputLink(node, target.originSlot, linkId),
  );

  return {
    ...workflow,
    nodes,
    links: workflow.links.filter((link) => readLink(link)?.id !== linkId),
  };
}

export function removeNode(workflow: Workflow, nodeId: NodeId): Workflow {
  if (!findNode(workflow, nodeId)) return workflow;

  let next = workflow;
  for (const link of linkIndex(workflow.links).values()) {
    if (link.originId === nodeId || link.targetId === nodeId) next = removeLink(next, link.id);
  }

  return { ...next, nodes: next.nodes.filter((node) => node.id !== nodeId) };
}

export function removeInputSlots(
  workflow: Workflow,
  nodeId: NodeId,
  slots: ReadonlySet<number>,
): Workflow {
  if (slots.size === 0) return workflow;
  let next = workflow;
  for (const link of linkIndex(workflow.links).values()) {
    if (link.targetId === nodeId && slots.has(link.targetSlot)) next = removeLink(next, link.id);
  }
  const moved = (slot: number): number => slot - [...slots].filter((gone) => gone < slot).length;
  const links = next.links.map((link): WorkflowLink => {
    if (!Array.isArray(link))
      return link.target_id === nodeId ? { ...link, target_slot: moved(link.target_slot) } : link;
    return link[3] === nodeId ? [link[0], link[1], link[2], nodeId, moved(link[4]), link[5]] : link;
  });
  const nodes = replaceNode(next.nodes, nodeId, (node) => ({
    ...node,
    inputs: nodeInputs(node).filter((_, slot) => !slots.has(slot)),
  }));
  return { ...next, nodes, links };
}

export function removeNodeKeepingLinks(workflow: Workflow, nodeId: NodeId): Workflow {
  const node = findNode(workflow, nodeId);
  if (!node) return workflow;

  const links = linkIndex(workflow.links);
  const inputs = nodeInputs(node);
  const outputs = nodeOutputs(node);
  const outputType = (slot: number): string => slotTypeName(outputs[slot]?.type);

  const sources = inputs.flatMap((input, slot) => {
    const link = typeof input.link === 'number' ? links.get(input.link) : undefined;
    if (!link || link.targetId !== nodeId || link.originId === nodeId) return [];
    const origin = findNode(workflow, link.originId);
    const originType = slotTypeName(nodeOutputs(origin)[link.originSlot]?.type);
    return [{ slot, type: slotTypeName(input.type), link, originType }];
  });
  const tries = [
    ...sources.flatMap((source) =>
      source.slot < outputs.length && typesMatch(source.type, outputType(source.slot))
        ? [{ source, output: source.slot }]
        : [],
    ),
    ...sources.flatMap((source) => {
      const output = outputs.findIndex((_, slot) => typesMatch(source.type, outputType(slot)));
      return output < 0 ? [] : [{ source, output }];
    }),
  ];

  const bridges: AddLinkParams[] = [];
  for (const link of links.values()) {
    if (link.originId !== nodeId || link.targetId === nodeId) continue;
    const target = findNode(workflow, link.targetId);
    const targetType = slotTypeName(nodeInputs(target)[link.targetSlot]?.type);
    const chosen = tries.find(
      ({ source, output }) =>
        output === link.originSlot && typesMatch(source.originType, targetType),
    );
    if (!chosen) continue;
    bridges.push({
      originId: chosen.source.link.originId,
      originSlot: chosen.source.link.originSlot,
      targetId: link.targetId,
      targetSlot: link.targetSlot,
    });
  }

  return bridges.reduce(addLink, removeNode(workflow, nodeId));
}

export function incomingLinkTo(workflow: Workflow, targetId: NodeId, slot: number): LinkId | null {
  const link = nodeInputs(findNode(workflow, targetId))[slot]?.link;
  return typeof link === 'number' ? link : null;
}

export function withWidgetInput(
  workflow: Workflow,
  nodeId: NodeId,
  widget: string,
  type: string,
): { readonly workflow: Workflow; readonly slot: number } | null {
  const node = findNode(workflow, nodeId);
  if (!node) return null;

  const inputs = nodeInputs(node);
  const at = inputs.findIndex((input) => input.name === widget);
  if (at >= 0) return { workflow, slot: at };

  const added = { name: widget, type, widget: { name: widget }, link: null };
  return {
    workflow: {
      ...workflow,
      nodes: replaceNode(workflow.nodes, nodeId, (current) => ({
        ...current,
        inputs: [...inputs, added],
      })),
    },
    slot: inputs.length,
  };
}

interface AddLinkParams {
  readonly originId: NodeId;
  readonly originSlot: number;
  readonly targetId: NodeId;
  readonly targetSlot: number;
}

export function addLink(workflow: Workflow, params: AddLinkParams): Workflow {
  const { originId, originSlot, targetId, targetSlot } = params;

  const origin = findNode(workflow, originId);
  const target = findNode(workflow, targetId);
  if (!origin || !target) return workflow;

  const existing = nodeInputs(target)[targetSlot]?.link;
  const base = typeof existing === 'number' ? removeLink(workflow, existing) : workflow;

  const id = nextLinkId(base);
  const type = slotTypeName(nodeOutputs(origin)[originSlot]?.type);

  let nodes = replaceNode(base.nodes, targetId, (node) => {
    if (!Array.isArray(node.inputs)) return node;
    const inputs = nodeInputs(node);
    return {
      ...node,
      inputs: inputs.map((input, index) => (index === targetSlot ? { ...input, link: id } : input)),
    };
  });

  nodes = replaceNode(nodes, originId, (node) => {
    if (!Array.isArray(node.outputs)) return node;
    const outputs = nodeOutputs(node);
    return {
      ...node,
      outputs: outputs.map((output, index) => {
        if (index !== originSlot) return output;
        return { ...output, links: [...(output.links ?? []), id] };
      }),
    };
  });

  return {
    ...base,
    nodes,
    links: [...base.links, [id, originId, originSlot, targetId, targetSlot, type]],
    last_link_id: id,
  };
}

export interface ConnectRequest {
  readonly kind: 'after' | 'before';
  readonly nodeId: NodeId;
  readonly slot: number | null;
  readonly type: string;
  readonly widget?: string | undefined;
  readonly newSlot?: number | undefined;
}

export function linkNewNode(
  workflow: Workflow,
  node: WorkflowNode,
  connect: ConnectRequest,
): Workflow {
  if (connect.kind === 'after') {
    if (connect.slot === null) return workflow;
    const targetSlot = connect.newSlot ?? inputSlotFor(node, connect.type);
    if (targetSlot === null) return workflow;

    return addLink(workflow, {
      originId: connect.nodeId,
      originSlot: connect.slot,
      targetId: node.id,
      targetSlot,
    });
  }

  const originSlot = connect.newSlot ?? outputSlotFor(node, connect.type);
  if (originSlot === null) return workflow;

  const target = beforeTarget(workflow, connect);
  if (target === null) return workflow;

  return addLink(target.workflow, {
    originId: node.id,
    originSlot,
    targetId: connect.nodeId,
    targetSlot: target.slot,
  });
}

function beforeTarget(
  workflow: Workflow,
  connect: ConnectRequest,
): { readonly workflow: Workflow; readonly slot: number } | null {
  if (connect.widget !== undefined) {
    return withWidgetInput(workflow, connect.nodeId, connect.widget, connect.type);
  }
  return connect.slot === null ? null : { workflow, slot: connect.slot };
}

export interface InsertNodeOptions {
  readonly inputSlot?: number;
  readonly outputSlot?: number;
}

export function insertNodeBetween(
  workflow: Workflow,
  linkId: LinkId,
  node: WorkflowNode,
  options: InsertNodeOptions = {},
): Workflow {
  return insertNodeAcross(workflow, [linkId], node, options);
}

export function insertNodeAcross(
  workflow: Workflow,
  linkIds: readonly LinkId[],
  node: WorkflowNode,
  options: InsertNodeOptions = {},
): Workflow {
  const index = linkIndex(workflow.links);
  const links = linkIds.map((id) => index.get(id));
  const first = links[0];
  if (!first || links.some((link) => link === undefined)) return workflow;
  const sameOrigin = links.every(
    (link) => link?.originId === first.originId && link.originSlot === first.originSlot,
  );
  if (!sameOrigin) return workflow;
  if (workflow.nodes.some((existing) => existing.id === node.id)) return workflow;

  const inputSlot = options.inputSlot ?? 0;
  const outputSlot = options.outputSlot ?? 0;

  const removed = linkIds.reduce((current, id) => removeLink(current, id), workflow);
  const withNode: Workflow = {
    ...removed,
    nodes: [...removed.nodes, node],
    last_node_id: Math.max(node.id, nextNodeId(removed) - 1),
  };

  const upstream = addLink(withNode, {
    originId: first.originId,
    originSlot: first.originSlot,
    targetId: node.id,
    targetSlot: inputSlot,
  });

  return links.reduce(
    (current, link) =>
      link
        ? addLink(current, {
            originId: node.id,
            originSlot: outputSlot,
            targetId: link.targetId,
            targetSlot: link.targetSlot,
          })
        : current,
    upstream,
  );
}
