import { linkIndex, readLink } from '@/graph/link-read';
import {
  nodeInputs,
  nodeOutputs,
  slotTypeName,
  SUBGRAPH_IO_NODE_ID,
  type LinkId,
  type NodeId,
  type ResolvedLink,
  type SubgraphIo,
  type Workflow,
  type WorkflowLink,
  type WorkflowLinkObject,
  type WorkflowNode,
} from '@/graph/types';

export interface LiveLink {
  readonly link: ResolvedLink;
  readonly raw: WorkflowLink;
}

interface SplitLinks {
  readonly internal: LiveLink[];
  readonly incoming: LiveLink[];
  readonly outgoing: LiveLink[];
}

export interface Port {
  readonly key: string;
  readonly name: string;
  readonly label: string | undefined;
  readonly type: unknown;
  readonly links: LiveLink[];
}

export function rawType(link: WorkflowLink): unknown {
  return Array.isArray(link) ? link[5] : link.type;
}

export function liveLinks(workflow: Workflow): LiveLink[] {
  const byId = new Map(workflow.nodes.map((node) => [node.id, node]));
  return workflow.links.flatMap((raw) => {
    const link = readLink(raw);
    if (!link) return [];
    const input = nodeInputs(byId.get(link.targetId))[link.targetSlot];
    return input?.link === link.id ? [{ link, raw }] : [];
  });
}

export function splitLinks(live: readonly LiveLink[], members: ReadonlySet<NodeId>): SplitLinks {
  const inside = (id: NodeId): boolean => members.has(id);
  return {
    internal: live.filter(({ link }) => inside(link.originId) && inside(link.targetId)),
    incoming: live.filter(({ link }) => !inside(link.originId) && inside(link.targetId)),
    outgoing: live.filter(({ link }) => inside(link.originId) && !inside(link.targetId)),
  };
}

export function boundaryPorts(
  workflow: Workflow,
  split: SplitLinks,
): { readonly inputs: Port[]; readonly outputs: Port[] } {
  const byId = new Map(workflow.nodes.map((node) => [node.id, node]));
  const inputs = portsOf(split.incoming, (link) => {
    const input = nodeInputs(byId.get(link.targetId))[link.targetSlot];
    return { name: input?.name ?? link.type, label: input?.label };
  });
  const outputs = portsOf(split.outgoing, (link) => {
    const output = nodeOutputs(byId.get(link.originId))[link.originSlot];
    return { name: output?.name ?? link.type, label: undefined };
  });
  return { inputs, outputs };
}

export function innerLinksOf(
  internal: readonly LiveLink[],
  inputs: readonly Port[],
  outputs: readonly Port[],
): WorkflowLinkObject[] {
  return [
    ...internal.map(({ link, raw }) => objectLink(link, raw, {})),
    ...inputs.flatMap((port, slot) =>
      port.links.map(({ link, raw }) =>
        objectLink(link, raw, { origin_id: SUBGRAPH_IO_NODE_ID.input, origin_slot: slot }),
      ),
    ),
    ...outputs.flatMap((port, slot) => {
      const first = port.links[0];
      return first
        ? [
            objectLink(first.link, first.raw, {
              target_id: SUBGRAPH_IO_NODE_ID.output,
              target_slot: slot,
            }),
          ]
        : [];
    }),
  ];
}

export function relink(
  nodes: readonly WorkflowNode[],
  links: readonly WorkflowLink[],
  ids: ReadonlySet<NodeId>,
): WorkflowNode[] {
  const resolved = [...linkIndex(links).values()];
  return nodes.map((node) => {
    if (!ids.has(node.id)) return node;
    const next: WorkflowNode = { ...node };
    if (Array.isArray(node.inputs)) {
      next.inputs = nodeInputs(node).map((input, slot) => {
        const link = resolved.find((l) => l.targetId === node.id && l.targetSlot === slot);
        return { ...input, link: link ? link.id : null };
      });
    }
    if (Array.isArray(node.outputs)) {
      next.outputs = nodeOutputs(node).map((output, slot) => {
        const ids = resolved
          .filter((l) => l.originId === node.id && l.originSlot === slot)
          .map((l) => l.id);
        const kept = (output.links ?? []).filter((id) => ids.includes(id));
        return { ...output, links: [...kept, ...ids.filter((id) => !kept.includes(id))] };
      });
    }
    return next;
  });
}

export function ioOf(port: Port, linkIds: readonly LinkId[]): SubgraphIo {
  return {
    id: uuid(),
    name: port.name,
    type: slotTypeName(port.type),
    linkIds: [...linkIds],
    localized_name: port.name,
    ...(port.label === undefined ? {} : { label: port.label }),
  };
}

export function uuid(): string {
  return globalThis.crypto.randomUUID();
}

function portsOf(
  links: readonly LiveLink[],
  nameOf: (link: ResolvedLink) => { readonly name: string; readonly label?: string | undefined },
): Port[] {
  const ports: Port[] = [];
  for (const entry of links) {
    const key = `${String(entry.link.originId)}:${String(entry.link.originSlot)}`;
    const port = ports.find((candidate) => candidate.key === key);
    if (port) {
      port.links.push(entry);
      continue;
    }
    const { name, label } = nameOf(entry.link);
    ports.push({
      key,
      name: uniqueName(
        name,
        ports.map((p) => p.name),
      ),
      label,
      type: rawType(entry.raw),
      links: [entry],
    });
  }
  return ports;
}

function objectLink(
  link: ResolvedLink,
  raw: WorkflowLink,
  patch: Partial<WorkflowLinkObject>,
): WorkflowLinkObject {
  return {
    id: link.id,
    origin_id: link.originId,
    origin_slot: link.originSlot,
    target_id: link.targetId,
    target_slot: link.targetSlot,
    type: rawType(raw),
    ...patch,
  };
}

function uniqueName(name: string, taken: readonly string[]): string {
  if (!taken.includes(name)) return name;
  let at = 1;
  while (taken.includes(`${name}_${String(at)}`)) at += 1;
  return `${name}_${String(at)}`;
}
