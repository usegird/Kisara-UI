import type { InputDefinition } from '@/graph/types';
import { defaultSlotValues, type ExpandedSlots, type WidgetSlot } from '@/graph/widget-slots';

const MAX_APPENDED = 3;

type Fit = 'fit' | 'unknown' | 'mismatch';

export interface AppendedReading {
  readonly expanded: ExpandedSlots;
  readonly values: readonly unknown[];
  readonly appended: readonly string[];
}

export function readAppended(
  candidates: readonly ExpandedSlots[],
  values: readonly unknown[],
  names: readonly string[] | null,
): AppendedReading | null {
  let readings = 0;
  let accepted: AppendedReading | null = null;
  for (const candidate of candidates) {
    const gap = candidate.slots.length - values.length;
    if (gap < 1 || gap > MAX_APPENDED) continue;
    const byName = new Map(candidate.inputs.map((input) => [input.name, input]));
    for (const skipped of combinations(candidate.slots.length, gap)) {
      const kept = candidate.slots.filter((_, at) => !skipped.has(at));
      if (!fitsAll(kept, byName, values) || !sameNames(kept, names)) continue;
      readings += 1;
      if (readings > 1) return null;
      const tail = candidate.slots.slice(values.length);
      if (isTail(skipped, values.length) && tail.every((slot) => isAppendable(slot, byName))) {
        accepted = withDefaults(candidate, values, tail);
      }
    }
  }
  return accepted;
}

function withDefaults(
  candidate: ExpandedSlots,
  values: readonly unknown[],
  tail: readonly WidgetSlot[],
): AppendedReading {
  const filled = defaultSlotValues({ slots: tail, inputs: candidate.inputs }, new Set());
  return {
    expanded: candidate,
    values: [...values, ...filled],
    appended: tail.map((slot) => slot.input),
  };
}

function isAppendable(slot: WidgetSlot, byName: ReadonlyMap<string, InputDefinition>): boolean {
  const input = byName.get(slot.input);
  return slot.kind === 'value' && input !== undefined && !input.required && !input.branches;
}

function isTail(skipped: ReadonlySet<number>, length: number): boolean {
  return [...skipped].every((at) => at >= length);
}

function fitsAll(
  kept: readonly WidgetSlot[],
  byName: ReadonlyMap<string, InputDefinition>,
  values: readonly unknown[],
): boolean {
  return kept.every((slot, at) => fitOf(slot, byName.get(slot.input), values[at]) !== 'mismatch');
}

function sameNames(kept: readonly WidgetSlot[], names: readonly string[] | null): boolean {
  if (names === null) return true;
  return kept.every((slot, at) => slot.kind !== 'value' || names[at] === slot.input);
}

function fitOf(slot: WidgetSlot, input: InputDefinition | undefined, value: unknown): Fit {
  if (slot.kind === 'control_after_generate') return typeof value === 'string' ? 'fit' : 'mismatch';
  if (slot.kind === 'upload' || input === undefined) return 'unknown';
  if (input.branches) {
    return input.branches.some((branch) => branch.key === value) ? 'fit' : 'mismatch';
  }
  if (input.type === 'INT' || input.type === 'FLOAT') return numberFit(input, value);
  if (input.type === 'BOOLEAN') return typeof value === 'boolean' ? 'fit' : 'mismatch';
  if (input.type === 'STRING') return typeof value === 'string' ? 'fit' : 'mismatch';
  if (input.type === 'COMBO') return comboFit(input, value);
  return 'unknown';
}

function numberFit(input: InputDefinition, value: unknown): Fit {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'mismatch';
  if (input.type === 'INT' && !Number.isInteger(value)) return 'mismatch';
  const { min, max } = input.config;
  if (typeof min === 'number' && value < min) return 'mismatch';
  if (typeof max === 'number' && value > max) return 'mismatch';
  return 'fit';
}

function comboFit(input: InputDefinition, value: unknown): Fit {
  if (typeof value !== 'string' && typeof value !== 'number') return 'mismatch';
  return input.options?.includes(value) === true ? 'fit' : 'unknown';
}

function* combinations(count: number, size: number, from = 0): Generator<Set<number>> {
  if (size === 0) {
    yield new Set();
    return;
  }
  for (let at = from; at <= count - size; at += 1) {
    for (const rest of combinations(count, size - 1, at + 1)) yield new Set([at, ...rest]);
  }
}
