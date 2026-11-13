import { nodeInputs, nodeOutputs, slotTypeName, type WorkflowNode } from '@/graph/types';

// ─────────────────────────────
// スロットの型が合うかの判定と、繋ぐ先のスロットの選び方。
// ─────────────────────────────

/** 何にでも繋がるスロットの型 */
const ANY_SLOT_TYPE = '*';

/**
 * 2 つのスロットの型が合うか（本体の突き合わせに合わせる）。
 * `*` と空は何にでも合う。大文字小文字は区別しない。カンマ区切りは組のどれかが合えばよい
 */
export function typesMatch(a: string, b: string): boolean {
  const left = slotTypeMembers(a);
  const right = slotTypeMembers(b);
  if (left.length === 0 || right.length === 0) return true;
  if (left.includes(ANY_SLOT_TYPE) || right.includes(ANY_SLOT_TYPE)) return true;
  return left.some((member) => right.includes(member));
}

/**
 * スロットの型をカンマで分けた組（小文字にし、前後の空白を削る。`IMAGE, MASK` のような書き方もある）。
 * 検索の絞り込みは索引の型の名前で選ぶので、大文字小文字を区別したまま比べる（search-index）
 */
function slotTypeMembers(type: string): string[] {
  return type
    .split(',')
    .map((member) => member.trim().toLowerCase())
    .filter((member) => member.length > 0);
}

/**
 * その型を**受けられる**入力の位置。無ければ null。
 * 型が合うものが無いときは、繋ぐ先を勝手に決めない（利用者の手に委ねる）。
 */
export function inputSlotFor(node: WorkflowNode, type: string): number | null {
  const at = nodeInputs(node).findIndex((input) => typesMatch(slotTypeName(input.type), type));

  return at < 0 ? null : at;
}

/** その型を**出せる**出力の位置。無ければ null */
export function outputSlotFor(node: WorkflowNode, type: string): number | null {
  const at = nodeOutputs(node).findIndex((output) => typesMatch(slotTypeName(output.type), type));

  return at < 0 ? null : at;
}
