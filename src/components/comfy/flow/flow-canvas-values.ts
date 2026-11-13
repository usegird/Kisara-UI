import {
  FLOW_VIEWPORT_ANCHOR_KEY,
  VIEWPORT_ANCHOR_KEY,
} from '@/components/comfy/flow/anchor-context';
import type { FlowCanvasProps } from '@/components/comfy/flow/FlowCanvas';
import type { NodeCardState } from '@/components/comfy/flow/NodeCardContent';
import type { DisplayGraph } from '@/graph/subgraph-display';
import { openCardIdOf } from '@/graph/subgraph-level';
import type { NodeDefinitionMap, NodeId, WorkflowNode } from '@/graph/types';
import { buildVariableBoxes, type VariableBox } from '@/graph/variables';
import type { AnchorRegistry } from '@/hooks/ui/use-anchor-registry';
import type { ColumnWidths } from '@/store/settings-fields/column-widths';
import type { ExecutionState } from '@/store/use-execution-store';
import type { SettingsState } from '@/store/use-settings-store';

// ─────────────────────────────
// ワークフロー画面の組み立てが使う値（幅・実行の状態・変数の箱・出し分けの既定）を求める純関数
// ─────────────────────────────

/** 本体の列の幅（右の列の幅は持たない） */
export type FlowColumnWidths = Omit<ColumnWidths, 'queue' | 'chatSide'>;

/** 横に送る枠の見えている範囲を台帳に載せる */
export function registerFlowViewport(
  anchors: AnchorRegistry,
  element: HTMLElement | null,
  { overlaid, narrow }: { readonly overlaid: boolean; readonly narrow: boolean },
): void {
  // 測るのは埋め込みを出しているときだけ。横に送るたびに測った位置が変わり、描き直しになる
  anchors.register(FLOW_VIEWPORT_ANCHOR_KEY)(overlaid ? element : null);
  // 狭い画面ではカードの列が送れないので、カードの線の見える範囲は面の見えている範囲。
  // 横に並べるときはカードの列が自分で登録する
  if (narrow) anchors.register(VIEWPORT_ANCHOR_KEY)(element);
}

/** 設定から本体の列の幅だけを選ぶ */
export function flowColumnWidthsOf({ columnWidths }: SettingsState): FlowColumnWidths {
  return {
    app: columnWidths.app,
    appGap: columnWidths.appGap,
    cards: columnWidths.cards,
    variablesGap: columnWidths.variablesGap,
    variables: columnWidths.variables,
  };
}

/** 列の脇のアイコンの幅（倍率 100% のとき。押す所 24px） */
const SIDE_ICON_WIDTH = 24;

/**
 * アプリ入力の列と脇のアイコンの間。アイコンと埋め込みの嵌め先の間も同じ
 */
export const APP_ICON_GAP = 5;

/** アプリ入力の列が見た目で左へずれている幅 */
const APP_COLUMN_SHIFT = 9;

/**
 * 埋め込みのダイアログの嵌め先の左端（アプリ入力の列の幅から）。列は見た目で 9px 左にあり、
 * 差し込みのアイコンは列の右端から 5px 離れ、列の倍率に合わせて大きさが変わる。
 * **アイコンの右から 5px**（列とアイコンの間と同じ）空ける
 */
export function embedOffset(appZoom: number): number {
  return -APP_COLUMN_SHIFT + APP_ICON_GAP + SIDE_ICON_WIDTH * appZoom + APP_ICON_GAP;
}

/** 変数の箱の鍵 */
export function boxKey(box: VariableBox): string {
  return box.key;
}

/**
 * 実行中・失敗のノードをカードの状態に写す。id は平坦化後のもの（subgraph 内なら `12:34`）なので
 * 先頭の区間でカードに戻す。開いている subgraph の中なら中のカードに出す
 */
export function cardStatesOf(
  nodeStates: ExecutionState['nodeStates'],
  errorNode: string | null,
  open: ReadonlySet<NodeId>,
): Map<NodeId, NodeCardState> {
  const map = new Map<NodeId, NodeCardState>();

  for (const [promptNodeId, state] of Object.entries(nodeStates)) {
    const id = openCardIdOf(promptNodeId, open);
    if (id === null) continue;
    if (state === 'running') map.set(id, 'running');
    else if (state === 'error') map.set(id, 'error');
  }
  const failed = errorNode === null ? null : openCardIdOf(errorNode, open);
  if (failed !== null) map.set(failed, 'error');

  return map;
}

/** 開いている subgraph が無いとき（毎回同じものを使う） */
const NO_OPEN: ReadonlySet<NodeId> = new Set();

/** 開いている subgraph の id。開いていなければ毎回同じ空の集まり */
export function openFramesOf(display: DisplayGraph | null): ReadonlySet<NodeId> {
  return display && display.frames.size > 0 ? new Set(display.frames.keys()) : NO_OPEN;
}

/** 表示用のワークフローの変数ボックス。開いていなければ空 */
export function variableBoxesOf(
  shown: DisplayGraph['workflow'] | null,
  definitions: NodeDefinitionMap,
): VariableBox[] {
  return shown ? buildVariableBoxes(shown, definitions) : [];
}

/** 設定を開いているノード。開いていなければ null */
export function settingsNodeOf(
  shown: DisplayGraph['workflow'] | null,
  id: NodeId | null,
): WorkflowNode | null {
  return shown?.nodes.find((node) => node.id === id) ?? null;
}

/** 出し分けを既定で埋めたもの */
type FlowOptions = Required<FlowCanvasProps>;

/** 渡されなかった出し分けを本体の既定（デモで外すものは出す）で埋める */
export function flowOptionsOf(props: FlowCanvasProps): FlowOptions {
  return {
    insertBar: props.insertBar ?? true,
    nodeSettings: props.nodeSettings ?? true,
    cardTools: props.cardTools ?? true,
    appImport: props.appImport ?? true,
    appScrollbarLeft: props.appScrollbarLeft ?? true,
    commentBelow: props.commentBelow ?? false,
    chipOutputs: props.chipOutputs ?? false,
    offscreenLines: props.offscreenLines ?? true,
    appRemove: props.appRemove ?? true,
    clickScroll: props.clickScroll ?? true,
    dragPan: props.dragPan ?? true,
    roomy: props.roomy ?? false,
  };
}
