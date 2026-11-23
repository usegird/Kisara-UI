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
  nodeInputs,
  type LinkId,
  type NodeId,
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

function asFrameHead(node: WorkflowNode): WorkflowNode {
  const inputs = Array.isArray(node.inputs)
    ? nodeInputs(node).map((input) => (input.link === null ? input : { ...input, link: null }))
    : undefined;
  return { ...node, ...(inputs ? { inputs } : {}), outputs: [] };
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

    const innerById = new Map(open.level.nodes.map((inner) => [inner.id, inner]));
    let innerCount = 0;
    const outer = membership.get(id);
    for (const innerId of orderedNodeIds(open.level)) {
      order.push(innerId);
      if (isCard(innerById.get(innerId))) {
        numbers.set(innerId, `${String(count)}.${String(++innerCount)}`);
      }
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
    nodes: [
      ...workflow.nodes.map((node) => (levels.has(node.id) ? asFrameHead(node) : node)),
      ...nodes,
    ].map((node) => withDisplayLinks(node, index, outgoing)),
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
