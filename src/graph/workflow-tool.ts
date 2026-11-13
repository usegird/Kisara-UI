import { isAppInput } from '@/graph/app-inputs';
import { isImageUpload } from '@/graph/image-options';
import { numberSpec } from '@/graph/number-spec';
import { ownDataOf, writeOwnData } from '@/graph/own-data';
import { unlinkedNodeIds } from '@/graph/rows';
import { cardIdOfPromptNode } from '@/graph/to-api-prompt';
import {
  NODE_MODE,
  nodeMode,
  type InputDefinition,
  type NodeDefinitionMap,
  type NodeId,
  type Workflow,
} from '@/graph/types';
import { resolveWidgetValues } from '@/graph/widgets';
import { isRecord, isUnknownArray, stringOr } from '@/lib/guards';
import { ownOr, setOwn } from '@/lib/own-key';

// ─────────────────────────────
// ワークフローのツール。`extra.kisara.tool` の読み書きと、送る引数の形・確かめた値の重ね方。
// ノード名で分けず、入力の型だけで決める。
// ─────────────────────────────

const TOOL = 'tool';

/** ワークフロー名と引数名の字の決まり（Chat Completions の関数名と同じ） */
const TOOL_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** ワークフロー名・引数名として LLM に渡せる字か */
export function isToolName(name: string): boolean {
  return TOOL_NAME_PATTERN.test(name);
}

/**
 * LLM の値の入れ方。`overwrite` は App 欄の値（無ければノードの値）を置き換え、`prepend` はその前に、
 * `append` はその後ろに足す。足せるのは文字の引数だけ（ほかの型はいつも置き換える）
 */
export type ArgumentMode = 'overwrite' | 'prepend' | 'append';

const ADDING_MODES: readonly ArgumentMode[] = ['prepend', 'append'];

function modeOf(raw: unknown): ArgumentMode {
  return ADDING_MODES.find((mode) => mode === raw) ?? 'overwrite';
}

/** 引数にする 1 つの App 欄。`nodeId` は `extra.kisara.values` と同じ指し方 */
interface WorkflowToolParam {
  readonly nodeId: string;
  readonly input: string;
  readonly name: string;
  readonly description: string;
  readonly mode: ArgumentMode;
}

/** ワークフローのツールの定義（`extra.kisara.tool`） */
export interface WorkflowTool {
  readonly name: string;
  readonly description: string;
  readonly params: readonly WorkflowToolParam[];
  /**
   * 結果として渡す画像を出す出力ノードの id（`extra.kisara.values` と同じ指し方）。
   * 空なら、すべての出力ノードの画像を渡す
   */
  readonly outputs: readonly string[];
}

function readParams(raw: unknown): WorkflowToolParam[] {
  if (!isRecord(raw)) return [];
  const params: WorkflowToolParam[] = [];
  for (const [nodeId, fields] of Object.entries(raw)) {
    if (!isRecord(fields)) continue;
    for (const [input, spec] of Object.entries(fields)) {
      if (!isRecord(spec)) continue;
      const name = stringOr(spec.name).trim();
      if (name.length === 0) continue;
      params.push({
        nodeId,
        input,
        name,
        description: stringOr(spec.description),
        mode: modeOf(spec.mode),
      });
    }
  }
  return params;
}

/**
 * `extra.kisara.tool`。無い・読めない形なら null
 */
export function readWorkflowTool(workflow: unknown): WorkflowTool | null {
  const raw = ownDataOf(workflow)?.[TOOL];
  if (!isRecord(raw)) return null;
  return {
    name: stringOr(raw.name).trim(),
    description: stringOr(raw.description),
    params: readParams(raw.params),
    outputs: isUnknownArray(raw.outputs)
      ? raw.outputs.filter((item): item is string => typeof item === 'string')
      : [],
  };
}

