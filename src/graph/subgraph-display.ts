import { appInputOrder } from '@/graph/app-input-order';
import { withFixedLayout } from '@/graph/fixed-layout';
import {
  groupKeyAt,
  groupLabelAt,
  groupMembership,
  groupParents,
  workflowGroups,
  type GroupLabel,
} from '@/graph/groups';
import { orderedNodeIds } from '@/graph/layout-read';
import { linkIndex } from '@/graph/link-read';
import { subgraphDefinitions } from '@/graph/normalize';
import { unlinkedNodeIds } from '@/graph/rows';
import { proxyWidgets } from '@/graph/subgraph';
import { displayLinks, withDisplayLinks, type OpenLevel } from '@/graph/subgraph-display-links';
import {
  instanceDefinition,
  openSubgraphIds,
  scopedId,
  subgraphLevel,
} from '@/graph/subgraph-level';
import {
  FRONTEND_ONLY_TYPES,
  slotTypeName,
  type LinkId,
  type NodeId,
  type SubgraphDefinition,
  type Workflow,
  type WorkflowNode,
} from '@/graph/types';
import { isRecord, isUnknownArray } from '@/lib/guards';

export interface SubgraphFrame {
  readonly instanceId: NodeId;
  readonly name: string;
  readonly uses: number;
  readonly membership: ReadonlyMap<NodeId, number>;
  readonly parents: ReadonlyMap<number, number>;
  readonly groupLabels: readonly GroupLabel[];
}

export interface DisplayGraph {
  readonly workflow: Workflow;
  readonly frames: ReadonlyMap<NodeId, SubgraphFrame>;
  readonly proxyRows: ReadonlyMap<string, { readonly nodeId: NodeId; readonly widgetName: string }>;
}

function innerGroupKey(instanceId: NodeId, key: string): string {
  return `${String(instanceId)}/${key}`;
}

export function splitInnerGroupKey(
  key: string,
): { readonly instanceId: NodeId; readonly key: string } | null {
  const at = key.indexOf('/');
  if (at < 0) return null;
  const instanceId = Number(key.slice(0, at));
  return Number.isInteger(instanceId) ? { instanceId, key: key.slice(at + 1) } : null;
}

export function proxyRowKey(instanceId: NodeId, widgetName: string): string {
  return `${String(instanceId)}:${widgetName}`;
}

const NO_FRAMES: ReadonlyMap<NodeId, SubgraphFrame> = new Map();
const NO_PROXY_ROWS: DisplayGraph['proxyRows'] = new Map();

const cache = new WeakMap<Workflow, DisplayGraph>();

function asFrameHead(node: WorkflowNode, definition: SubgraphDefinition): WorkflowNode {
  const outputs = (definition.inputs ?? []).map((io) => ({
    name: io.label ?? io.name,
    type: slotTypeName(io.type),
    links: [],
  }));
  return { ...node, outputs };
}

function frameHeadOr(node: WorkflowNode, levels: ReadonlyMap<NodeId, OpenLevel>): WorkflowNode {
  const open = levels.get(node.id);
  return open ? asFrameHead(node, open.definition) : node;
}

function usesOf(workflow: Workflow, definitionId: string): number {
  const nodes = [
    ...workflow.nodes,
    ...subgraphDefinitions(workflow).flatMap((definition) => definition.nodes),
  ];
  return nodes.filter((node) => node.type === definitionId).length;
}

function isCard(node: WorkflowNode | undefined): boolean {
  return node !== undefined && node.type !== FRONTEND_ONLY_TYPES.reroute;
}

function innerCardNumbers(level: Workflow): Map<NodeId, number> {
  const byId = new Map(level.nodes.map((node) => [node.id, node]));
  const numbers = new Map<NodeId, number>();
  for (const id of orderedNodeIds(level)) {
    if (isCard(byId.get(id))) numbers.set(id, numbers.size + 1);
  }
  return numbers;
}

export function innerCardOf(
  workflow: Workflow,
  promptNodeId: string,
): {
  readonly node: WorkflowNode;
  readonly number: number;
  readonly instanceId: NodeId;
  readonly scopedId: NodeId;
} | null {
  const parts = promptNodeId.split(':');
  if (parts.length !== 2) return null;
  const [instanceId, innerId] = parts.map(Number);
  if (!Number.isInteger(instanceId) || !Number.isInteger(innerId)) return null;
  if (instanceId === undefined || innerId === undefined) return null;
  const level = subgraphLevel(workflow, instanceId);
  if (level === null) return null;
  const id = scopedId(instanceId, innerId);
  const number = innerCardNumbers(level).get(id);
  const node = level.nodes.find((candidate) => candidate.id === id);
  if (number === undefined || node === undefined) return null;
  return { node, number, instanceId, scopedId: id };
}

