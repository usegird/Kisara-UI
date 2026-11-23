import { removeInputSlots } from '@/graph/links';
import { proxyWidgets } from '@/graph/subgraph';
import { uniqueName, uuid } from '@/graph/subgraph-convert-links';
import { instanceDefinition, withCounters } from '@/graph/subgraph-level';
import { entryWidgetsOf, valueIndexOf } from '@/graph/subgraph-values';
import {
  nodeInputs,
  SUBGRAPH_IO_NODE_ID,
  subgraphDefinitions,
  type NodeDefinitionMap,
  type NodeId,
  type SubgraphDefinition,
  type SubgraphIo,
  type Workflow,
  type WorkflowLink,
  type WorkflowNode,
} from '@/graph/types';
import { resolveWidgetValues } from '@/graph/widgets';
import { lastNodeIdOf, nextLinkId } from '@/graph/workflow-ids';
import { isRecord, isUnknownArray } from '@/lib/guards';

export interface EntranceSource {
  readonly instanceId: NodeId;
  readonly innerId: NodeId;
  readonly widgetName: string;
}

export function addEntrance(
  workflow: Workflow,
  source: EntranceSource,
  definitions: NodeDefinitionMap,
): Workflow | null {
  const found = entranceTargetOf(workflow, source, definitions);
  if (found === null) return null;
  const { definition, inner, type, value } = found;
  const inputs = nodeInputs(inner);
  const at = inputs.findIndex((input) => input.name === source.widgetName);
  if (at >= 0 && inputs[at]?.link != null) return null;

  const linkId = nextLinkId(workflow);
  const slot = (definition.inputs ?? []).length;
  const name = uniqueName(
    source.widgetName,
    (definition.inputs ?? []).map((io) => io.name),
  );
  const io: SubgraphIo = {
    id: uuid(),
    name,
    type: type,
    linkIds: [linkId],
    localized_name: name,
  };
  const targetSlot = at >= 0 ? at : inputs.length;
  const linked = { name: source.widgetName, type: type, widget: { name: source.widgetName } };
  const nextInner: WorkflowNode = {
    ...inner,
    inputs:
      at >= 0
        ? inputs.map((input, index) => (index === at ? { ...input, link: linkId } : input))
        : [...inputs, { ...linked, link: linkId }],
  };
  const link = {
    id: linkId,
    origin_id: SUBGRAPH_IO_NODE_ID.input,
    origin_slot: slot,
    target_id: inner.id,
    target_slot: targetSlot,
    type: type,
  };
  const nextDefinition: SubgraphDefinition = {
    ...definition,
    inputs: [...(definition.inputs ?? []), io],
    links: [...definition.links, link],
    nodes: definition.nodes.map((node) => (node.id === inner.id ? nextInner : node)),
  };
  const withDefinition = replaceDefinition(workflow, nextDefinition);
  const added = mapInstances(withDefinition, definition.id, (graph, instance) => ({
    ...graph,
    nodes: graph.nodes.map((node) =>
      node.id === instance.id ? withEntranceValue(node, io, value) : node,
    ),
  }));
  return withCounters(added, lastNodeIdOf(added), linkId);
}

function entranceTargetOf(
  workflow: Workflow,
  source: EntranceSource,
  definitions: NodeDefinitionMap,
): {
  readonly definition: SubgraphDefinition;
  readonly inner: WorkflowNode;
  readonly type: unknown;
  readonly value: unknown;
} | null {
  const definition = instanceDefinition(workflow, source.instanceId);
  const inner = definition?.nodes.find((node) => node.id === source.innerId);
  const innerDefinition = inner ? definitions.get(inner.type) : undefined;
  if (!definition || !inner || !innerDefinition) return null;
  const spec = innerDefinition.inputs.find((input) => input.name === source.widgetName);
  if (!spec || spec.branches !== undefined) return null;
  const values = resolveWidgetValues(inner, innerDefinition);
  if (!values.ok) return null;
  return { definition, inner, type: spec.type, value: values.byWidget.get(source.widgetName) };
}

export function emptiedEntrances(
  before: SubgraphDefinition,
  after: SubgraphDefinition,
): ReadonlySet<number> {
  const emptied = new Set<number>();
  (before.inputs ?? []).forEach((io, slot) => {
    const had = (io.linkIds ?? []).length > 0;
    const has = (after.inputs?.[slot]?.linkIds ?? []).length > 0;
    if (had && !has) emptied.add(slot);
  });
  return emptied;
}

