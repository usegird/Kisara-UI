import { socketInputs } from '@/graph/create-node';
import type { NodeDefinition } from '@/graph/types';

const ANY_TYPE = '*';

export type ConnectSide = 'input' | 'output';

export interface SlotChoice {
  readonly slot: number;
  readonly name: string;
  readonly type: string;
  readonly matches: boolean;
}

export function slotChoices(
  definition: NodeDefinition,
  type: string,
  side: ConnectSide,
): SlotChoice[] {
  const slots =
    side === 'input'
      ? socketInputs(definition).map((input) => ({ name: input.name, type: input.type }))
      : definition.outputs.map((output) => ({ name: output.name, type: output.type }));

  return slots.map((slot, index) => ({
    slot: index,
    name: slot.name,
    type: slot.type,
    matches: slot.type === type || slot.type === ANY_TYPE || type === ANY_TYPE,
  }));
}

export function autoSlot(choices: readonly SlotChoice[]): number | null {
  const matched = choices.filter((choice) => choice.matches);

  return matched.length === 1 ? (matched[0]?.slot ?? null) : null;
}

export function needsChoice(choices: readonly SlotChoice[]): boolean {
  return choices.length > 0 && autoSlot(choices) === null;
}