/** 定義を書く。null なら消す */
export function withWorkflowTool(workflow: Workflow, tool: WorkflowTool | null): Workflow {
  if (tool === null) return writeOwnData(workflow, TOOL, undefined);
  const params: Record<string, Record<string, Record<string, string>>> = {};
  for (const param of tool.params) {
    const fields = ownOr(params, param.nodeId, () => ({}));
    // 置き換えは既定なので書かない
    setOwn(fields, param.input, {
      name: param.name,
      description: param.description,
      // 上書きは既定なので書かない
      ...(param.mode === 'overwrite' ? {} : { mode: param.mode }),
    });
  }
  return writeOwnData(workflow, TOOL, {
    name: tool.name,
    description: tool.description,
    params,
    // 空（すべての出力ノード）は既定なので書かない
    ...(tool.outputs.length > 0 ? { outputs: tool.outputs } : {}),
  });
}

// ─────────────────────────────
// 引数の形
// ─────────────────────────────

/** 引数 1 つの JSON Schema */
type ArgumentSchema = Readonly<Record<string, unknown>>;

/**
 * 画像の引数で、その会話がリンクしたプリセットの画像を指す参照名。ほかの参照名
 * （受け取った画像）は会話ごとに `withImageChoices` で足す
 */
export const AVATAR_REFERENCE = 'avatar';

/** 画像を読み込む選択肢の欄か（付帯設定の `image_upload`。ノード名で分けない） */
function isImageInput(input: InputDefinition): boolean {
  return input.type === 'COMBO' && isImageUpload(input.config);
}

/**
 * 入力の型から引数の形を作る。引数にできない型なら null。画像を読み込む選択肢は、ファイル名の
 * 代わりに参照名を選ばせる
 */
export function argumentSchema(input: InputDefinition): ArgumentSchema | null {
  if (input.type === 'STRING') return { type: 'string' };
  if (input.type === 'BOOLEAN') return { type: 'boolean' };
  if (isImageInput(input)) return { type: 'string', enum: [AVATAR_REFERENCE] };
  if (input.type === 'COMBO') {
    const choices = (input.options ?? []).filter((item) => typeof item === 'string');
    return choices.length > 0 ? { type: 'string', enum: choices } : null;
  }
  const spec = numberSpec(input.type, input.config);
  if (spec === null) return null;
  return {
    type: spec.integer ? 'integer' : 'number',
    ...(spec.min === null ? {} : { minimum: spec.min }),
    ...(spec.max === null ? {} : { maximum: spec.max }),
  };
}

/** そのノードの入力の定義。カードが無い・定義が無いなら null */
export function inputDefinitionOf(
  workflow: Workflow,
  definitions: NodeDefinitionMap,
  nodeId: string,
  input: string,
): InputDefinition | null {
  const cardId = cardIdOfPromptNode(nodeId);
  // subgraph の中（`59:70`）はアプリ入力にならない
  if (cardId === null || String(cardId) !== nodeId) return null;
  const node = workflow.nodes.find((item) => item.id === cardId);
  const definition = node === undefined ? undefined : definitions.get(node.type);
  return definition?.inputs.find((item) => item.name === input) ?? null;
}

/**
 * 引数にしてよいノード。無効（ミュート・バイパス）でなく、線がつながっている。
 * 設定した後でこの状態になったノードも、定義は残したまま送らない
 */
export function activeNodeIds(workflow: Workflow): ReadonlySet<NodeId> {
  const unlinked = unlinkedNodeIds(workflow);
  return new Set(
    workflow.nodes
      .filter((node) => nodeMode(node) === NODE_MODE.normal && !unlinked.has(node.id))
      .map((node) => node.id),
  );
}

/**
 * LLM の引数にしている App 欄（`nodeId/input` → 引数名）。無効か線の無いノードの欄は送らないので
 * 入れない。アプリ入力の列で印を付けるのに使う
 */
