import { appInputNames } from '@/graph/app-inputs';
import { isImageUpload } from '@/graph/image-options';
import type { linkIndex } from '@/graph/link-read';
import { multilineHeight } from '@/graph/multiline-height';
import { numberSpec } from '@/graph/number-spec';
import type { OutputValueResolver } from '@/graph/output-values';
import type { NodeOutputView, NodeRow, NodeRowKind, RowSource } from '@/graph/rows';
import { SEED_CONTROLS } from '@/graph/seed-control';
import {
  NODE_MODE,
  nodeInputs,
  nodeMode,
  nodeOutputs,
  slotTypeName,
  type NodeDefinition,
  type NodeDefinitionMap,
  type NodeId,
  type SubgraphDefinition,
  type Workflow,
  type WorkflowNode,
} from '@/graph/types';
import { resolveWidgetValues, widgetValueEntries } from '@/graph/widgets';
import { t } from '@/i18n';

// ─────────────────────────────
// カードの行を組み立てる。定義のあるノード・subgraph のインスタンス・定義の無いノードの 3 通り。
// ─────────────────────────────

/** ComfyUI のフロントエンドが seed 系に付ける制御 widget。選択肢は seed-control.ts が正本 */
export const CONTROL_AFTER_GENERATE = 'control_after_generate';

/** 行を組み立てるときに見るもの */
export interface RowContext {
  readonly workflow: Workflow;
  readonly definitions: NodeDefinitionMap;
  readonly subgraphs: ReadonlyMap<string, SubgraphDefinition>;
  readonly links: ReturnType<typeof linkIndex>;
  /** 出力スロットに流れる値の目安（上流から引き継ぐ） */
  readonly outputValue: OutputValueResolver;
  /** ノード id → カードの通し番号 */
  readonly numbers: ReadonlyMap<NodeId, string>;
}

/** 位置の対応を解いた widget の値 */
type WidgetValues = ReturnType<typeof resolveWidgetValues>;

/** 定義のあるノードの行を組み立てる間の持ち物 */
interface NodeRowsState {
  readonly context: RowContext;
  readonly node: WorkflowNode;
  readonly widgets: WidgetValues;
  readonly appInputs: ReadonlySet<string>;
  readonly textHeight: number | null;
  /** control_after_generate の widget が付く入力（宣言 + 名前ルール） */
  readonly controlInputs: ReadonlySet<string>;
}

/** 定義のあるノードの行。定義の入力の順に、seed の制御 widget と定義に無い入力を足す */
export function rowsForNode(
  context: RowContext,
  node: WorkflowNode,
  definition: NodeDefinition,
): NodeRow[] {
  const widgets = resolveWidgetValues(node, definition);
  const state: NodeRowsState = {
    context,
    node,
    widgets,
    appInputs: appInputNames(context.workflow, node.id),
    textHeight: multilineHeight(node, definition),
    controlInputs: new Set(
      (widgets.ok ? widgets.slots : []).flatMap((slot) =>
        slot.kind === 'control_after_generate' ? [slot.input] : [],
      ),
    ),
  };

  const rows: NodeRow[] = definition.inputs.flatMap((input) => inputRows(state, input));
  rows.push(...undeclaredRows(context, node, definition));
  return rows;
}

/** 定義の入力 1 つの行（seed なら直下に制御 widget の行も） */
function inputRows(state: NodeRowsState, input: NodeDefinition['inputs'][number]): NodeRow[] {
  const { node, widgets, appInputs } = state;
  const inputSlot = nodeInputs(node).findIndex((candidate) => candidate.name === input.name);
  const slot = inputSlot >= 0 ? nodeInputs(node)[inputSlot] : undefined;
  const source = sourceOf(state.context, slot?.link);
  const kind = rowKindOf(source, input.isWidget, widgets.ok);
  const isWidget = kind === 'widget';
  const edit = widgetEditOf(state, input, isWidget);

  const row: NodeRow = {
    name: input.name,
    label: slot?.label ?? input.name,
    type: input.type,
    kind,
    required: input.required,
    value: widgets.ok ? widgets.byInput.get(input.name) : undefined,
    source,
    options: input.options,
    target: edit.target,
    widgetName: input.name,
    appInput: appInputs.has(input.name),
    inputSlot: isWidget || inputSlot < 0 ? null : inputSlot,
    // パラメータ行は `inputs[]` に項目が無くても、足してから繋げる
    linkable: isWidget || inputSlot >= 0,
    multiline: input.config.multiline === true,
    number: edit.number,
    height: edit.height,
    imageUpload: edit.imageUpload,
  };

  // seed の直下に付く制御 widget（ComfyUI 本家と同じ並び）。
  // 入力ではないので `/object_info` の入力一覧には出ず、ここで足す。
  // **接続済みの seed には出さない**（値は上流から来るので制御しても効かない）
  if (!state.controlInputs.has(input.name) || kind === 'link') return [row];
  return [row, controlRow(state, input.name)];
}

/** widget の行だけが持つ編集の情報（ほかの行は無し） */
function widgetEditOf(
  state: NodeRowsState,
  input: NodeDefinition['inputs'][number],
  isWidget: boolean,
): Pick<NodeRow, 'target' | 'number' | 'height' | 'imageUpload'> {
  if (!isWidget) return { target: null, number: null, height: null, imageUpload: false };
  const { node } = state;
  return {
    // 書き込み先はそのまま持つ（左の列から編集する）。カード側で読み取り専用にする
    target: { kind: 'node', nodeId: node.id, classType: node.type },
    number: numberSpec(input.type, input.config),
    height: input.config.multiline === true ? state.textHeight : null,
    imageUpload: isImageUpload(input.config),
  };
}

