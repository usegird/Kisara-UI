import {
  applyAppValues,
  appValuesInUse,
  savedAppValues,
  withoutSavedAppValues,
} from '@/graph/app-input-values';
import { parseWorkflow, subgraphDefinitions } from '@/graph/normalize';
import { toApiPrompt, type ApiPrompt } from '@/graph/to-api-prompt';
import type {
  InputDefinition,
  NodeDefinition,
  NodeDefinitionMap,
  Workflow,
  WorkflowNode,
} from '@/graph/types';
import { widgetSlots } from '@/graph/widgets';
import { isUnknownArray } from '@/lib/guards';
import { ownOr } from '@/lib/own-key';

// ─────────────────────────────
// 実行の記録のシードとプロンプトの拾い方と、置き場の印つきの出力のパスの書き方。純関数。
// ─────────────────────────────

/** 値の置き場。実行の形のノード id と入力名 */
export type ValueSlot = readonly [nodeId: string, input: string];

/** 置き場のノードの定義。ノード名と、あればコメント（`title`） */
export type SlotNode = readonly [name: string] | readonly [name: string, comment: string];

/** 送った Workflow JSON から拾ったシードとプロンプトの、置き場と値 */
export interface SplitRun {
  /** 実行の形（値を入れたまま）。モデルとプロンプトの役割を拾うのに使い、残さない */
  readonly api: ApiPrompt;
  /** 置き場が指すノードの定義（ノード id → 名前とコメント） */
  readonly nodes: Readonly<Record<string, SlotNode>>;
  readonly seedSlots: readonly ValueSlot[];
  readonly promptSlots: readonly ValueSlot[];
  readonly seeds: readonly unknown[];
  readonly prompts: readonly unknown[];
}

// ─────────────────────────────
// 分類
// ─────────────────────────────

function isPromptInput(input: InputDefinition | undefined): boolean {
  if (input === undefined || input.type !== 'STRING') return false;
  const multiline = input.config.multiline;
  return multiline !== undefined && multiline !== null && multiline !== false;
}

/** 入力にシードの制御が付くか（宣言、または INT で名前が seed / noise_seed） */
function isSeedInput(definition: NodeDefinition, name: string): boolean {
  return widgetSlots(definition).some(
    (slot) => slot.input === name && slot.kind === 'control_after_generate',
  );
}

/** ノード id の順（`59:70` のような subgraph の中の id も、区切りごとに数として比べる） */
function byNodeId(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true });
}

/** 実行の形のノード id（`59:70` は subgraph の中をたどる）から、Workflow JSON のノードを引く */
function nodeAt(workflow: Workflow, promptNodeId: string): WorkflowNode | undefined {
  const subgraphs = subgraphDefinitions(workflow);
  let nodes = workflow.nodes;
  let found: WorkflowNode | undefined;
  for (const part of promptNodeId.split(':')) {
    found = nodes.find((node) => String(node.id) === part);
    if (found === undefined) return undefined;
    const type = found.type;
    nodes = subgraphs.find((subgraph) => subgraph.id === type)?.nodes ?? [];
  }
  return found;
}

function slotNode(
  workflow: Workflow,
  promptNodeId: string,
  classType: string,
  definition: NodeDefinition,
): SlotNode {
  const node = nodeAt(workflow, promptNodeId);
  const name = definition.displayName.length > 0 ? definition.displayName : classType;
  const comment = typeof node?.title === 'string' ? node.title : '';
  return comment.length > 0 && comment !== name ? [name, comment] : [name];
}

// ─────────────────────────────
// 拾う
// ─────────────────────────────

/**
 * 送った Workflow JSON からシードとプロンプトを拾う。実行の形はアプリ入力の値を入れたもの
 * （送るときと同じ）。直せなければ null
 */
export function splitRun(raw: unknown, definitions: NodeDefinitionMap): SplitRun | null {
  let api: ApiPrompt;
  let base: Workflow;
  try {
    const workflow = parseWorkflow(raw);
    base = withoutSavedAppValues(workflow);
    const values = appValuesInUse(base, savedAppValues(workflow));
    api = applyAppValues(toApiPrompt(base, definitions).prompt, values);
  } catch {
    // 直せない Workflow JSON は時刻と出力のパスだけを残す
    return null;
  }

  const seedSlots: ValueSlot[] = [];
  const promptSlots: ValueSlot[] = [];
  const nodes: Record<string, SlotNode> = {};
  for (const nodeId of Object.keys(api).sort(byNodeId)) {
    const node = api[nodeId];
    const definition = node === undefined ? undefined : definitions.get(node.class_type);
    if (node === undefined || definition === undefined) continue;
    const inputs = new Map(definition.inputs.map((input) => [input.name, input]));
    for (const [name, value] of Object.entries(node.inputs)) {
      // リンク（`["12", 0]`）は上流から来る値なので拾わない
      if (isUnknownArray(value)) continue;
      if (isSeedInput(definition, name)) seedSlots.push([nodeId, name]);
      else if (isPromptInput(inputs.get(name))) promptSlots.push([nodeId, name]);
      else continue;
      ownOr(nodes, nodeId, () => slotNode(base, nodeId, node.class_type, definition));
    }
  }

  const read = ([nodeId, name]: ValueSlot): unknown => api[nodeId]?.inputs[name] ?? null;
  return {
    api,
    nodes,
    seedSlots,
    promptSlots,
    seeds: seedSlots.map(read),
    prompts: promptSlots.map(read),
  };
}

/**
 * 置き場の印つきで書くファイルの参照（LoadImage の値と同じ書き方）。窓口の出力ファイルの
 * 参照と同じ形
 */
interface AnnotatedFile {
  readonly filename: string;
  readonly subfolder: string;
  readonly type: string;
}

/** 出力のパス。`output` 以外は末尾に ` [temp]` のような置き場の印を付ける */
export function outputPath(file: AnnotatedFile): string {
  const path = file.subfolder === '' ? file.filename : `${file.subfolder}/${file.filename}`;
  return file.type === 'output' ? path : `${path} [${file.type}]`;
}

/** `outputPath` の逆。印が無ければ `output` */
export function outputRefOf(path: string): AnnotatedFile {
  const annotated = / \[([a-z]+)\]$/u.exec(path);
  const type = annotated?.[1] ?? 'output';
  const name = annotated === null ? path : path.slice(0, annotated.index);
  const cut = name.lastIndexOf('/');
  return cut < 0
    ? { filename: name, subfolder: '', type }
    : { filename: name.slice(cut + 1), subfolder: name.slice(0, cut), type };
}
