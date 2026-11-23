import { readLink } from '@/graph/link-read';
import { subgraphDefinitions } from '@/graph/normalize';
import { ownData, writeOwnData } from '@/graph/own-data';
import {
  SUBGRAPH_IO_NODE_ID,
  type LinkId,
  type NodeId,
  type SubgraphDefinition,
  type SubgraphIo,
  type Workflow,
  type WorkflowLink,
  type WorkflowLinkObject,
  type WorkflowNode,
} from '@/graph/types';
import { lastGroupIdOf, lastLinkIdOf, lastNodeIdOf } from '@/graph/workflow-ids';
import { isRecord, isUnknownArray } from '@/lib/guards';

const SCOPE_BITS = 20;

const SCOPE_SPAN = 2 ** SCOPE_BITS;

export function scopedId(instanceId: NodeId, innerId: number): number {
  return innerId < 0 ? innerId : (instanceId + 1) * SCOPE_SPAN + innerId;
}

export function unscopedId(
  id: number,
): { readonly instanceId: NodeId; readonly innerId: number } | null {
  if (!Number.isInteger(id) || id < SCOPE_SPAN) return null;
  return { instanceId: Math.floor(id / SCOPE_SPAN) - 1, innerId: id % SCOPE_SPAN };
}

export function levelOfId(id: number): NodeId | null {
  return unscopedId(id)?.instanceId ?? null;
}

export function openCardIdOf(promptNodeId: string, open: ReadonlySet<NodeId>): NodeId | null {
  const [head, inner] = promptNodeId.split(':');
  const id = Number(head);
  if (head === undefined || head.length === 0 || !Number.isInteger(id)) return null;
  const innerId = Number(inner);
  return open.has(id) && inner !== undefined && Number.isInteger(innerId)
    ? scopedId(id, innerId)
    : id;
}

const OPEN_SUBGRAPHS = 'openSubgraphs';

export function instanceDefinition(
  workflow: Workflow,
  instanceId: NodeId,
): SubgraphDefinition | null {
  const node = workflow.nodes.find((candidate) => candidate.id === instanceId);
  if (!node) return null;
  return subgraphDefinitions(workflow).find((definition) => definition.id === node.type) ?? null;
}

export function openSubgraphIds(workflow: Workflow): NodeId[] {
  const raw = ownData(workflow)?.[OPEN_SUBGRAPHS];
  if (!isUnknownArray(raw)) return [];
  const ids = raw.filter((id): id is number => typeof id === 'number');
  return [...new Set(ids)].filter((id) => instanceDefinition(workflow, id) !== null);
}

export function setSubgraphOpen(workflow: Workflow, instanceId: NodeId, open: boolean): Workflow {
  const current = openSubgraphIds(workflow);
  if (current.includes(instanceId) === open) return workflow;
  if (open && instanceDefinition(workflow, instanceId) === null) return workflow;

  const next = open ? [...current, instanceId] : current.filter((id) => id !== instanceId);
  return withOpenSubgraphs(workflow, next);
}

export function withOpenSubgraphs(workflow: Workflow, ids: readonly NodeId[]): Workflow {
  const current = ownData(workflow)?.[OPEN_SUBGRAPHS];
  const same = isUnknownArray(current)
    ? current.length === ids.length && current.every((id, at) => id === ids[at])
    : ids.length === 0;
  if (same) return workflow;
  return writeOwnData(workflow, OPEN_SUBGRAPHS, ids.length === 0 ? undefined : [...ids]);
}

export function withGroupCounter(workflow: Workflow, to: number): Workflow {
  const bump = (state: unknown): unknown => {
    if (!isRecord(state) || typeof state.lastGroupId !== 'number') return state;
    return state.lastGroupId < to ? { ...state, lastGroupId: to } : state;
  };
  const definitions = subgraphDefinitions(workflow);
  const subgraphs = definitions.map((definition) => {
    const state = bump(definition.state);
    return state === definition.state ? definition : { ...definition, state };
  });
  const state = bump(workflow.state);
  const changed = state !== workflow.state || subgraphs.some((d, at) => d !== definitions[at]);
  if (!changed) return workflow;
  return {
    ...workflow,
    ...(state === workflow.state ? {} : { state }),
    ...(workflow.definitions ? { definitions: { ...workflow.definitions, subgraphs } } : {}),
  };
}

function mapSlots(raw: unknown, key: 'link' | 'links', map: (id: number) => number): unknown {
  if (!Array.isArray(raw)) return raw;
  return (raw as unknown[]).map((slot) => {
    if (!isRecord(slot)) return slot;
    const value = slot[key];
    if (typeof value === 'number') return { ...slot, [key]: map(value) };
    if (Array.isArray(value)) {
      return {
        ...slot,
        [key]: (value as unknown[]).map((id) => (typeof id === 'number' ? map(id) : id)),
      };
    }
    return slot;
  });
}

function mapNode(node: WorkflowNode, map: (id: number) => number): WorkflowNode {
  const next: WorkflowNode = { ...node, id: map(node.id) };
  if (Array.isArray(node.inputs)) next.inputs = mapSlots(node.inputs, 'link', map);
  if (Array.isArray(node.outputs)) next.outputs = mapSlots(node.outputs, 'links', map);
  return next;
}

function mapLink(
  link: WorkflowLink,
  map: (id: number) => number,
  original?: WorkflowLinkObject,
): WorkflowLinkObject | null {
  const resolved = readLink(link);
  if (!resolved) return null;
  const type = Array.isArray(link) ? link[5] : link.type;
  return {
    ...original,
    ...(Array.isArray(link) ? {} : link),
    id: map(resolved.id),
    origin_id: map(resolved.originId),
    origin_slot: resolved.originSlot,
    target_id: map(resolved.targetId),
    target_slot: resolved.targetSlot,
    type,
  };
}