export function removeEntrances(
  workflow: Workflow,
  definitionId: string,
  slots: ReadonlySet<number>,
  before: SubgraphDefinition,
): Workflow {
  const definition = subgraphDefinitions(workflow).find((sub) => sub.id === definitionId);
  if (!definition || slots.size === 0) return workflow;
  const moved = (slot: number): number => slot - [...slots].filter((gone) => gone < slot).length;
  const names = new Set(
    [...slots].flatMap((slot) => {
      const name = definition.inputs?.[slot]?.name;
      return name === undefined ? [] : [name];
    }),
  );
  const nextDefinition: SubgraphDefinition = {
    ...definition,
    inputs: (definition.inputs ?? []).filter((_, slot) => !slots.has(slot)),
    links: definition.links.map((link) => shiftEntranceLink(link, moved)),
  };
  const widgets = entryWidgetsOf(before);
  return mapInstances(replaceDefinition(workflow, nextDefinition), definitionId, (graph, node) => {
    const gone = new Set(
      nodeInputs(node).flatMap((input, slot) => (names.has(input.name) ? [slot] : [])),
    );
    const removed = removeInputSlots(graph, node.id, gone);
    return {
      ...removed,
      nodes: removed.nodes.map((candidate) =>
        candidate.id === node.id
          ? withoutEntranceValues(candidate, widgets, slots, names)
          : candidate,
      ),
    };
  });
}

function replaceDefinition(workflow: Workflow, definition: SubgraphDefinition): Workflow {
  const subgraphs = subgraphDefinitions(workflow).map((sub) =>
    sub.id === definition.id ? definition : sub,
  );
  return { ...workflow, definitions: { ...workflow.definitions, subgraphs } };
}

function mapInstances(
  workflow: Workflow,
  definitionId: string,
  edit: (graph: Workflow, instance: WorkflowNode) => Workflow,
): Workflow {
  const editGraph = (graph: Workflow): Workflow =>
    graph.nodes
      .filter((node) => node.type === definitionId)
      .reduce((current, instance) => edit(current, instance), graph);
  const root = editGraph(workflow);
  const subgraphs = subgraphDefinitions(root).map((sub) => {
    if (!sub.nodes.some((node) => node.type === definitionId)) return sub;
    const graph = editGraph({ nodes: sub.nodes, links: sub.links });
    return { ...sub, nodes: graph.nodes, links: graph.links };
  });
  return { ...root, definitions: { ...root.definitions, subgraphs } };
}

function withEntranceValue(node: WorkflowNode, io: SubgraphIo, value: unknown): WorkflowNode {
  const values = node.widgets_values;
  const keepsValues =
    isUnknownArray(values) && values.length > 0 && proxyWidgets(node).length === 0;
  const named = node.widgets_values_named;
  const input = { name: io.name, type: io.type, widget: { name: io.name }, link: null };
  return {
    ...node,
    ...(keepsValues ? { widgets_values: [...values, value] } : {}),
    ...(keepsValues && isRecord(named)
      ? { widgets_values_named: { ...named, [io.name]: value } }
      : {}),
    ...(Array.isArray(node.inputs) ? { inputs: [...nodeInputs(node), input] } : {}),
  };
}

function withoutEntranceValues(
  node: WorkflowNode,
  widgets: ReturnType<typeof entryWidgetsOf>,
  slots: ReadonlySet<number>,
  names: ReadonlySet<string>,
): WorkflowNode {
  const values = node.widgets_values;
  if (!isUnknownArray(values) || values.length === 0 || proxyWidgets(node).length > 0) return node;
  const indexes = new Set(
    [...slots].flatMap((slot) => {
      const index = valueIndexOf(widgets, slot, values.length);
      return index === null ? [] : [index];
    }),
  );
  if (indexes.size === 0) return node;
  const named = node.widgets_values_named;
  return {
    ...node,
    widgets_values: values.filter((_, index) => !indexes.has(index)),
    ...(isRecord(named)
      ? {
          widgets_values_named: Object.fromEntries(
            Object.entries(named).filter(([key]) => !names.has(key)),
          ),
        }
      : {}),
  };
}

function shiftEntranceLink(link: WorkflowLink, moved: (slot: number) => number): WorkflowLink {
  if (Array.isArray(link)) {
    const [id, originId, originSlot, targetId, targetSlot, type] = link;
    if (originId !== SUBGRAPH_IO_NODE_ID.input) return link;
    return [id, originId, moved(originSlot), targetId, targetSlot, type];
  }
  if (link.origin_id !== SUBGRAPH_IO_NODE_ID.input) return link;
  return { ...link, origin_slot: moved(link.origin_slot) };
}
