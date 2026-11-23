import { appInputNames } from '@/graph/app-inputs';
import { isImageUpload } from '@/graph/image-options';
import type { linkIndex } from '@/graph/link-read';
import { multilineHeight } from '@/graph/multiline-height';
import { numberSpec } from '@/graph/number-spec';
import type { OutputValueResolver } from '@/graph/output-values';
import type { NodeOutputView, NodeRow, NodeRowKind, RowSource } from '@/graph/rows';
import { SEED_CONTROLS } from '@/graph/seed-control';
import {
  NODE_MODE,
  nodeInputs,
  nodeMode,
  nodeOutputs,
  slotTypeName,
  type InputDefinition,
  type NodeDefinition,
  type NodeDefinitionMap,
  type NodeId,
  type SubgraphDefinition,
  type Workflow,
  type WorkflowNode,
} from '@/graph/types';
import type { WidgetSlot } from '@/graph/widget-slots';
import { resolveWidgetValues, widgetValueEntries, widgetValueList } from '@/graph/widgets';
import { t } from '@/i18n';

export const CONTROL_AFTER_GENERATE = 'control_after_generate';

export interface RowContext {
  readonly workflow: Workflow;
  readonly definitions: NodeDefinitionMap;
  readonly subgraphs: ReadonlyMap<string, SubgraphDefinition>;
  readonly links: ReturnType<typeof linkIndex>;
  readonly outputValue: OutputValueResolver;
  readonly numbers: ReadonlyMap<NodeId, string>;
}

type WidgetValues = ReturnType<typeof resolveWidgetValues>;

interface NodeRowsState {
  readonly context: RowContext;
  readonly node: WorkflowNode;
  readonly widgets: WidgetValues;
  readonly appInputs: ReadonlySet<string>;
  readonly textHeight: number | null;
  readonly controlInputs: ReadonlySet<string>;
}

export function rowsForNode(
  context: RowContext,
  node: WorkflowNode,
  definition: NodeDefinition,
): NodeRow[] {
  const widgets = resolveWidgetValues(node, definition);
  const state: NodeRowsState = {
    context,
    node,
    widgets,
    appInputs: appInputNames(context.workflow, node.id),
    textHeight: multilineHeight(node, definition),
    controlInputs: new Set(
      (widgets.ok ? widgets.slots : []).flatMap((slot) =>
        slot.kind === 'control_after_generate' ? [slot.input] : [],
      ),
    ),
  };

  const rows: NodeRow[] = widgets.inputs.flatMap((input) => inputRows(state, input));
  rows.push(...undeclaredRows(context, node, widgets.inputs));
  return rows;
}

function inputRows(state: NodeRowsState, input: NodeDefinition['inputs'][number]): NodeRow[] {
  const { node, widgets, appInputs } = state;
  const inputSlot = nodeInputs(node).findIndex((candidate) => candidate.name === input.name);
  const slot = inputSlot >= 0 ? nodeInputs(node)[inputSlot] : undefined;
  const source = sourceOf(state.context, slot?.link);
  const kind = rowKindOf(source, input.isWidget, widgets.ok);
  const isWidget = kind === 'widget';
  const edit = widgetEditOf(state, input, isWidget);

  const row: NodeRow = {
    name: input.name,
    label: slot?.label ?? input.name,
    type: input.type,
    kind,
    required: input.required,
    value: widgets.ok
      ? widgets.byInput.get(input.name)
      : positionalValueOf(node, widgets.slots, input.name),
    source,
    options: input.options,
    target: edit.target,
    widgetName: input.name,
    appInput: appInputs.has(input.name),
    inputSlot: isWidget || inputSlot < 0 ? null : inputSlot,
    linkable: input.branches === undefined && (isWidget || inputSlot >= 0),
    multiline: input.config.multiline === true,
    number: edit.number,
    height: edit.height,
    imageUpload: edit.imageUpload,
  };

  if (!state.controlInputs.has(input.name) || kind === 'link') return [row];
  return [row, controlRow(state, input.name)];
}

function widgetEditOf(
  state: NodeRowsState,
  input: NodeDefinition['inputs'][number],
  isWidget: boolean,
): Pick<NodeRow, 'target' | 'number' | 'height' | 'imageUpload'> {
  if (!isWidget) return { target: null, number: null, height: null, imageUpload: false };
  const { node } = state;
  return {
    target: { kind: 'node', nodeId: node.id, classType: node.type },
    number: numberSpec(input.type, input.config),
    height: input.config.multiline === true ? state.textHeight : null,
    imageUpload: isImageUpload(input.config),
  };
}

function positionalValueOf(
  node: WorkflowNode,
  slots: readonly WidgetSlot[],
  inputName: string,
): unknown {
  const index = slots.findIndex((slot) => slot.kind === 'value' && slot.input === inputName);
  const values = widgetValueList(node);
  return index >= 0 && index < values.length ? values[index] : undefined;
}