function rowKindOf(source: RowSource | null, isWidget: boolean, resolved: boolean): NodeRowKind {
  if (source) return 'link';
  if (!isWidget) return 'socket';
  if (!resolved) return 'unresolved';
  return 'widget';
}

/** seed の入力の直下に付く制御 widget の行 */
function controlRow({ node, widgets, appInputs }: NodeRowsState, inputName: string): NodeRow {
  return {
    name: `${inputName}.${CONTROL_AFTER_GENERATE}`,
    label: CONTROL_AFTER_GENERATE,
    type: 'COMBO',
    kind: 'widget',
    required: false,
    value: widgets.ok ? widgets.byWidget.get(CONTROL_AFTER_GENERATE) : undefined,
    source: null,
    options: SEED_CONTROLS,
    target: { kind: 'node', nodeId: node.id, classType: node.type },
    widgetName: CONTROL_AFTER_GENERATE,
    appInput: appInputs.has(CONTROL_AFTER_GENERATE),
    inputSlot: null,
    linkable: false,
    multiline: false,
    number: null,
    height: null,
    imageUpload: false,
  };
}

/**
 * `/object_info` に載らない入力がある。フロントエンドが動的に足すもので、
 * 定義だけで組み立てると接続が丸ごと消えるので拾う。
 */
function undeclaredRows(
  context: RowContext,
  node: WorkflowNode,
  definition: NodeDefinition,
): NodeRow[] {
  const declared = new Set(definition.inputs.map((input) => input.name));
  return nodeInputs(node).flatMap((slot, inputSlot): NodeRow[] => {
    if (declared.has(slot.name)) return [];
    const source = sourceOf(context, slot.link);
    return [
      {
        name: slot.name,
        label: slot.label ?? slot.name,
        type: slotTypeName(slot.type),
        kind: source ? 'link' : 'socket',
        required: false,
        value: undefined,
        source,
        options: null,
        target: null,
        widgetName: slot.name,
        appInput: false,
        inputSlot,
        linkable: true,
        multiline: false,
        number: null,
        height: null,
        imageUpload: false,
      },
    ];
  });
}

/**
 * ノード定義が無い場合（未接続・未導入のカスタムノード）でも、
 * Workflow JSON 自身が持つ情報だけで行を組み立てる。
 *   ・`inputs[]` は名前と型と接続状態を持っている
 *   ・`widgets_values` は値だけで名前を持たないため、位置で示して読み取り専用にする
 */
export function rowsForUnknown(context: RowContext, node: WorkflowNode): NodeRow[] {
  const rows: NodeRow[] = nodeInputs(node).map((slot, inputSlot) => {
    const source = sourceOf(context, slot.link);
    return {
      name: slot.name,
      label: slot.label ?? slot.name,
      type: slotTypeName(slot.type),
      kind: unknownRowKind(source, slot.widget),
      required: false,
      value: undefined,
      source,
      options: null,
      target: null,
      widgetName: slot.name,
      appInput: false,
      inputSlot,
      linkable: true,
      multiline: false,
      number: null,
      height: null,
      imageUpload: false,
    };
  });

  // 名前をキーにしたオブジェクトで持つノードは、キーを名前にして出す
  widgetValueEntries(node).forEach(({ name, value }, index) => {
    rows.push({
      name: `#${index}`,
      label: name ?? t('graph.rows.valueFallback', { index: String(index + 1) }),
      type: '*',
      kind: 'unresolved',
      required: false,
      value,
      source: null,
      options: null,
      target: null,
      widgetName: `#${index}`,
      appInput: false,
      inputSlot: null,
      linkable: false,
      multiline: typeof value === 'string' && value.includes('\n'),
      number: null,
      height: null,
      imageUpload: false,
    });
  });

  return rows;
}

function unknownRowKind(source: RowSource | null, widget: unknown): NodeRowKind {
  if (source) return 'link';
  return widget ? 'unresolved' : 'socket';
}

/** 接続済み入力のチップに出す「生成元ノード名 / 出力名」 */
export function sourceOf(context: RowContext, linkId: number | null | undefined): RowSource | null {
  if (linkId === null || linkId === undefined) return null;

  const link = context.links.get(linkId);
  if (!link) return null;

  const origin = context.workflow.nodes.find((node) => node.id === link.originId);
  const originName = origin
    ? (context.subgraphs.get(origin.type)?.name ??
      context.definitions.get(origin.type)?.displayName ??
      origin.type)
    : `#${link.originId}`;
  const outputName = nodeOutputs(origin)[link.originSlot]?.name ?? link.type;

  return {
    linkId: link.id,
    nodeId: link.originId,
    slot: link.originSlot,
    type: link.type,
    label: `${originName} / ${outputName}`,
    values: context.outputValue(link.originId, link.originSlot),
    muted: origin !== undefined && nodeMode(origin) === NODE_MODE.mute,
    sourceIndex: context.numbers.get(link.originId) ?? null,
  };
}

/** カードの出力。ノードの `outputs[]` が無ければ定義から */
export function outputsOf(
  context: RowContext,
  node: WorkflowNode,
  definition: NodeDefinition | undefined,
): NodeOutputView[] {
  const shape =
    nodeOutputs(node).length > 0
      ? nodeOutputs(node).map((output) => ({ name: output.name, type: slotTypeName(output.type) }))
      : (definition?.outputs ?? []).map((output) => ({ name: output.name, type: output.type }));

  return shape.map((output, slot) => ({ ...output, values: context.outputValue(node.id, slot) }));
}
