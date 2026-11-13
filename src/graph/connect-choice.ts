import { socketInputs } from '@/graph/create-node';
import type { NodeDefinition } from '@/graph/types';

// ─────────────────────────────
// 新しいノードを繋ぐ先の選び方。迷いが無いときだけ自動で繋ぎ、ほかは利用者に尋ねる。
// ─────────────────────────────

/** 何にでも繋がるスロット（ComfyUI のワイルドカード） */
const ANY_TYPE = '*';

/** 新しいノードのどちら側を繋ぐか。出力から足したなら入力、入力から足したなら出力 */
export type ConnectSide = 'input' | 'output';

/** 新しいノードの繋げる口 1 つと、起点の型に合うか */
export interface SlotChoice {
  /** ノードの `inputs` / `outputs` での位置 */
  readonly slot: number;
  readonly name: string;
  readonly type: string;
  /** 起点の型と合うか */
  readonly matches: boolean;
}

/** 新しいノードの繋げる側の口を並べ、それぞれが起点の型に合うかを添える */
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

/**
 * 型が合う口がちょうど 1 つならその位置。0 個でも 2 個以上でも null（尋ねる）。
 * 黙って先頭へ繋ぐと、positive のつもりが negative に入るような取り違えが起きる。
 */
export function autoSlot(choices: readonly SlotChoice[]): number | null {
  const matched = choices.filter((choice) => choice.matches);

  return matched.length === 1 ? (matched[0]?.slot ?? null) : null;
}

/** 尋ねる必要があるか。繋げる口が 1 つも無いノードは尋ねない（繋がないだけ） */
export function needsChoice(choices: readonly SlotChoice[]): boolean {
  return choices.length > 0 && autoSlot(choices) === null;
}