export function argumentInputNames(workflow: Workflow | null): string[] {
  const tool = workflow === null ? null : readWorkflowTool(workflow);
  if (workflow === null || tool === null) return [];
  const active = activeNodeIds(workflow);
  return tool.params
    .filter((param) => {
      const cardId = cardIdOfPromptNode(param.nodeId);
      return cardId !== null && active.has(cardId);
    })
    .map((param) => `${param.nodeId}/${param.input}=${param.name}`);
}

/** 結果の画像を出せる 1 つのノード（設定のダイアログで選ぶ） */
export interface OutputNode {
  readonly nodeId: string;
}

/**
 * 結果の画像を出せるノード。定義が出力ノード（`/object_info` の `output_node`）で、無効でも孤立しても
 * いないもの。ノード名で分けない。subgraph の中のノードは出さない
 */
export function outputNodes(workflow: Workflow, definitions: NodeDefinitionMap): OutputNode[] {
  const active = activeNodeIds(workflow);
  return workflow.nodes
    .filter((node) => active.has(node.id) && definitions.get(node.type)?.outputNode === true)
    .map((node) => ({ nodeId: String(node.id) }));
}

/**
 * そのノードが出した画像を結果として渡すか。`node` は実行の通知のノード（subgraph の中は
 * `59:70` の形で、外のノードの id で引く）。選んでいなければすべて渡す
 */
export function passesOutput(outputs: readonly string[], node: string): boolean {
  if (outputs.length === 0) return true;
  const cardId = cardIdOfPromptNode(node);
  return cardId !== null && outputs.includes(String(cardId));
}

/** 送る 1 つの引数 */
export interface ToolArgument {
  readonly nodeId: string;
  readonly input: string;
  readonly name: string;
  readonly description: string;
  readonly mode: ArgumentMode;
  readonly schema: ArgumentSchema;
  /**
   * 画像の引数（値は参照名。実行の前に置いた画像の値へ差し替える）
   */
  readonly image?: true;
}

/** 足して入れられる型か（文字の引数だけ。選択肢は置き換える） */
export function canMerge(schema: ArgumentSchema): boolean {
  return schema.type === 'string' && !Array.isArray(schema.enum);
}

/**
 * 送る引数。今もアプリ入力で、ノードが無効でも孤立してもおらず、型が引数にできて、
 * 名前が字の決まりに合うものだけ。同じ引数名が続いたら、後のものを落とす
 */
export function toolArguments(
  workflow: Workflow,
  definitions: NodeDefinitionMap,
  tool: WorkflowTool,
): ToolArgument[] {
  const seen = new Set<string>();
  const active = activeNodeIds(workflow);
  const result: ToolArgument[] = [];
  for (const param of tool.params) {
    if (!isToolName(param.name) || seen.has(param.name)) continue;
    const cardId = cardIdOfPromptNode(param.nodeId);
    if (cardId === null || !active.has(cardId)) continue;
    if (!isAppInput(workflow, cardId, param.input)) continue;
    const input = inputDefinitionOf(workflow, definitions, param.nodeId, param.input);
    const schema = input === null ? null : argumentSchema(input);
    if (schema === null) continue;
    seen.add(param.name);
    result.push({
      ...param,
      mode: canMerge(schema) ? param.mode : 'overwrite',
      schema,
      ...(input !== null && isImageInput(input) ? { image: true as const } : {}),
    });
  }
  return result;
}

/**
 * 画像の引数の選択肢を、その会話で選べる参照名にする（アバターと受け取った画像）
 */
export function withImageChoices(
  args: readonly ToolArgument[],
  references: readonly string[],
): ToolArgument[] {
  return args.map((arg) =>
    arg.image === true ? { ...arg, schema: { ...arg.schema, enum: [...references] } } : arg,
  );
}

// ─────────────────────────────
// 確かめた値の扱い。関数の定義と引数の確かめは会話の規則の側（`chat/request`・`chat/tool-calls`）
// ─────────────────────────────

