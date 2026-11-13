import { appInputNames } from '@/graph/app-inputs';
import { isImageUpload } from '@/graph/image-options';
import { CONTROL_AFTER_GENERATE, sourceOf, type RowContext } from '@/graph/node-rows';
import { numberSpec } from '@/graph/number-spec';
import type { NodeRow, NodeRowKind, RowSource, RowTarget } from '@/graph/rows';
import { SEED_CONTROLS } from '@/graph/seed-control';
import { proxyWidgets } from '@/graph/subgraph';
import {
  nodeInputs,
  slotTypeName,
  type NodeId,
  type SubgraphDefinition,
  type WorkflowNode,
} from '@/graph/types';
import { resolveWidgetValues } from '@/graph/widgets';

// ─────────────────────────────
// subgraph のインスタンスのカードの行。インスタンスの入力と、昇格した widget（値は中のノード）。
// ─────────────────────────────

/** subgraph のインスタンスの行を組み立てる間の持ち物 */
interface SubgraphRowsState {
  readonly context: RowContext;
  readonly node: WorkflowNode;
  readonly definition: SubgraphDefinition;
  readonly appInputs: ReadonlySet<string>;
  /** 内部ノードは id で何度も引くので、先に表にする（行ごとに配列を走査しない） */
  readonly innerNodes: ReadonlyMap<NodeId, WorkflowNode>;
}

/** 昇格 widget の型と選択肢（内部ノードの定義から引く） */
interface InnerInputSpec {
  readonly type: string;
  readonly options: readonly unknown[] | null;
  readonly multiline: boolean;
  readonly config: Record<string, unknown>;
}

/**
 * subgraph インスタンスは展開せず1枚のカードとして扱う。
 * 行は「インスタンスの入力」＋「昇格 widget（proxyWidgets）」の2系統で、
 * 昇格 widget の値の実体は内部ノード側にある。
 */
export function rowsForSubgraph(
  context: RowContext,
  node: WorkflowNode,
  definition: SubgraphDefinition,
): NodeRow[] {
  const state: SubgraphRowsState = {
    context,
    node,
    definition,
    appInputs: appInputNames(context.workflow, node.id),
    innerNodes: new Map(definition.nodes.map((inner) => [inner.id, inner])),
  };
  const covered = new Set<string>();

  const proxies = proxyWidgets(node);
  // 昇格 widget も名前で引く。同じ名前が複数あれば先頭を採る（`find` と同じ）
  const proxyByWidget = new Map<string, (typeof proxies)[number]>();
  for (const proxy of proxies) {
    if (!proxyByWidget.has(proxy.widget)) proxyByWidget.set(proxy.widget, proxy);
  }

  const rows: NodeRow[] = [];
  for (const slot of nodeInputs(node)) {
    covered.add(slot.name);
    rows.push(instanceInputRow(state, slot, proxyByWidget.get(slot.name)));
  }
  for (const proxy of proxies) {
    if (covered.has(proxy.widget)) continue;
    covered.add(proxy.widget);
    rows.push(proxyRow(state, proxy));
  }
  return rows;
}

/** 昇格した widget 1 つ（中のノードとその widget 名） */
type Proxy = ReturnType<typeof proxyWidgets>[number];

/** インスタンスの入力 1 つの行。昇格した widget なら値と書き込み先は中のノード */
function instanceInputRow(
  state: SubgraphRowsState,
  slot: ReturnType<typeof nodeInputs>[number],
  proxy: Proxy | undefined,
): NodeRow {
  const { context, node } = state;
  const source = sourceOf(context, slot.link);
  const spec = proxy ? innerInput(state, proxy.nodeId, proxy.widget) : null;
  const editable = !source && proxy !== undefined;
  const widgetName = proxy?.widget ?? slot.name;
  const editSpec = source ? null : spec;
  return {
    name: slot.name,
    label: slot.label ?? slot.name,
    type: spec?.type ?? slotTypeName(slot.type),
    kind: instanceRowKind(source, slot.widget),
    required: false,
    value: editable ? innerValue(state, proxy.nodeId, proxy.widget) : undefined,
    source,
    options: spec?.options ?? null,
    target: editable ? innerTarget(state, proxy) : null,
    widgetName,
    appInput: state.appInputs.has(widgetName),
    inputSlot: nodeInputs(node).findIndex((candidate) => candidate.name === slot.name),
    linkable: nodeInputs(node).some((candidate) => candidate.name === slot.name),
    multiline: false,
    number: editSpec ? numberSpec(editSpec.type, editSpec.config) : null,
    height: null,
    imageUpload: editSpec !== null && isImageUpload(editSpec.config),
  };
}

function instanceRowKind(source: RowSource | null, widget: unknown): NodeRowKind {
  if (source) return 'link';
  return widget ? 'widget' : 'socket';
}

/** インスタンスの入力に無い昇格 widget の行 */
function proxyRow(state: SubgraphRowsState, proxy: Proxy): NodeRow {
  const io = (state.definition.inputs ?? []).find((candidate) => candidate.name === proxy.widget);
  const spec = innerInput(state, proxy.nodeId, proxy.widget);
  return {
    name: proxy.widget,
    label: io?.label ?? proxy.widget,
    type: spec?.type ?? slotTypeName(io?.type),
    kind: 'widget',
    required: false,
    value: innerValue(state, proxy.nodeId, proxy.widget),
    source: null,
    options: spec?.options ?? null,
    target: innerTarget(state, proxy),
    widgetName: proxy.widget,
    appInput: state.appInputs.has(proxy.widget),
    inputSlot: null,
    linkable: false,
    multiline: spec?.multiline === true,
    number: spec ? numberSpec(spec.type, spec.config) : null,
    height: null,
    imageUpload: spec !== null && isImageUpload(spec.config),
  };
}

/** 昇格 widget の書き込み先（中のノード）。中のノードが無ければ null */
function innerTarget(state: SubgraphRowsState, proxy: Proxy): RowTarget | null {
  const inner = state.innerNodes.get(proxy.nodeId);
  if (!inner) return null;
  return {
    kind: 'subgraph',
    subgraphId: state.definition.id,
    innerNodeId: proxy.nodeId,
    innerClassType: inner.type,
  };
}

/**
 * 昇格 widget の型と選択肢は subgraph 定義側に無いので、**内部ノードの定義**から引く。
 * ここを取り違えると数値が文字列で書き込まれる。
 */
function innerInput(
  state: SubgraphRowsState,
  innerNodeId: NodeId,
  widget: string,
): InnerInputSpec | null {
  const inner = state.innerNodes.get(innerNodeId);
  const innerDefinition = inner ? state.context.definitions.get(inner.type) : undefined;
  const input = innerDefinition?.inputs.find((candidate) => candidate.name === widget);

  // control_after_generate は入力ではなくフロントエンド側の widget
  if (!input && widget === CONTROL_AFTER_GENERATE) {
    return { type: 'COMBO', options: SEED_CONTROLS, multiline: false, config: {} };
  }
  if (!input) return null;
  return {
    type: input.type,
    options: input.options,
    multiline: input.config.multiline === true,
    config: input.config,
  };
}

function innerValue(state: SubgraphRowsState, innerNodeId: NodeId, widget: string): unknown {
  const inner = state.innerNodes.get(innerNodeId);
  const innerDefinition = inner ? state.context.definitions.get(inner.type) : undefined;
  if (!inner || !innerDefinition) return undefined;

  const values = resolveWidgetValues(inner, innerDefinition);
  // 昇格 widget は widget 名で参照される（control_after_generate を含む）
  return values.ok ? values.byWidget.get(widget) : undefined;
}
