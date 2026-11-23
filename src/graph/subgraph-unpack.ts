import { groupMembership, groupParents, lineage, newGroup, workflowGroups } from '@/graph/groups';
import { readLink } from '@/graph/link-read';
import { positionOf, rectOf, type OrderLayout } from '@/graph/node-box';
import { subgraphDefinitions } from '@/graph/normalize';
import { rawType, type LiveLink } from '@/graph/subgraph-convert-links';
import {
  nodeInputs,
  SUBGRAPH_IO_NODE_ID,
  type LinkId,
  type NodeId,
  type SubgraphDefinition,
  type Workflow,
  type WorkflowLink,
  type WorkflowNode,
} from '@/graph/types';
import { lastGroupIdOf } from '@/graph/workflow-ids';
import { isRecord, isUnknownArray } from '@/lib/guards';

interface InnerGroups {
  readonly groups: readonly Record<string, unknown>[];
  readonly membership: ReadonlyMap<NodeId, number>;
  readonly parents: ReadonlyMap<number, number>;
  readonly wrapping: number | null;
}

export interface UnpackContext {
  readonly definition: SubgraphDefinition;
  readonly instanceInputs: ReturnType<typeof nodeInputs>;
  readonly intoInstance: readonly LiveLink[];
  readonly fromInstance: readonly LiveLink[];
  readonly map: (id: NodeId) => NodeId | undefined;
}

export function unpackedLinks(
  raw: WorkflowLink,
  context: UnpackContext,
  nextLinkId: () => LinkId,
): WorkflowLink[] {
  const link = readLink(raw);
  if (!link) return [];
  const { definition, map } = context;
  if (link.originId === SUBGRAPH_IO_NODE_ID.input) {
    const name = definition.inputs?.[link.originSlot]?.name;
    const slot = context.instanceInputs.findIndex((input) => input.name === name);
    const outer = context.intoInstance.find(({ link: l }) => l.targetSlot === slot)?.link;
    const target = map(link.targetId);
    if (!outer || target === undefined) return [];
    return [
      [nextLinkId(), outer.originId, outer.originSlot, target, link.targetSlot, rawType(raw)],
    ];
  }
  if (link.targetId === SUBGRAPH_IO_NODE_ID.output) {
    const origin = map(link.originId);
    if (origin === undefined) return [];
    return context.fromInstance
      .filter(({ link: l }) => l.originSlot === link.targetSlot)
      .map(({ link: outer }): WorkflowLink => [
        nextLinkId(),
        origin,
        link.originSlot,
        outer.targetId,
        outer.targetSlot,
        rawType(raw),
      ]);
  }
  const origin = map(link.originId);
  const target = map(link.targetId);
  if (origin === undefined || target === undefined) return [];
  return [[nextLinkId(), origin, link.originSlot, target, link.targetSlot, rawType(raw)]];
}

export function movedNodes(
  definition: SubgraphDefinition,
  map: (id: NodeId) => NodeId | undefined,
  layout: OrderLayout,
): { readonly moved: WorkflowNode[]; readonly origin: readonly [number, number] } {
  const rects = definition.nodes.map((node) => rectOf(node, layout));
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const moved: WorkflowNode[] = definition.nodes.map((node) => {
    const [x, y] = positionOf(node);
    return { ...node, id: map(node.id) ?? node.id, pos: [x - left, y - top] };
  });
  return { moved, origin: [left, top] };
}

export function unpackGroups(
  start: Workflow,
  {
    definition,
    instance,
    origin,
    map,
  }: {
    readonly definition: SubgraphDefinition;
    readonly instance: WorkflowNode;
    readonly origin: readonly [number, number];
    readonly map: (id: NodeId) => NodeId | undefined;
  },
  layout: OrderLayout,
): {
  readonly groups: unknown[];
  readonly groupIndex: number;
  readonly tree: ReturnType<typeof insertedTreeOf>;
  readonly lastGroupId: number;
} {
  const inner = innerGroupsOf(start, definition, layout);
  const base = workflowGroups(start).length;
  let lastGroupId = lastGroupIdOf(start);
  const carried = inner.groups.map((group) => carriedGroup(group, ++lastGroupId, origin));
  const comment =
    typeof instance.title === 'string' && instance.title.length > 0 ? instance.title : null;
  const wrapper: Record<string, unknown> | null =
    inner.wrapping === null
      ? { ...newGroup(start), id: ++lastGroupId, title: comment ?? definition.name }
      : null;
  const groupIndex = inner.wrapping === null ? base + carried.length : base + inner.wrapping;
  return {
    groups: [...workflowGroups(start), ...carried, ...(wrapper ? [wrapper] : [])],
    groupIndex,
    tree: insertedTreeOf(inner, { base, groupIndex, carried: carried.length }, map),
    lastGroupId,
  };
}

function innerGroupsOf(
  workflow: Workflow,
  definition: SubgraphDefinition,
  layout: OrderLayout,
): InnerGroups {
  const groups = workflowGroups(definition).map((group) => (isRecord(group) ? group : {}));
  const level: Workflow = { ...workflow, nodes: definition.nodes, links: [], groups };
  const membership = groupMembership(level, layout);
  const parents = groupParents(level);
  const tops = groups.flatMap((_, index) =>
    !parents.has(index) &&
    definition.nodes.every((node) => lineage(membership.get(node.id), parents).includes(index))
      ? [index]
      : [],
  );
  return { groups, membership, parents, wrapping: tops.length === 1 ? (tops[0] ?? null) : null };
}

function carriedGroup(
  group: Record<string, unknown>,
  id: number,
  [left, top]: readonly [number, number],
): Record<string, unknown> {
  const bounding = isUnknownArray(group.bounding) ? group.bounding : null;
  const [x, y, ...size] = bounding ?? [];
  return {
    ...group,
    id,
    ...(typeof x === 'number' && typeof y === 'number'
      ? { bounding: [x - left, y - top, ...size] }
      : {}),
  };
}

function insertedTreeOf(
  inner: InnerGroups,
  { base, groupIndex, carried }: { base: number; groupIndex: number; carried: number },
  map: (id: NodeId) => NodeId | undefined,
): { membership: Map<NodeId, number>; parents: Map<number, number> } {
  return {
    membership: new Map(
      [...inner.membership].flatMap(([id, group]) => {
        const to = map(id);
        return to === undefined ? [] : [[to, base + group] as const];
      }),
    ),
    parents: new Map(
      Array.from({ length: carried }, (_, index) => index).flatMap((index) => {
        if (base + index === groupIndex) return [];
        const parent = inner.parents.get(index);
        return [[base + index, parent === undefined ? groupIndex : base + parent] as const];
      }),
    ),
  };
}

export function keepsRootLink(
  raw: WorkflowLink,
  removedIds: ReadonlySet<LinkId>,
  instanceId: NodeId,
): boolean {
  const link = readLink(raw);
  return (
    link !== null &&
    !removedIds.has(link.id) &&
    link.originId !== instanceId &&
    link.targetId !== instanceId
  );
}

export function isStillUsed(workflow: Workflow, instanceId: NodeId, definitionId: string): boolean {
  return [
    ...workflow.nodes.filter((node) => node.id !== instanceId),
    ...subgraphDefinitions(workflow).flatMap((d) => d.nodes),
  ].some((node) => node.type === definitionId);
}