function rowKindOf(source: RowSource | null, isWidget: boolean, resolved: boolean): NodeRowKind {
  if (source) return 'link';
  if (!isWidget) return 'socket';
  if (!resolved) return 'unresolved';
  return 'widget';
}

function controlRow({ node, widgets, appInputs }: NodeRowsState, inputName: string): NodeRow {
  return {
    name: `${inputName}.${CONTROL_AFTER_GENERATE}`,
    label: CONTROL_AFTER_GENERATE,
    type: 'COMBO',
    kind: 'widget',
    required: false,
    value: widgets.ok ? widgets.byWidget.get(CONTROL_AFTER_GENERATE) : undefined,
    source: null,
    options: SEED_CONTROLS,
    target: { kind: 'node', nodeId: node.id, classType: node.type },
    widgetName: CONTROL_AFTER_GENERATE,
    appInput: appInputs.has(CONTROL_AFTER_GENERATE),
    inputSlot: null,
    linkable: false,
    multiline: false,
    number: null,
    height: null,
    imageUpload: false,
  };
}

function undeclaredRows(
  context: RowContext,
  node: WorkflowNode,
  inputs: readonly InputDefinition[],
): NodeRow[] {
  const declared = new Set(inputs.map((input) => input.name));
  return nodeInputs(node).flatMap((slot, inputSlot): NodeRow[] => {
    if (declared.has(slot.name)) return [];
    const source = sourceOf(context, slot.link);
    return [
      {
        name: slot.name,
        label: slot.label ?? slot.name,
        type: slotTypeName(slot.type),
        kind: source ? 'link' : 'socket',
        required: false,
        value: undefined,
        source,
        options: null,
        target: null,
        widgetName: slot.name,
        appInput: false,
        inputSlot,
        linkable: true,
        multiline: false,
        number: null,
        height: null,
        imageUpload: false,
      },
    ];
  });
}

export function rowsForUnknown(context: RowContext, node: WorkflowNode): NodeRow[] {
  const rows: NodeRow[] = nodeInputs(node).map((slot, inputSlot) => {
    const source = sourceOf(context, slot.link);
    return {
      name: slot.name,
      label: slot.label ?? slot.name,
      type: slotTypeName(slot.type),
      kind: unknownRowKind(source, slot.widget),
      required: false,
      value: undefined,
      source,
      options: null,
      target: null,
      widgetName: slot.name,
      appInput: false,
      inputSlot,
      linkable: true,
      multiline: false,
      number: null,
      height: null,
      imageUpload: false,
    };
  });

  widgetValueEntries(node).forEach(({ name, value }, index) => {
    rows.push({
      name: `#${index}`,
      label: name ?? t('graph.rows.valueFallback', { index: String(index + 1) }),
      type: '*',
      kind: 'unresolved',
      required: false,
      value,
      source: null,
      options: null,
      target: null,
      widgetName: `#${index}`,
      appInput: false,
      inputSlot: null,
      linkable: false,
      multiline: typeof value === 'string' && value.includes('\n'),
      number: null,
      height: null,
      imageUpload: false,
    });
  });

  return rows;
}

function unknownRowKind(source: RowSource | null, widget: unknown): NodeRowKind {
  if (source) return 'link';
  return widget ? 'unresolved' : 'socket';
}

export function sourceOf(context: RowContext, linkId: number | null | undefined): RowSource | null {
  if (linkId === null || linkId === undefined) return null;

  const link = context.links.get(linkId);
  if (!link) return null;

  const origin = context.workflow.nodes.find((node) => node.id === link.originId);
  const originName = origin
    ? (context.subgraphs.get(origin.type)?.name ??
      context.definitions.get(origin.type)?.displayName ??
      origin.type)
    : `#${link.originId}`;
  const outputName = nodeOutputs(origin)[link.originSlot]?.name ?? link.type;

  return {
    linkId: link.id,
    nodeId: link.originId,
    slot: link.originSlot,
    type: link.type,
    label: `${originName} / ${outputName}`,
    values: context.outputValue(link.originId, link.originSlot),
    muted: origin !== undefined && nodeMode(origin) === NODE_MODE.mute,
    sourceIndex: context.numbers.get(link.originId) ?? null,
  };
}

export function outputsOf(
  context: RowContext,
  node: WorkflowNode,
  definition: NodeDefinition | undefined,
): NodeOutputView[] {
  const shape =
    nodeOutputs(node).length > 0
      ? nodeOutputs(node).map((output) => ({ name: output.name, type: slotTypeName(output.type) }))
      : (definition?.outputs ?? []).map((output) => ({ name: output.name, type: output.type }));

  return shape.map((output, slot) => ({ ...output, values: context.outputValue(node.id, slot) }));
}
