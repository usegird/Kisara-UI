import { appInputNames } from '@/graph/app-inputs';
import { isImageUpload } from '@/graph/image-options';
import { CONTROL_AFTER_GENERATE, sourceOf, type RowContext } from '@/graph/node-rows';
import { numberSpec } from '@/graph/number-spec';
import type { NodeRow, NodeRowKind, RowSource, RowTarget } from '@/graph/rows';
import { SEED_CONTROLS } from '@/graph/seed-control';
import { proxyWidgets } from '@/graph/subgraph';
import { entryWidgetsOf, outerValueOf, type InnerWidget } from '@/graph/subgraph-values';
import {
  nodeInputs,
  slotTypeName,
  type NodeId,
  type SubgraphDefinition,
  type SubgraphIo,
  type WorkflowNode,
} from '@/graph/types';
import { resolveWidgetValues } from '@/graph/widgets';

const NO_ENTRY: EntryValue = { value: undefined, target: null, unresolved: false };

interface SubgraphRowsState {
  readonly context: RowContext;
  readonly node: WorkflowNode;
  readonly definition: SubgraphDefinition;
  readonly appInputs: ReadonlySet<string>;
  readonly innerNodes: ReadonlyMap<NodeId, WorkflowNode>;
}

interface InnerInputSpec {
  readonly type: string;
  readonly options: readonly unknown[] | null;
  readonly multiline: boolean;
  readonly config: Record<string, unknown>;
  readonly choice: boolean;
}

export function rowsForSubgraph(
  context: RowContext,
  node: WorkflowNode,
  definition: SubgraphDefinition,
): NodeRow[] {
  const state: SubgraphRowsState = {
    context,
    node,
    definition,
    appInputs: appInputNames(context.workflow, node.id),
    innerNodes: new Map(definition.nodes.map((inner) => [inner.id, inner])),
  };
  const covered = new Set<string>();

  const proxies = proxyWidgets(node);
  if (proxies.length === 0) {
    const widgets = entryWidgetsOf(definition);
    return (definition.inputs ?? []).map((io, slot) =>
      entryRow(state, io, slot, widgets[slot] ?? null),
    );
  }
  const proxyByWidget = new Map<string, (typeof proxies)[number]>();
  for (const proxy of proxies) {
    if (!proxyByWidget.has(proxy.widget)) proxyByWidget.set(proxy.widget, proxy);
  }

  const rows: NodeRow[] = [];
  for (const slot of nodeInputs(node)) {
    covered.add(slot.name);
    rows.push(instanceInputRow(state, slot, proxyByWidget.get(slot.name)));
  }
  for (const proxy of proxies) {
    if (covered.has(proxy.widget)) continue;
    covered.add(proxy.widget);
    rows.push(proxyRow(state, proxy));
  }
  return rows;
}

type Proxy = ReturnType<typeof proxyWidgets>[number];

function instanceInputRow(
  state: SubgraphRowsState,
  slot: ReturnType<typeof nodeInputs>[number],
  proxy: Proxy | undefined,
): NodeRow {
  const { context, node } = state;
  const source = sourceOf(context, slot.link);
  const spec = proxy ? innerInput(state, proxy.nodeId, proxy.widget) : null;
  const editable = !source && proxy !== undefined;
  const widgetName = proxy?.widget ?? slot.name;
  const editSpec = source ? null : spec;
  return {
    name: slot.name,
    label: slot.label ?? slot.name,
    type: spec?.type ?? slotTypeName(slot.type),
    kind: instanceRowKind(source, slot.widget),
    required: false,
    value: editable ? innerValue(state, proxy.nodeId, proxy.widget) : undefined,
    source,
    options: spec?.options ?? null,
    target: editable ? innerTarget(state, proxy) : null,
    widgetName,
    appInput: state.appInputs.has(widgetName),
    inputSlot: nodeInputs(node).findIndex((candidate) => candidate.name === slot.name),
    linkable: nodeInputs(node).some((candidate) => candidate.name === slot.name),
    multiline: false,
    number: editSpec ? numberSpec(editSpec.type, editSpec.config) : null,
    height: null,
    imageUpload: editSpec !== null && isImageUpload(editSpec.config),
  };
}

interface EntryValue {
  readonly value: unknown;
  readonly target: RowTarget | null;
  readonly unresolved: boolean;
}

function entryRow(
  state: SubgraphRowsState,
  io: SubgraphIo,
  slot: number,
  widget: InnerWidget | null,
): NodeRow {
  const slots = nodeInputs(state.node);
  const at = slots.findIndex((candidate) => candidate.name === io.name);
  const instanceSlot = slots[at];
  const source = instanceSlot ? sourceOf(state.context, instanceSlot.link) : null;
  const spec = widget ? innerInput(state, widget.nodeId, widget.name) : null;
  const entry = widget && !source ? entryValueOf(state, slot, widget, spec) : NO_ENTRY;
  return {
    name: io.name,
    label: io.label ?? instanceSlot?.label ?? io.name,
    kind: entryRowKind(source, widget, entry),
    required: false,
    value: entry.value,
    source,
    target: entry.target,
    widgetName: io.name,
    appInput: state.appInputs.has(io.name),
    inputSlot: at < 0 ? null : at,
    linkable: at >= 0,
    height: null,
    ...specFields(spec, entry.target !== null, io),
  };
}

