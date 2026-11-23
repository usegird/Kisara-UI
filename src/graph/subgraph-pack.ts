import { groupMembership, lineage } from '@/graph/groups';
import { shiftInsert, shiftRemove } from '@/graph/layout-shift';
import { readLink } from '@/graph/link-read';
import { rectOf, type OrderLayout } from '@/graph/node-box';
import { ioOf, type Port } from '@/graph/subgraph-convert-links';
import {
  SUBGRAPH_IO_NODE_ID,
  type LinkId,
  type NodeId,
  type SubgraphDefinition,
  type Workflow,
  type WorkflowLink,
  type WorkflowLinkObject,
  type WorkflowNode,
} from '@/graph/types';

const SUBGRAPH_VERSION = 1;
const DEFAULT_SUBGRAPH_NAME = 'New Subgraph';

const IO_NODE_WIDTH = 120;
const IO_NODE_HEIGHT = 100;
const INPUT_NODE_OFFSET = 200;
const OUTPUT_NODE_GAP = 80;

const INSTANCE_WIDTH = 240;
const INSTANCE_BASE_HEIGHT = 46;
const INSTANCE_SLOT_HEIGHT = 20;

interface OuterLinks {
  readonly incoming: (WorkflowLink | null)[];
  readonly outgoing: WorkflowLink[];
  readonly lastLink: LinkId;
}

interface DefinitionParts {
  readonly id: string;
  readonly name: string;
  readonly nodes: WorkflowNode[];
  readonly links: WorkflowLinkObject[];
  readonly inputs: readonly Port[];
  readonly outputs: readonly Port[];
  readonly groups: unknown[];
}

interface Counters {
  readonly lastGroupId: number;
  readonly lastNode: NodeId;
  readonly lastLink: LinkId;
}

export function groupMembers(
  workflow: Workflow,
  groupIndex: number,
  parents: ReadonlyMap<number, number>,
  layout: OrderLayout,
): Set<NodeId> {
  const membership = groupMembership(workflow, layout);
  return new Set(
    workflow.nodes
      .filter((node) => lineage(membership.get(node.id), parents).includes(groupIndex))
      .map((node) => node.id),
  );
}

export function outerLinksOf(
  inputs: readonly Port[],
  outputs: readonly Port[],
  instanceId: NodeId,
  lastLinkId: LinkId,
): OuterLinks {
  let lastLink = lastLinkId;
  const incoming = inputs.map((port, slot) => {
    const first = port.links[0];
    return first
      ? ([
          ++lastLink,
          first.link.originId,
          first.link.originSlot,
          instanceId,
          slot,
          port.type,
        ] as WorkflowLink)
      : null;
  });
  const outgoing = outputs.flatMap((port, slot) =>
    port.links.map(
      ({ link }) =>
        [++lastLink, instanceId, slot, link.targetId, link.targetSlot, port.type] as WorkflowLink,
    ),
  );
  return { incoming, outgoing, lastLink };
}

export function createDefinition(
  parts: DefinitionParts,
  counters: Counters,
  layout: OrderLayout,
): SubgraphDefinition {
  const memberRects = parts.nodes.map((node) => rectOf(node, layout));
  const left = Math.min(...memberRects.map((rect) => rect.left));
  const right = Math.max(...memberRects.map((rect) => rect.right));
  const middle =
    (Math.min(...memberRects.map((r) => r.top)) + Math.max(...memberRects.map((r) => r.bottom))) /
    2;
  const ioTop = middle - IO_NODE_HEIGHT / 2;
  return {
    id: parts.id,
    version: SUBGRAPH_VERSION,
    state: {
      lastGroupId: counters.lastGroupId,
      lastNodeId: counters.lastNode,
      lastLinkId: counters.lastLink,
      lastRerouteId: 0,
    },
    revision: 0,
    config: {},
    name: parts.name.length > 0 ? parts.name : DEFAULT_SUBGRAPH_NAME,
    inputNode: {
      id: SUBGRAPH_IO_NODE_ID.input,
      bounding: [left - INPUT_NODE_OFFSET, ioTop, IO_NODE_WIDTH, IO_NODE_HEIGHT],
    },
    outputNode: {
      id: SUBGRAPH_IO_NODE_ID.output,
      bounding: [right + OUTPUT_NODE_GAP, ioTop, IO_NODE_WIDTH, IO_NODE_HEIGHT],
    },
    inputs: parts.inputs.map((port, slot) =>
      ioOf(
        port,
        parts.links
          .filter((l) => l.origin_id === SUBGRAPH_IO_NODE_ID.input && l.origin_slot === slot)
          .map((l) => l.id),
      ),
    ),
    outputs: parts.outputs.map((port, slot) =>
      ioOf(
        port,
        parts.links
          .filter((l) => l.target_id === SUBGRAPH_IO_NODE_ID.output && l.target_slot === slot)
          .map((l) => l.id),
      ),
    ),
    widgets: [],
    nodes: parts.nodes,
    groups: parts.groups,
    links: parts.links,
    extra: {},
  };
}

export function createInstance(
  instanceId: NodeId,
  definitionId: string,
  ports: {
    readonly inputs: readonly Port[];
    readonly outputs: readonly Port[];
    readonly outer: OuterLinks;
    readonly proxies: [string, string][];
  },
): WorkflowNode {
  const { inputs, outputs, outer, proxies } = ports;
  const rows = Math.max(inputs.length, outputs.length, 1);
  return {
    id: instanceId,
    type: definitionId,
    pos: [0, 0],
    size: [INSTANCE_WIDTH, INSTANCE_BASE_HEIGHT + INSTANCE_SLOT_HEIGHT * rows],
    flags: {},
    mode: 0,
    inputs: inputs.map((port, slot) => ({
      name: port.name,
      type: port.type,
      link: outer.incoming[slot]?.[0] ?? null,
      ...(port.label === undefined ? {} : { label: port.label }),
    })),
    outputs: outputs.map((port, slot) => ({
      name: port.name,
      type: port.type,
      links: outer.outgoing.filter((link) => link[2] === slot).map((link) => link[0] as LinkId),
    })),
    properties: { proxyWidgets: proxies },
    widgets_values: [],
  };
}

export function swapGroupForInstance(
  workflow: Workflow,
  {
    instance,
    groupIndex,
    parents,
  }: {
    readonly instance: WorkflowNode;
    readonly groupIndex: number;
    readonly parents: ReadonlyMap<number, number>;
  },
  layout: OrderLayout,
): Workflow {
  const withInstance: Workflow = { ...workflow, nodes: [...workflow.nodes, instance] };
  const opened = shiftInsert(
    withInstance,
    {
      nodeIds: [instance.id],
      membership: groupMembership(withInstance, layout, new Set([instance.id])),
    },
    {
      container: parents.get(groupIndex) ?? null,
      beside: { kind: 'group', index: groupIndex },
      side: 'before',
    },
    layout,
  );
  return shiftRemove(opened, { kind: 'group', index: groupIndex }, layout);
}

export function keepsOuterLink(
  raw: WorkflowLink,
  removedIds: ReadonlySet<LinkId>,
  inside: (id: NodeId) => boolean,
): boolean {
  const link = readLink(raw);
  return (
    link !== null && !removedIds.has(link.id) && !inside(link.originId) && !inside(link.targetId)
  );
}
