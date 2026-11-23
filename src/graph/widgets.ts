import { readAppended } from '@/graph/appended-widgets';
import { subgraphDefinitions } from '@/graph/normalize';
import {
  NODE_MODE,
  nodeInputs,
  type InputDefinition,
  type NodeDefinition,
  type Workflow,
  type WorkflowNode,
} from '@/graph/types';
import {
  defaultSlots,
  slotCandidates,
  switchBranchValues,
  type ExpandedSlots,
  type SwitchedValues,
  type WidgetSlot,
} from '@/graph/widget-slots';
import { isRecord, isUnknownArray } from '@/lib/guards';
import { formatValue } from '@/lib/text';

interface WidgetValuesResolved {
  readonly ok: true;
  readonly slots: readonly WidgetSlot[];
  readonly inputs: readonly InputDefinition[];
  readonly byInput: ReadonlyMap<string, unknown>;
  readonly byWidget: ReadonlyMap<string, unknown>;
  readonly values: readonly unknown[];
  readonly appended: readonly string[];
}

type WidgetMismatch = 'slot-count-mismatch' | 'named-mismatch' | 'type-mismatch' | 'linked-choice';

interface WidgetValuesUnresolved {
  readonly ok: false;
  readonly reason: WidgetMismatch;
  readonly expected: number;
  readonly actual: number;
  readonly slots: readonly WidgetSlot[];
  readonly inputs: readonly InputDefinition[];
}

type WidgetValues = WidgetValuesResolved | WidgetValuesUnresolved;

export function widgetSlots(definition: NodeDefinition): readonly WidgetSlot[] {
  return defaultSlots(definition.inputs).slots;
}

export function widgetValueList(node: WorkflowNode): readonly unknown[] {
  return isUnknownArray(node.widgets_values) ? node.widgets_values : [];
}

export function widgetValueEntries(
  node: WorkflowNode,
): readonly { readonly name: string | null; readonly value: unknown }[] {
  const raw = node.widgets_values;
  if (isUnknownArray(raw)) return raw.map((value) => ({ name: null, value }));
  if (isRecord(raw)) return Object.entries(raw).map(([name, value]) => ({ name, value }));
  return [];
}

export function resolveWidgetValues(node: WorkflowNode, definition: NodeDefinition): WidgetValues {
  const values = widgetValueList(node);
  const candidates = slotCandidates(definition.inputs, values);
  const found = candidates.find((candidate) => candidate.slots.length === values.length);

  if (found === undefined) {
    const appended = readAppended(candidates, values, namedOrder(node, values.length));
    if (appended !== null && linkedChoice(node, appended.expanded.inputs) === null) {
      return resolvedOf(appended.expanded, appended.values, appended.appended);
    }
    const primary = candidates[0] ?? { slots: [], inputs: [] };
    return {
      ok: false,
      reason: 'slot-count-mismatch',
      expected: primary.slots.length,
      actual: values.length,
      slots: primary.slots,
      inputs: primary.inputs,
    };
  }
  const { slots, inputs } = found;
  const mismatch =
    namedMismatch(node, slots) ?? typeMismatch(inputs, slots, values) ?? linkedChoice(node, inputs);
  if (mismatch !== null) {
    return {
      ok: false,
      reason: mismatch,
      expected: slots.length,
      actual: values.length,
      slots,
      inputs,
    };
  }

  return resolvedOf(found, values, []);
}

function resolvedOf(
  { slots, inputs }: ExpandedSlots,
  values: readonly unknown[],
  appended: readonly string[],
): WidgetValuesResolved {
  const byInput = new Map<string, unknown>();
  const byWidget = new Map<string, unknown>();
  slots.forEach((slot, index) => {
    if (slot.kind === 'value') {
      byInput.set(slot.input, values[index]);
      byWidget.set(slot.input, values[index]);
      return;
    }
    if (slot.kind === 'control_after_generate')
      byWidget.set('control_after_generate', values[index]);
  });

  return { ok: true, slots, inputs, byInput, byWidget, values, appended };
}

function namedOrder(node: WorkflowNode, length: number): readonly string[] | null {
  const named = node.widgets_values_named;
  if (!isRecord(named)) return null;
  const names = Object.keys(named);
  return names.length === length ? names : null;
}

function linkedChoice(
  node: WorkflowNode,
  inputs: readonly InputDefinition[],
): WidgetMismatch | null {
  const choices = new Set(inputs.flatMap((input) => (input.branches ? [input.name] : [])));
  if (choices.size === 0) return null;
  const linked = nodeInputs(node).some(
    (slot) => choices.has(slot.name) && slot.link !== null && slot.link !== undefined,
  );
  return linked ? 'linked-choice' : null;
}

function namedMismatch(node: WorkflowNode, slots: readonly WidgetSlot[]): WidgetMismatch | null {
  const named = node.widgets_values_named;
  if (!isRecord(named)) return null;
  const names = Object.keys(named);
  if (names.length !== slots.length) return null;
  const same = slots.every((slot, at) => slot.kind !== 'value' || names[at] === slot.input);
  return same ? null : 'named-mismatch';
}

function fitsType(type: string, value: unknown): boolean {
  if (type === 'INT' || type === 'FLOAT') return typeof value === 'number';
  if (type === 'BOOLEAN') return typeof value === 'boolean';
  if (type === 'STRING') return typeof value === 'string';
  return true;
}

