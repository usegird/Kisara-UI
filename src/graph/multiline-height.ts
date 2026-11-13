import { FALLBACK_SIZE } from '@/graph/node-settings';
import type { NodeDefinition, WorkflowNode } from '@/graph/types';
import { nodeInputs, nodeOutputs } from '@/graph/types';
import { widgetSlots } from '@/graph/widgets';

// ─────────────────────────────
// 複数行の入力の高さ ↔ ノードの `size` の換算。本体と同じく高さをノードの大きさ（標準キー `size`）で持ち、
// 独自キーは足さない。
// ─────────────────────────────

// 換算は本体の並べ方を真似た近似（推論。本体の版で変わりうる）。入出力の口は左右の多い方の段数 ×
// SLOT_HEIGHT、1 行のパラメータは 1 つ WIDGET_HEIGHT。往復（読んだ高さをそのまま書く）で値が
// 変わらないことだけは保証する
const SLOT_HEIGHT = 20;
const WIDGET_HEIGHT = 24;
const PADDING = 8;

/** 複数行の入力の下限（px）。これより縮めない */
export const MIN_MULTILINE_HEIGHT = 48;

/** `size` から換算できないときの高さ（px） */
export const DEFAULT_MULTILINE_HEIGHT = 64;

function isLinked(node: WorkflowNode, name: string): boolean {
  const input = nodeInputs(node).find((candidate) => candidate.name === name);
  return typeof input?.link === 'number';
}

/**
 * 複数行の入力の名前。繋がっているものも含める（等分の数を線の有無で変えない。外すと残りの入力が
 * 伸びる。アプリ入力にしたものも同じく数に入る）
 */
function multilineNames(definition: NodeDefinition): ReadonlySet<string> {
  return new Set(
    definition.inputs
      .filter((input) => input.isWidget && input.config.multiline === true)
      .map((input) => input.name),
  );
}

/** 複数行の入力以外が取る高さ */
function fixedHeight(
  node: WorkflowNode,
  definition: NodeDefinition,
  multiline: ReadonlySet<string>,
): number {
  const inputs = nodeInputs(node);
  // 繋いだ複数行の入力は口の段ではなく、等分の 1 つとして数える
  const slotInputs = inputs.filter(
    (input) => (!input.widget || typeof input.link === 'number') && !multiline.has(input.name),
  );
  const slotRows = Math.max(slotInputs.length, nodeOutputs(node).length);

  const widgetRows = widgetSlots(definition).filter(
    (slot) => !multiline.has(slot.input) && !isLinked(node, slot.input),
  ).length;

  return slotRows * SLOT_HEIGHT + widgetRows * WIDGET_HEIGHT + PADDING;
}

function sizeHeight(node: WorkflowNode): number | null {
  const size = node.size;
  if (!Array.isArray(size)) return null;

  const height: unknown = size[1];
  return typeof height === 'number' && Number.isFinite(height) ? height : null;
}

/** 複数行の入力 1 つぶんの高さ。`size` が無い・複数行の入力が無ければ null（既定の高さ） */
export function multilineHeight(node: WorkflowNode, definition: NodeDefinition): number | null {
  const names = multilineNames(definition);
  const height = sizeHeight(node);
  if (names.size === 0 || height === null) return null;

  const each = (height - fixedHeight(node, definition, names)) / names.size;
  return Math.max(MIN_MULTILINE_HEIGHT, Math.round(each));
}

/** 複数行の入力 1 つぶんの高さを `size` へ書く。幅は今のまま（無ければ目安） */
export function withMultilineHeight(
  node: WorkflowNode,
  definition: NodeDefinition,
  height: number,
): WorkflowNode {
  const names = multilineNames(definition);
  if (names.size === 0) return node;

  const each = Math.max(MIN_MULTILINE_HEIGHT, Math.round(height));
  const total = fixedHeight(node, definition, names) + each * names.size;
  const width: unknown = Array.isArray(node.size) ? node.size[0] : undefined;
  if (sizeHeight(node) === total) return node;

  return { ...node, size: [typeof width === 'number' ? width : FALLBACK_SIZE[0], total] };
}
