import type { InputBranch, InputDefinition } from '@/graph/types';

const SEED_WIDGET_NAMES = new Set(['seed', 'noise_seed']);

const DEFAULT_CONTROL = 'fixed';

export type WidgetSlotKind = 'value' | 'control_after_generate' | 'upload';

export interface WidgetSlot {
  readonly input: string;
  readonly kind: WidgetSlotKind;
}

export interface ExpandedSlots {
  readonly slots: readonly WidgetSlot[];
  readonly inputs: readonly InputDefinition[];
}

export function defaultSlots(inputs: readonly InputDefinition[]): ExpandedSlots {
  return expandSlots(inputs, true, null);
}

export function slotCandidates(
  inputs: readonly InputDefinition[],
  values: readonly unknown[],
): ExpandedSlots[] {
  const withSeedRule = expandSlots(inputs, true, values);
  const declaredOnly = expandSlots(inputs, false, values);
  return sameSlots(withSeedRule.slots, declaredOnly.slots)
    ? [withSeedRule]
    : [withSeedRule, declaredOnly];
}

export interface SwitchedValues {
  readonly values: unknown[];
  readonly index: number;
  readonly removed: number;
  readonly added: ExpandedSlots;
}

export function switchBranchValues(
  expanded: ExpandedSlots,
  index: number,
  values: readonly unknown[],
  key: unknown,
): SwitchedValues | null {
  const slot = expanded.slots[index];
  const input = expanded.inputs.find((candidate) => candidate.name === slot?.input);
  if (slot?.kind !== 'value' || !input?.branches) return null;
  const prefix = `${input.name}.`;
  let end = index + 1;
  while (expanded.slots[end]?.input.startsWith(prefix)) end += 1;
  const branch = branchOf(input, key, false);
  const added = expandSlots(branch?.inputs ?? [], false, null);
  return {
    values: [
      ...values.slice(0, index),
      key,
      ...defaultSlotValues(added, new Set()),
      ...values.slice(end),
    ],
    index,
    removed: end - index - 1,
    added,
  };
}

export function defaultSlotValues(expanded: ExpandedSlots, blank: ReadonlySet<string>): unknown[] {
  const byName = new Map(expanded.inputs.map((input) => [input.name, input]));
  return expanded.slots.map((slot) => {
    if (slot.kind === 'upload') return '';
    if (slot.kind === 'control_after_generate') return DEFAULT_CONTROL;
    if (blank.has(slot.input)) return '';
    const input = byName.get(slot.input);
    return input ? defaultValueOf(input) : null;
  });
}

export function defaultValueOf(input: InputDefinition): unknown {
  const configured = input.config.default;
  if (configured !== undefined) return configured;

  if (input.type === 'COMBO') return input.options?.[0] ?? '';
  if (input.type === 'INT' || input.type === 'FLOAT') return 0;
  if (input.type === 'BOOLEAN') return false;
  return '';
}

interface ExpandState {
  readonly seedRule: boolean;
  readonly values: readonly unknown[] | null;
  readonly slots: WidgetSlot[];
  readonly inputs: InputDefinition[];
}

function expandSlots(
  inputs: readonly InputDefinition[],
  seedRule: boolean,
  values: readonly unknown[] | null,
): ExpandedSlots {
  const state: ExpandState = { seedRule, values, slots: [], inputs: [] };
  walkInputs(state, inputs);
  return { slots: state.slots, inputs: state.inputs };
}

function walkInputs(state: ExpandState, inputs: readonly InputDefinition[]): void {
  for (const input of inputs) {
    state.inputs.push(input);
    if (!input.isWidget) continue;

    const at = state.slots.length;
    state.slots.push({ input: input.name, kind: 'value' });
    if (isEnabled(input.config.control_after_generate) || (state.seedRule && isSeedWidget(input))) {
      state.slots.push({ input: input.name, kind: 'control_after_generate' });
    }
    if (isEnabled(input.config.image_upload)) {
      state.slots.push({ input: input.name, kind: 'upload' });
    }
    const branch = branchOf(input, state.values?.[at], state.values === null);
    if (branch) walkInputs(state, branch.inputs);
  }
}

function branchOf(input: InputDefinition, value: unknown, initial: boolean): InputBranch | null {
  const branches = input.branches;
  if (!branches) return null;
  if (initial) return branches[0] ?? null;
  return branches.find((branch) => branch.key === value) ?? null;
}

function isEnabled(value: unknown): boolean {
  return value !== undefined && value !== null && value !== false;
}

function isSeedWidget(input: { readonly name: string; readonly type: string }): boolean {
  return input.type === 'INT' && SEED_WIDGET_NAMES.has(input.name);
}

function sameSlots(left: readonly WidgetSlot[], right: readonly WidgetSlot[]): boolean {
  return (
    left.length === right.length &&
    left.every((slot, at) => slot.input === right[at]?.input && slot.kind === right[at]?.kind)
  );
}