function typeMismatch(
  inputs: readonly InputDefinition[],
  slots: readonly WidgetSlot[],
  values: readonly unknown[],
): WidgetMismatch | null {
  const types = new Map(inputs.map((input) => [input.name, input.type]));
  const fits = slots.every(
    (slot, at) => slot.kind !== 'value' || fitsType(types.get(slot.input) ?? '', values[at]),
  );
  return fits ? null : 'type-mismatch';
}

export function writeWidgetValue(
  node: WorkflowNode,
  definition: NodeDefinition,
  inputName: string,
  value: unknown,
): WorkflowNode | null {
  return writeWidgetByName(node, definition, inputName, value);
}

export function writeWidgetByName(
  node: WorkflowNode,
  definition: NodeDefinition,
  widgetName: string,
  value: unknown,
): WorkflowNode | null {
  const resolved = resolveWidgetValues(node, definition);
  if (!resolved.ok) return null;

  const index = resolved.slots.findIndex((slot) =>
    slot.kind === 'control_after_generate'
      ? widgetName === 'control_after_generate'
      : slot.kind === 'value' && slot.input === widgetName,
  );
  if (index < 0) return null;

  const saved = widgetValueList(node);
  const current = index < saved.length ? saved : resolved.values;
  if (!Object.is(current[index], value)) {
    const switched = switchBranchValues(resolved, index, current, value);
    if (switched) {
      return { ...node, widgets_values: switched.values, ...namedAfterSwitch(node, switched) };
    }
  }
  const values = [...current];
  values[index] = value;

  return { ...node, widgets_values: values, ...namedCopy(node, widgetName, value) };
}

function namedAfterSwitch(
  node: WorkflowNode,
  switched: SwitchedValues,
): Pick<WorkflowNode, 'widgets_values_named'> {
  const named = node.widgets_values_named;
  const before = widgetValueList(node);
  if (!isRecord(named)) return {};
  const names = Object.keys(named);
  if (names.length !== before.length) return {};
  const at = switched.index;
  const addedNames = switched.added.slots.map((slot) =>
    slot.kind === 'value' ? slot.input : slot.kind,
  );
  const nextNames = [
    ...names.slice(0, at + 1),
    ...addedNames,
    ...names.slice(at + 1 + switched.removed),
  ];
  return {
    widgets_values_named: Object.fromEntries(
      nextNames.map((name, position): [string, unknown] => [name, switched.values[position]]),
    ),
  };
}

export function withNamedCopies(workflow: Workflow): Workflow {
  const nodes = syncedNodes(workflow.nodes);
  let subgraphsChanged = false;
  const subgraphs = subgraphDefinitions(workflow).map((sub) => {
    const inner = syncedNodes(sub.nodes);
    if (inner === null) return sub;
    subgraphsChanged = true;
    return { ...sub, nodes: inner };
  });
  if (nodes === null && !subgraphsChanged) return workflow;
  return {
    ...workflow,
    ...(nodes === null ? {} : { nodes }),
    ...(subgraphsChanged ? { definitions: { ...workflow.definitions, subgraphs } } : {}),
  };
}

function syncedNodes(nodes: readonly WorkflowNode[]): WorkflowNode[] | null {
  let changed = false;
  const next = nodes.map((node) => {
    const named = node.widgets_values_named;
    const values = node.widgets_values;
    if (!isRecord(named) || !Array.isArray(values)) return node;
    const names = Object.keys(named);
    if (names.length !== values.length) return node;
    if (names.every((name, at) => Object.is(named[name], values[at]))) return node;
    changed = true;
    const synced = Object.fromEntries(
      names.map((name, at): [string, unknown] => [name, values[at]]),
    );
    return { ...node, widgets_values_named: synced };
  });
  return changed ? next : null;
}

function namedCopy(
  node: WorkflowNode,
  widgetName: string,
  value: unknown,
): Pick<WorkflowNode, 'widgets_values_named'> {
  const named = node.widgets_values_named;
  if (!isRecord(named) || !Object.hasOwn(named, widgetName)) return {};
  return { widgets_values_named: { ...named, [widgetName]: value } };
}

export interface ValuePart {
  readonly text: string;
  readonly label: string;
  readonly bypassed: boolean;
}

function labelled(name: string | null, value: unknown, text: string, bypassed: boolean): ValuePart {
  const needsName = name !== null && (typeof value === 'number' || typeof value === 'boolean');

  return { text, label: needsName ? `${name}: ${text}` : text, bypassed };
}

export function valuePartOf(name: string | null, value: unknown, bypassed: boolean): ValuePart {
  return labelled(name, value, formatValue(value), bypassed);
}

export function summarizeValues(
  node: WorkflowNode,
  definition: NodeDefinition | undefined,
): readonly ValuePart[] {
  const named = definition ? namedWidgets(node, definition) : null;
  const entries = named ?? widgetValueEntries(node);

  const bypassed = node.mode === NODE_MODE.bypass;

  return entries
    .map((entry) => labelled(entry.name, entry.value, formatValue(entry.value), bypassed))
    .filter((part) => part.text.length > 0);
}

function namedWidgets(
  node: WorkflowNode,
  definition: NodeDefinition,
): { name: string | null; value: unknown }[] | null {
  const widgets = resolveWidgetValues(node, definition);
  if (!widgets.ok) return null;

  return widgets.inputs
    .filter((input) => input.isWidget)
    .map((input) => ({ name: input.name, value: widgets.byInput.get(input.name) }));
}