export function subgraphLevel(workflow: Workflow, instanceId: NodeId): Workflow | null {
  const definition = instanceDefinition(workflow, instanceId);
  if (!definition) return null;
  const map = (id: number): number => scopedId(instanceId, id);

  return {
    nodes: definition.nodes.map((node) => mapNode(node, map)),
    links: definition.links.flatMap((link) => mapLink(link, map) ?? []),
    groups: isUnknownArray(definition.groups) ? definition.groups : [],
    extra: {},
    ...(workflow.definitions ? { definitions: workflow.definitions } : {}),
    last_node_id: map(lastNodeIdOf(workflow)),
    last_link_id: map(lastLinkIdOf(workflow)),
    state: { lastGroupId: lastGroupIdOf(workflow) },
  };
}

function withIoLinks(
  ios: readonly SubgraphIo[] | undefined,
  links: readonly WorkflowLinkObject[],
  side: 'input' | 'output',
): SubgraphIo[] | undefined {
  if (!ios) return undefined;
  return ios.map((io, slot) => {
    const ids = links
      .filter((link) =>
        side === 'input'
          ? link.origin_id === SUBGRAPH_IO_NODE_ID.input && link.origin_slot === slot
          : link.target_id === SUBGRAPH_IO_NODE_ID.output && link.target_slot === slot,
      )
      .map((link) => link.id);
    const kept = (io.linkIds ?? []).filter((id) => ids.includes(id));
    const added = ids.filter((id) => !kept.includes(id));
    const linkIds = [...kept, ...added];
    const same =
      linkIds.length === (io.linkIds ?? []).length &&
      linkIds.every((id, at) => io.linkIds?.[at] === id);
    return same ? io : { ...io, linkIds };
  });
}

export function withCounters(workflow: Workflow, lastNode: number, lastLink: number): Workflow {
  const bump = (value: unknown, to: number): unknown =>
    typeof value === 'number' && value < to ? to : value;
  const definitions = subgraphDefinitions(workflow).map((definition) => {
    const state = definition.state;
    if (!isRecord(state)) return definition;
    const nodeId = bump(state.lastNodeId, lastNode);
    const linkId = bump(state.lastLinkId, lastLink);
    if (nodeId === state.lastNodeId && linkId === state.lastLinkId) return definition;
    return { ...definition, state: { ...state, lastNodeId: nodeId, lastLinkId: linkId } };
  });
  return {
    ...workflow,
    last_node_id: bump(workflow.last_node_id, lastNode),
    last_link_id: bump(workflow.last_link_id, lastLink),
    definitions: { ...workflow.definitions, subgraphs: definitions },
  };
}

export function writeSubgraphLevel(
  workflow: Workflow,
  instanceId: NodeId,
  level: Workflow,
): Workflow {
  const before = instanceDefinition(workflow, instanceId);
  if (!before) return workflow;
  const unmap = (id: number): number => {
    const scoped = unscopedId(id);
    return scoped?.instanceId === instanceId ? scoped.innerId : id;
  };

  const base: Workflow = level.definitions
    ? { ...workflow, definitions: level.definitions }
    : workflow;
  const definitions = subgraphDefinitions(base);
  const at = definitions.findIndex((definition) => definition.id === before.id);
  const definition = definitions[at];
  if (!definition) return workflow;

  const originals = new Map<LinkId, WorkflowLinkObject>();
  for (const link of definition.links) {
    if (!Array.isArray(link)) originals.set(link.id, link);
  }
  const links = level.links.flatMap((link) => {
    const id = readLink(link)?.id;
    return mapLink(link, unmap, id === undefined ? undefined : originals.get(unmap(id))) ?? [];
  });

  const next: SubgraphDefinition = {
    ...definition,
    nodes: level.nodes.map((node) => mapNode(node, unmap)),
    links,
  };
  if (Array.isArray(level.groups) && (level.groups.length > 0 || 'groups' in definition)) {
    next.groups = level.groups;
  }
  const inputs = withIoLinks(definition.inputs, links, 'input');
  const outputs = withIoLinks(definition.outputs, links, 'output');
  if (inputs) next.inputs = inputs;
  if (outputs) next.outputs = outputs;

  const written: Workflow = {
    ...base,
    definitions: {
      ...base.definitions,
      subgraphs: definitions.map((other, index) => (index === at ? next : other)),
    },
  };
  const lastNode = Math.max(
    unmap(typeof level.last_node_id === 'number' ? level.last_node_id : 0),
    ...next.nodes.map((node) => node.id),
  );
  const lastLink = Math.max(
    unmap(typeof level.last_link_id === 'number' ? level.last_link_id : 0),
    ...links.map((link) => link.id),
  );
  const counted = withCounters(written, lastNode, lastLink);
  return withGroupCounter(counted, lastGroupIdOf(level));
}

export function editLevel(
  workflow: Workflow,
  instanceId: NodeId | null,
  edit: (level: Workflow) => Workflow,
): Workflow {
  if (instanceId === null) return edit(workflow);
  const level = subgraphLevel(workflow, instanceId);
  if (!level) return workflow;
  const next = edit(level);
  return next === level ? workflow : writeSubgraphLevel(workflow, instanceId, next);
}

export function sharedLevel(ids: readonly number[]): NodeId | null | undefined {
  const first = ids[0];
  if (first === undefined) return undefined;
  const level = levelOfId(first);
  return ids.every((id) => levelOfId(id) === level) ? level : undefined;
}
