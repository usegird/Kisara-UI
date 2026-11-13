import type { NodeDefinition, NodeDefinitionMap, Workflow, WorkflowNode } from '@/graph/types';
import { nodeInputs } from '@/graph/types';
import { resolveWidgetValues, writeWidgetValue } from '@/graph/widgets';
import { clamp } from '@/lib/clamp';

// ─────────────────────────────
// `control_after_generate`（seed の直下に付く制御 widget）に従って seed を進める純関数。
// ─────────────────────────────

/** `control_after_generate` の取りうる値 */
export const SEED_CONTROLS = ['fixed', 'increment', 'decrement', 'randomize'] as const;

/** seed の進め方 */
type SeedControl = (typeof SEED_CONTROLS)[number];

function isControl(value: unknown): value is SeedControl {
  return typeof value === 'string' && (SEED_CONTROLS as readonly string[]).includes(value);
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** 乱数の供給（テストで固定できるように差し替え可能にする） */
type Random = () => number;

/**
 * 次の seed。範囲は入力設定の min / max に収める。
 * **2^53 を超える max は扱えない**ので、そこで頭打ちにする（JS の整数精度の限界）。
 */
export function nextSeed(
  current: number,
  control: SeedControl,
  config: { readonly min?: unknown; readonly max?: unknown },
  random: Random = Math.random,
): number {
  const min = num(config.min, 0);
  const max = Math.min(num(config.max, Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
  const inRange = (value: number): number => clamp(value, min, max);

  switch (control) {
    case 'increment':
      return inRange(current + 1);
    case 'decrement':
      return inRange(current - 1);
    case 'randomize':
      return inRange(Math.floor(random() * (max - min + 1)) + min);
    case 'fixed':
      return current;
  }
}

function advanceNode(
  node: WorkflowNode,
  definition: NodeDefinition,
  random: Random,
): WorkflowNode | null {
  const widgets = resolveWidgetValues(node, definition);
  if (!widgets.ok) return null;

  const control = widgets.byWidget.get('control_after_generate');
  if (!isControl(control) || control === 'fixed') return null;

  // 制御 widget が付いている入力（seed / noise_seed など）を進める
  const target = widgets.slots.find((slot) => slot.kind === 'control_after_generate');
  if (!target) return null;

  // 接続済みの seed は上流から値が来るので触らない（無用な編集済み表示を出さない）
  const linked = nodeInputs(node).some(
    (input) => input.name === target.input && input.link !== null && input.link !== undefined,
  );
  if (linked) return null;

  const current = widgets.byInput.get(target.input);
  if (typeof current !== 'number') return null;

  const config = definition.inputs.find((input) => input.name === target.input)?.config ?? {};

  return writeWidgetValue(
    node,
    definition,
    target.input,
    nextSeed(current, control, config, random),
  );
}

/**
 * `control_after_generate` に従って seed を進めた Workflow を返す。
 * 変化が無ければ**同じ参照**を返す（無用な再描画・編集済み表示を出さない）。
 */
export function advanceSeeds(
  workflow: Workflow,
  definitions: NodeDefinitionMap,
  random: Random = Math.random,
): Workflow {
  let changed = false;

  const nodes = workflow.nodes.map((node) => {
    const definition = definitions.get(node.type);
    if (!definition) return node;

    const next = advanceNode(node, definition, random);
    if (!next) return node;

    changed = true;
    return next;
  });

  return changed ? { ...workflow, nodes } : workflow;
}