export function deepCardOf(
  workflow: Workflow,
  promptNodeId: string,
): {
  readonly node: WorkflowNode;
  readonly numbers: readonly number[];
  readonly instanceId: NodeId;
} | null {
  const ids = promptNodeId.split(':').map(Number);
  const [instanceId, ...inner] = ids;
  if (instanceId === undefined || inner.length < 2 || !ids.every(Number.isInteger)) return null;
  const definitions = new Map(subgraphDefinitions(workflow).map((def) => [def.id, def]));
  let definition = instanceDefinition(workflow, instanceId);
  let node: WorkflowNode | undefined;
  const numbers: number[] = [];
  for (const id of inner) {
    if (!definition) return null;
    const groups = isUnknownArray(definition.groups) ? definition.groups : [];
    const level: Workflow = { nodes: definition.nodes, links: definition.links, groups };
    node = level.nodes.find((candidate) => candidate.id === id);
    const number = innerCardNumbers(level).get(id);
    if (!node || number === undefined) return null;
    numbers.push(number);
    definition = definitions.get(node.type) ?? null;
  }
  return node ? { node, numbers, instanceId } : null;
}

function innerLabels(instanceId: NodeId, level: Workflow): GroupLabel[] {
  return workflowGroups(level).map((_, index) => {
    const label = groupLabelAt(level, index);
    return { ...label, key: innerGroupKey(instanceId, groupKeyAt(level, index)) };
  });
}

function withProxyAppInputs(
  workflow: Workflow,
  proxyRows: DisplayGraph['proxyRows'],
): Workflow['extra'] {
  const added = appInputOrder(workflow).flatMap((ref) => {
    const inner = proxyRows.get(proxyRowKey(ref.nodeId, ref.widgetName));
    return inner ? [[inner.nodeId, inner.widgetName]] : [];
  });
  if (added.length === 0) return workflow.extra;
  const extra = isRecord(workflow.extra) ? workflow.extra : {};
  const linear = isRecord(extra.linearData) ? extra.linearData : {};
  const inputs: unknown[] = isUnknownArray(linear.inputs) ? linear.inputs : [];
  return { ...extra, linearData: { ...linear, inputs: [...inputs, ...added] } };
}

function build(workflow: Workflow): DisplayGraph {
  const open = openSubgraphIds(workflow);
  if (open.length === 0) return { workflow, frames: NO_FRAMES, proxyRows: NO_PROXY_ROWS };

  const levels = new Map<NodeId, OpenLevel>();
  for (const instanceId of open) {
    const definition = instanceDefinition(workflow, instanceId);
    const level = subgraphLevel(workflow, instanceId);
    if (!definition || !level) continue;
    levels.set(instanceId, { definition, level, links: [...linkIndex(level.links).values()] });
  }

  const links = displayLinks(workflow, levels);
  const index = linkIndex(links);
  const outgoing = new Map<string, LinkId[]>();
  for (const link of index.values()) {
    const key = `${String(link.originId)}:${String(link.originSlot)}`;
    outgoing.set(key, [...(outgoing.get(key) ?? []), link.id]);
  }

  const rootOrder = orderedNodeIds(workflow);
  const rootById = new Map(workflow.nodes.map((node) => [node.id, node]));
  const order: NodeId[] = [];
  const numbers = new Map<NodeId, string>();
  const membership = groupMembership(workflow);
  const frames = new Map<NodeId, SubgraphFrame>();
  const proxyRows = new Map<string, { readonly nodeId: NodeId; readonly widgetName: string }>();
  const nodes: WorkflowNode[] = [];

  let count = 0;
  for (const id of rootOrder) {
    order.push(id);
    const node = rootById.get(id);
    if (isCard(node)) numbers.set(id, String(++count));
    const open = levels.get(id);
    if (!open || !node) continue;

    const innerNumbers = innerCardNumbers(open.level);
    const outer = membership.get(id);
    for (const innerId of orderedNodeIds(open.level)) {
      order.push(innerId);
      const innerNumber = innerNumbers.get(innerId);
      if (innerNumber !== undefined)
        numbers.set(innerId, `${String(count)}.${String(innerNumber)}`);
      if (outer !== undefined) membership.set(innerId, outer);
    }
    nodes.push(...open.level.nodes);
    frames.set(id, {
      instanceId: id,
      name: open.definition.name,
      uses: usesOf(workflow, open.definition.id),
      membership: groupMembership(open.level),
      parents: groupParents(open.level),
      groupLabels: innerLabels(id, open.level),
    });
    for (const proxy of proxyWidgets(node)) {
      proxyRows.set(proxyRowKey(id, proxy.widget), {
        nodeId: scopedId(id, proxy.nodeId),
        widgetName: proxy.widget,
      });
    }
  }

  const display: Workflow = {
    ...workflow,
    nodes: [...workflow.nodes.map((node) => frameHeadOr(node, levels)), ...nodes].map((node) =>
      withDisplayLinks(node, index, outgoing),
    ),
    links,
    extra: withProxyAppInputs(workflow, proxyRows),
  };
  return {
    workflow: withFixedLayout(display, {
      order,
      membership,
      parents: groupParents(workflow),
      numbers,
    }),
    frames,
    proxyRows,
  };
}

export function displayGraph(workflow: Workflow): DisplayGraph {
  const cached = cache.get(workflow);
  if (cached) return cached;
  const graph = build(workflow);
  cache.set(workflow, graph);
  return graph;
}

export function unlinkedDisplayIds(workflow: Workflow): ReadonlySet<NodeId> {
  const outer = unlinkedNodeIds(workflow);
  const display = displayGraph(workflow);
  if (display.frames.size === 0) return outer;
  const root = new Set(workflow.nodes.map((node) => node.id));
  const inner = [...unlinkedNodeIds(display.workflow)].filter((id) => !root.has(id));
  return new Set([...outer, ...inner]);
}