/** 確かめた値。`extra.kisara.values` と同じ形（ノード id → 入力名 → 値） */
export type ArgumentValues = ReadonlyMap<string, Readonly<Record<string, unknown>>>;

/** 確かめた値のうち、画像の引数の参照名（実行の前に画像を置く） */
interface ImageArgument {
  readonly nodeId: string;
  readonly input: string;
  readonly reference: string;
}

/** 確かめた値から、画像の引数の参照名を拾う */
export function imageArguments(
  args: readonly ToolArgument[],
  values: ArgumentValues,
): ImageArgument[] {
  return args.flatMap((arg) => {
    const reference = values.get(arg.nodeId)?.[arg.input];
    return arg.image === true && typeof reference === 'string'
      ? [{ nodeId: arg.nodeId, input: arg.input, reference }]
      : [];
  });
}

/** 確かめた値の 1 つを差し替える（画像の参照名を、置いた画像の値にする） */
export function withArgumentValue(
  values: ArgumentValues,
  nodeId: string,
  input: string,
  value: unknown,
): ArgumentValues {
  const next = new Map(values);
  next.set(nodeId, { ...values.get(nodeId), [input]: value });
  return next;
}

/** 足すときの区切り。元の値の末尾の空白と区切りは落としてから足す */
const MERGE_SEPARATOR = ', ';

/** ノードの今の値（カードの値）。読めなければ undefined */
function nodeValueOf(
  workflow: Workflow,
  definitions: NodeDefinitionMap,
  nodeId: string,
  input: string,
): unknown {
  const node = workflow.nodes.find((item) => String(item.id) === nodeId);
  const definition = node === undefined ? undefined : definitions.get(node.type);
  if (node === undefined || definition === undefined) return undefined;
  const resolved = resolveWidgetValues(node, definition);
  return resolved.ok ? resolved.byInput.get(input) : undefined;
}

/** 元の値の足す側の端の空白と区切りを落とし、区切りを挟んで前か後ろに足す */
function addTo(current: string, value: string, mode: 'prepend' | 'append'): string {
  if (mode === 'prepend') {
    const rest = current.replace(/^[\s,]+/u, '');
    return rest.length > 0 ? `${value}${MERGE_SEPARATOR}${rest}` : value;
  }
  const head = current.replace(/[\s,]+$/u, '');
  return head.length > 0 ? `${head}${MERGE_SEPARATOR}${value}` : value;
}

/** 確かめた引数の定義と値 */
export interface CheckedArguments {
  readonly args: readonly ToolArgument[];
  readonly values: ArgumentValues;
}

/**
 * タブのアプリ入力の値に、確かめた引数を重ねる（タブの値は書き換えない）。足す引数は、App 欄の値
 * （未入力ならノードの値）の前か後ろに区切りを挟んで足す。元が空なら LLM の値だけにする。
 * LLM が空の文字を渡した引数は、上書きでも元の値のままにする
 */
export function overlayArgumentValues(
  workflow: Workflow,
  definitions: NodeDefinitionMap,
  base: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
  { args, values }: CheckedArguments,
): ReadonlyMap<string, Readonly<Record<string, unknown>>> {
  const merged = new Map(base);
  for (const arg of args) {
    const value = values.get(arg.nodeId)?.[arg.input];
    // 空の文字はどの入れ方でも入れない（App 欄の値、未入力ならノードの値のまま送る）
    if (value === undefined || (typeof value === 'string' && value.trim().length === 0)) continue;
    let next = value;
    if (arg.mode !== 'overwrite' && typeof value === 'string') {
      const own = base.get(arg.nodeId)?.[arg.input];
      const current = own ?? nodeValueOf(workflow, definitions, arg.nodeId, arg.input);
      next = addTo(typeof current === 'string' ? current : '', value, arg.mode);
    }
    merged.set(arg.nodeId, { ...merged.get(arg.nodeId), [arg.input]: next });
  }
  return merged;
}