function specFields(
  spec: InnerInputSpec | null,
  editable: boolean,
  io: SubgraphIo,
): Pick<NodeRow, 'type' | 'options' | 'multiline' | 'number' | 'imageUpload'> {
  if (spec === null) {
    const type = slotTypeName(io.type);
    return { type, options: null, multiline: false, number: null, imageUpload: false };
  }
  return {
    type: spec.type,
    options: spec.options,
    multiline: spec.multiline,
    number: editable ? numberSpec(spec.type, spec.config) : null,
    imageUpload: editable && isImageUpload(spec.config),
  };
}

function entryValueOf(
  state: SubgraphRowsState,
  slot: number,
  widget: InnerWidget,
  spec: InnerInputSpec | null,
): EntryValue {
  const { context, node, definition } = state;
  const outer = outerValueOf(node, definition, slot, context.definitions);
  if (outer?.kind === 'unresolved') return { value: undefined, target: null, unresolved: true };
  const choice = spec?.choice === true;
  if (outer === null) {
    const proxy = { nodeId: widget.nodeId, widget: widget.name };
    const target = choice ? null : innerTarget(state, proxy);
    return { value: innerValue(state, widget.nodeId, widget.name), target, unresolved: false };
  }
  const target: RowTarget = {
    kind: 'instance',
    nodeId: node.id,
    slot,
    innerNodeId: widget.nodeId,
    innerClassType: widget.classType,
  };
  return { value: outer.value, target: choice ? null : target, unresolved: false };
}

function entryRowKind(
  source: RowSource | null,
  widget: InnerWidget | null,
  entry: EntryValue,
): NodeRowKind {
  if (source) return 'link';
  if (!widget) return 'socket';
  return entry.unresolved ? 'unresolved' : 'widget';
}

function instanceRowKind(source: RowSource | null, widget: unknown): NodeRowKind {
  if (source) return 'link';
  return widget ? 'widget' : 'socket';
}

function proxyRow(state: SubgraphRowsState, proxy: Proxy): NodeRow {
  const io = (state.definition.inputs ?? []).find((candidate) => candidate.name === proxy.widget);
  const spec = innerInput(state, proxy.nodeId, proxy.widget);
  return {
    name: proxy.widget,
    label: io?.label ?? proxy.widget,
    type: spec?.type ?? slotTypeName(io?.type),
    kind: 'widget',
    required: false,
    value: innerValue(state, proxy.nodeId, proxy.widget),
    source: null,
    options: spec?.options ?? null,
    target: innerTarget(state, proxy),
    widgetName: proxy.widget,
    appInput: state.appInputs.has(proxy.widget),
    inputSlot: null,
    linkable: false,
    multiline: spec?.multiline === true,
    number: spec ? numberSpec(spec.type, spec.config) : null,
    height: null,
    imageUpload: spec !== null && isImageUpload(spec.config),
  };
}

function innerTarget(state: SubgraphRowsState, proxy: Proxy): RowTarget | null {
  const inner = state.innerNodes.get(proxy.nodeId);
  if (!inner) return null;
  return {
    kind: 'subgraph',
    subgraphId: state.definition.id,
    innerNodeId: proxy.nodeId,
    innerClassType: inner.type,
  };
}

function innerInput(
  state: SubgraphRowsState,
  innerNodeId: NodeId,
  widget: string,
): InnerInputSpec | null {
  const inner = state.innerNodes.get(innerNodeId);
  const innerDefinition = inner ? state.context.definitions.get(inner.type) : undefined;
  const input = innerDefinition?.inputs.find((candidate) => candidate.name === widget);

  if (!input && widget === CONTROL_AFTER_GENERATE) {
    return { type: 'COMBO', options: SEED_CONTROLS, multiline: false, config: {}, choice: false };
  }
  if (!input) return null;
  return {
    type: input.type,
    options: input.options,
    multiline: input.config.multiline === true,
    config: input.config,
    choice: input.branches !== undefined,
  };
}

function innerValue(state: SubgraphRowsState, innerNodeId: NodeId, widget: string): unknown {
  const inner = state.innerNodes.get(innerNodeId);
  const innerDefinition = inner ? state.context.definitions.get(inner.type) : undefined;
  if (!inner || !innerDefinition) return undefined;

  const values = resolveWidgetValues(inner, innerDefinition);
  return values.ok ? values.byWidget.get(widget) : undefined;
}
