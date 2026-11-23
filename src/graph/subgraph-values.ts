import { linkIndex } from '@/graph/link-read';
import { proxyWidgets } from '@/graph/subgraph';
import {
  nodeInputs,
  SUBGRAPH_IO_NODE_ID,
  subgraphDefinitions,
  type NodeDefinitionMap,
  type NodeId,
  type ResolvedLink,
  type SubgraphDefinition,
  type SubgraphIo,
  type Workflow,
  type WorkflowNode,
} from '@/graph/types';
import { isRecord, isUnknownArray } from '@/lib/guards';

export type OuterValue =
  { readonly kind: 'value'; readonly value: unknown } | { readonly kind: 'unresolved' };

export interface InnerWidget {
  readonly nodeId: NodeId;
  readonly classType: string;
  readonly name: string;
}

export interface OuterField {
  readonly promptNodeId: string;
  readonly label: string;
}

export function outerValueOf(
  instance: WorkflowNode,
  definition: SubgraphDefinition,
  slot: number,
  definitions: NodeDefinitionMap,
): OuterValue | null {
  const values = outerValuesOf(instance);
  if (values === null) return null;
  const widgets = entryWidgetsOf(definition);
  const target = widgets[slot];
  if (target === null || target === undefined) return null;

  const index = valueIndexOf(widgets, slot, values.length);
  if (index === null) return { kind: 'unresolved' };
  const value = values[index];
  const type = definitions
    .get(target.classType)
    ?.inputs.find((input) => input.name === target.name)?.type;
  return type === undefined || fitsType(type, value)
    ? { kind: 'value', value }
    : { kind: 'unresolved' };
}

export function entryWidgetsOf(definition: SubgraphDefinition): (InnerWidget | null)[] {
  const links = linkIndex(definition.links);
  const nodes = new Map(definition.nodes.map((node) => [node.id, node]));
  return (definition.inputs ?? []).map((io) => innerWidgetOf(io, links, nodes));
}

export function writeOuterValue(
  instance: WorkflowNode,
  definition: SubgraphDefinition,
  slot: number,
  value: unknown,
): WorkflowNode | null {
  const values = outerValuesOf(instance);
  if (values === null) return null;
  const index = valueIndexOf(entryWidgetsOf(definition), slot, values.length);
  if (index === null) return null;
  const next = [...values];
  next[index] = value;
  return {
    ...instance,
    widgets_values: next,
    ...namedOuterCopy(instance, definition, slot, value),
  };
}

export function outerFieldOf(
  workflow: Workflow,
  promptNodeId: string,
  inputName: string,
  definitions: NodeDefinitionMap,
): OuterField | null {
  const parts = promptNodeId.split(':').map(Number);
  if (parts.length !== 2) return null;
  const [instanceId, innerId] = parts;
  const instance = workflow.nodes.find((node) => node.id === instanceId);
  if (instance === undefined) return null;
  const definition = subgraphDefinitions(workflow).find((sub) => sub.id === instance.type);
  const inner = definition?.nodes.find((node) => node.id === innerId);
  if (definition === undefined || inner === undefined) return null;

  const input = nodeInputs(inner).find((candidate) => candidate.name === inputName);
  const link = input?.link == null ? undefined : linkIndex(definition.links).get(input.link);
  if (link?.originId !== SUBGRAPH_IO_NODE_ID.input) return null;
  if (outerValueOf(instance, definition, link.originSlot, definitions)?.kind !== 'value') {
    return null;
  }
  const io = (definition.inputs ?? [])[link.originSlot];
  if (io === undefined) return null;
  return { promptNodeId: String(instance.id), label: io.label ?? io.name };
}

function outerValuesOf(instance: WorkflowNode): readonly unknown[] | null {
  const values = instance.widgets_values;
  if (!isUnknownArray(values) || values.length === 0 || proxyWidgets(instance).length > 0) {
    return null;
  }
  return values;
}

export function valueIndexOf(
  widgets: readonly (InnerWidget | null)[],
  slot: number,
  length: number,
): number | null {
  if (widgets[slot] === null || widgets[slot] === undefined) return null;
  const backed = widgets.filter((widget) => widget !== null).length;
  if (backed !== length) return null;
  return widgets.slice(0, slot).filter((widget) => widget !== null).length;
}

function namedOuterCopy(
  instance: WorkflowNode,
  definition: SubgraphDefinition,
  slot: number,
  value: unknown,
): Pick<WorkflowNode, 'widgets_values_named'> {
  const named = instance.widgets_values_named;
  const name = (definition.inputs ?? [])[slot]?.name;
  if (!isRecord(named) || name === undefined || !Object.hasOwn(named, name)) return {};
  return { widgets_values_named: { ...named, [name]: value } };
}

function innerWidgetOf(
  io: SubgraphIo,
  links: ReadonlyMap<number, ResolvedLink>,
  nodes: ReadonlyMap<number, WorkflowNode>,
): InnerWidget | null {
  for (const linkId of io.linkIds ?? []) {
    const link = links.get(linkId);
    const node = link ? nodes.get(link.targetId) : undefined;
    const input = node && link ? nodeInputs(node)[link.targetSlot] : undefined;
    const widget = input?.widget;
    if (node && widget) return { nodeId: node.id, classType: node.type, name: widget.name };
  }
  return null;
}

function fitsType(type: string, value: unknown): boolean {
  if (type === 'INT' || type === 'FLOAT') return typeof value === 'number';
  if (type === 'BOOLEAN') return typeof value === 'boolean';
  if (type === 'STRING') return typeof value === 'string';
  if (type === 'COMBO') return typeof value === 'string' || typeof value === 'number';
  return true;
}
