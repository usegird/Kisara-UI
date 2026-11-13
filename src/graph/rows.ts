import { fixedLayoutOf } from '@/graph/fixed-layout';
import { definitionOf } from '@/graph/frontend-nodes';
import { linkIndex } from '@/graph/link-read';
import { outputsOf, rowsForNode, rowsForUnknown, type RowContext } from '@/graph/node-rows';
import type { NumberSpec } from '@/graph/number-spec';
import { orderedNodeIds } from '@/graph/order';
import { createOutputValues } from '@/graph/output-values';
import { subgraphMap } from '@/graph/subgraph';
import { rowsForSubgraph } from '@/graph/subgraph-rows';
import {
  FRONTEND_ONLY_TYPES,
  nodeInputs,
  nodeMode,
  nodeOutputs,
  type LinkId,
  type NodeDefinitionMap,
  type NodeId,
  type Workflow,
  type WorkflowNode,
} from '@/graph/types';
import { resolveWidgetValues, summarizeValues, type ValuePart } from '@/graph/widgets';
import { t } from '@/i18n';
import { paintableColor } from '@/lib/color';
import { messageOf, reportFault } from '@/lib/fault';
import { isRecord } from '@/lib/guards';

// ─────────────────────────────
// カード1枚ぶんの表示データ（NodeView）を組み立てる純関数。コンポーネントは描画だけを担当し、
// 判断はここに閉じる（取得・計算と表示を分ける）。
// ─────────────────────────────

/**
 * 行の中身の種類。行の見た目は接続済み／未接続で共通で、中身だけチップ⇔widget に差し替える
 */
export type NodeRowKind =
  /** 未接続の widget（数値・テキスト・選択等） */
  | 'widget'
  /** 接続済み。変数チップを出す */
  | 'link'
  /** 未接続の入力ソケット（widget にならない型） */
  | 'socket'
  /** 位置対応を解決できないため読み取り専用 */
  | 'unresolved';

/** 接続済みの行の、つながっている先（生成元の出力） */
export interface RowSource {
  /** この接続の link id。解除（×）に使う */
  readonly linkId: LinkId;
  readonly nodeId: NodeId;
  readonly slot: number;
  readonly type: string;
  /** ホバー時に出す「生成元 / 出力名」 */
  readonly label: string;
  /** 生成元の出力に流れる値の目安（上流から引き継いだものを含む） */
  readonly values: readonly ValuePart[];
  /** 生成元がミュートされている＝この入力には何も来ない */
  readonly muted: boolean;
  /** 生成元カードの通し番号（注記など番号を持たない場合は null） */
  readonly sourceIndex: string | null;
}

/** 値の書き込み先。行がどこを編集するかをここに閉じる */
export type RowTarget =
  | { readonly kind: 'node'; readonly nodeId: NodeId; readonly classType: string }
  | {
      readonly kind: 'subgraph';
      readonly subgraphId: string;
      readonly innerNodeId: NodeId;
      readonly innerClassType: string;
    };

/** カードの行 1 つ（入力 1 つ、または制御の widget） */
export interface NodeRow {
  readonly name: string;
  readonly label: string;
  readonly type: string;
  readonly kind: NodeRowKind;
  readonly required: boolean;
  readonly value: unknown;
  readonly source: RowSource | null;
  /** COMBO の選択肢（未取得なら null） */
  readonly options: readonly unknown[] | null;
  /** 編集できない行は null */
  readonly target: RowTarget | null;
  /** 編集用の widget 名（`control_after_generate` のように入力名と異なることがある） */
  readonly widgetName: string;
  /** App Mode（アプリ入力）の対象。対象の間は編集させない */
  readonly appInput: boolean;
  /**
   * `inputs[]` の何番目か。**リンクを張れる行**だけが番号を持つ（widget 行は null）。
   * ドラッグ&ドロップで接続するときの接続先スロットに使う。
   */
  readonly inputSlot: number | null;
  /**
   * この行の手前にノードを足せるか（三角を出すか）。線を受けられる入力の行と、
   * 入力に変えられるパラメータ行（自分のノードの widget。制御の行と subgraph の昇格は除く）
   */
  readonly linkable: boolean;
  /**
   * 複数行のテキストとして編集する行。
   * `/object_info` の入力設定 `multiline: true` から引く。
   */
  readonly multiline: boolean;
  /**
   * 数値の刻み・下限・上限・丸め。数値の行でなければ null
   */
  readonly number: NumberSpec | null;
  /**
   * 複数行の入力欄の高さ（px）。ノードの `size` から換算する。
   * 換算できない（`size` が無い・複数行でない）ときは null＝既定の高さ
   */
  readonly height: number | null;
  /**
   * 画像を読み込む選択肢か。入力設定 `image_upload` から引く。ノード名では判定しない
   */
  readonly imageUpload: boolean;
}

/** カードの種類（定義のあるノード・subgraph のインスタンス・定義の無いノード） */
type NodeViewKind = 'node' | 'subgraph' | 'unknown';

/** カードの出力 1 つ */
export interface NodeOutputView {
  readonly name: string;
  readonly type: string;
  /** そのスロットに流れる値の目安（上流から引き継いだものを含む） */
  readonly values: readonly ValuePart[];
}

/** カード 1 枚ぶんの表示データ */
export interface NodeView {
  readonly id: NodeId;
  readonly kind: NodeViewKind;
  /**
   * 上から順の通し番号（1 始まり）。開いた subgraph の中はインスタンスの番号に中の順を添える（`3.1`）
   */
  readonly index: string | null;
  /**
   * 1行目。読み取り専用
   */
  readonly displayName: string;
  /** 2行目。ComfyUI 本家のノードタイトルと同じキー */
  readonly comment: string;
  readonly classType: string;
  readonly rows: readonly NodeRow[];
  readonly outputs: readonly NodeOutputView[];
  readonly mode: number;
  /** widget の位置対応を解決できないノード */
  readonly unresolved: boolean;
  /** このノードの設定値（変数ボックスと同じ内容） */
  readonly values: readonly ValuePart[];
  /**
   * 定義が引けないノードが、グラフ上で線につながっているか。
   * つながっていなければ実行に関与しない（フロントエンド専用ノードなど）。
   */
  readonly linked: boolean;
  /**
   * 折りたたみ（パラメータを隠す）。**ComfyUI 標準の `flags.collapsed`** を読む。
   * 独自キーは足さない。
   */
  readonly collapsed: boolean;
  /** 見出しの帯の色（標準キー `color`）。塗れない形や未設定は null */
  readonly color?: string | null | undefined;
  /** 本体の色（標準キー `bgcolor`）。塗れない形や未設定は null */
  readonly bgcolor?: string | null | undefined;
  /**
   * 読めない形のノード。組み立てに失敗した理由。
   * このときは行も出力も持たず、カードは理由だけを出す。ワークフローからは消さない
   */
  readonly broken?: string | undefined;
}

/**
 * グラフ上で何かにつながっているか。
 * `/object_info` に定義が無いノードのうち、**線が1本も無いもの**は
 * フロントエンド専用ノード（rgthree の Fast Groups Muter など）とみなせる。
 * 実行には関与しないので、警告ではなく注記として扱う。
 */
function hasLinks(node: WorkflowNode): boolean {
  const inputs = nodeInputs(node).some((input) => input.link !== null && input.link !== undefined);
  const outputs = nodeOutputs(node).some((output) => (output.links ?? []).length > 0);
  return inputs || outputs;
}

/** 標準キー `flags.collapsed`（LiteGraph の折りたたみ） */
function collapsedOf(node: WorkflowNode): boolean {
  const flags = node.flags;
  return isRecord(flags) && flags.collapsed === true;
}

function buildNodeView(context: RowContext, node: WorkflowNode): NodeView {
  const mode = nodeMode(node);
  const collapsed = collapsedOf(node);
  // 本体と同じ置き場の色。ワークフローから来た値なので、塗れる形のものだけ
  const color = paintableColor(node.color);
  const bgcolor = paintableColor(node.bgcolor);
  const comment = typeof node.title === 'string' ? node.title : '';
  const subgraph = context.subgraphs.get(node.type);

  if (subgraph) {
    return {
      id: node.id,
      kind: 'subgraph',
      values: summarizeValues(node, context.definitions.get(node.type)),
      linked: true,
      index: context.numbers.get(node.id) ?? null,
      displayName: subgraph.name,
      comment,
      classType: node.type,
      rows: rowsForSubgraph(context, node, subgraph),
      outputs: outputsOf(context, node, undefined),
      mode,
      collapsed,
      color,
      bgcolor,
      unresolved: false,
    };
  }

  const definition = definitionOf(context.definitions, node.type);
  if (!definition) {
    return {
      id: node.id,
      kind: 'unknown',
      values: summarizeValues(node, context.definitions.get(node.type)),
      linked: hasLinks(node),
      index: context.numbers.get(node.id) ?? null,
      displayName: node.type,
      comment,
      classType: node.type,
      rows: rowsForUnknown(context, node),
      outputs: outputsOf(context, node, undefined),
      mode,
      collapsed,
      color,
      bgcolor,
      unresolved: true,
    };
  }

  return {
    id: node.id,
    kind: 'node',
    values: summarizeValues(node, definition),
    linked: true,
    index: context.numbers.get(node.id) ?? null,
    displayName: definition.displayName,
    comment,
    classType: node.type,
    rows: rowsForNode(context, node, definition),
    outputs: outputsOf(context, node, definition),
    mode,
    collapsed,
    color,
    bgcolor,
    unresolved: !resolveWidgetValues(node, definition).ok,
  };
}

/** カードの組み立てで、実行に関与しないノードを出すかどうか */
export interface BuildNodeViewsOptions {
  /**
   * 操作系ノードを出すか。既定では出さない。
   * 定義が引けずリンクも1本も無いノード（rgthree の Fast Groups Muter など画面操作用のもの）
   */
  readonly showControlNodes?: boolean;
  /**
   * 繋がっていないノードを出すか。既定では出さない。
   * 定義のあるノード（メモを含む）のうちリンクが1本も無いもの
   */
  readonly showUnlinkedNodes?: boolean;
  /**
   * 隠してよいノード（開いたとき・切り替えたときに繋がっていなかったもの）。
   * 無ければ今繋がっていないものすべて。**編集で繋がらなくなったものは隠さない**
   */
  readonly hiddenCandidates?: ReadonlySet<NodeId> | undefined;
}

/** 今どこにも繋がっていないノード。隠す相手を決めるときに使う */
export function unlinkedNodeIds(workflow: Workflow): ReadonlySet<NodeId> {
  return new Set(workflow.nodes.filter((node) => !hasLinks(node)).map((node) => node.id));
}

/** 実行に関与しないノードの種類。どちらでもなければ null */
type HideableNodeKind = 'control' | 'unlinked';

/** 線が 1 本も無いノードを、中身の分かる繋がっていないノードか画面操作用のノードかに分ける */
function hideableKindOf(
  node: WorkflowNode,
  context: Pick<RowContext, 'definitions' | 'subgraphs'>,
): HideableNodeKind | null {
  if (hasLinks(node)) return null;

  // 中身の分かるノード（定義があるもの・メモ・サブグラフ）は繋がっていないノード
  const known =
    context.subgraphs.has(node.type) || definitionOf(context.definitions, node.type) !== undefined;
  // 定義が無いものは画面操作用とみなす（rgthree の Fast Groups Muter など）
  return known ? 'unlinked' : 'control';
}

/**
 * カードにするノード。表示は横位置の順（読み込み時に処理の順で並べてある）
 */
function cardNodes(workflow: Workflow, byId: ReadonlyMap<NodeId, WorkflowNode>): WorkflowNode[] {
  return orderedNodeIds(workflow)
    .map((id) => byId.get(id))
    .filter((node): node is WorkflowNode => node !== undefined)
    .filter((node) => node.type !== FRONTEND_ONLY_TYPES.reroute);
}

/**
 * 上から順に採番する（メモにも振る）。
 * **隠すノードにも番号を振る**＝出し入れしても番号が変わらない。
 * 表示用のワークフロー（開いた subgraph）は作ったときに振った番号を使う（`fixed-layout`）
 */
function cardNumbers(
  workflow: Workflow,
  nodes: readonly WorkflowNode[],
): ReadonlyMap<NodeId, string> {
  const fixed = fixedLayoutOf(workflow);
  if (fixed) return fixed.numbers;
  const numbers = new Map<NodeId, string>();
  for (const node of nodes) {
    numbers.set(node.id, String(numbers.size + 1));
  }
  return numbers;
}

/**
 * 通し番号の並び（`2` < `3` < `3.1` < `3.2` < `10`）。番号の無いものは最後
 */
export function compareCardNumbers(a: string | null, b: string | null): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let at = 0; at < Math.max(left.length, right.length); at++) {
    const diff = (left[at] ?? -1) - (right[at] ?? -1);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * カードの表記「通し番号 + コメント（無ければノード名）」。カードの見出しと同じ決め方で、
 * **行は組み立てない**（実行のたびに控えるので軽くする）
 */
export function cardLabels(
  workflow: Workflow,
  definitions: NodeDefinitionMap,
): Map<NodeId, string> {
  const byId = new Map(workflow.nodes.map((node) => [node.id, node]));
  const subgraphs = subgraphMap(workflow);
  const nodes = cardNodes(workflow, byId);
  const numbers = cardNumbers(workflow, nodes);
  const labels = new Map<NodeId, string>();

  for (const node of nodes) {
    const index = numbers.get(node.id);
    if (index === undefined) continue;
    const comment = typeof node.title === 'string' ? node.title : '';
    const name =
      comment.length > 0
        ? comment
        : (subgraphs.get(node.type)?.name ?? definitions.get(node.type)?.displayName ?? node.type);
    labels.set(node.id, `${index} ${name}`);
  }
  return labels;
}

/** 表示順に並べたカード。Reroute はリンクの中継なのでカード化しない */
export function buildNodeViews(
  workflow: Workflow,
  definitions: NodeDefinitionMap,
  options: BuildNodeViewsOptions = {},
): NodeView[] {
  const byId = new Map(workflow.nodes.map((node) => [node.id, node]));
  const subgraphs = subgraphMap(workflow);

  const all = cardNodes(workflow, byId);
  const numbers = cardNumbers(workflow, all);

  const ordered = all.filter((node) => {
    if (options.hiddenCandidates && !options.hiddenCandidates.has(node.id)) return true;
    // 見分けられないノードは隠さない（壊れた印を付けて出す）
    let kind: HideableNodeKind | null;
    try {
      kind = hideableKindOf(node, { definitions, subgraphs });
    } catch {
      return true;
    }
    if (kind === 'control') return options.showControlNodes === true;
    if (kind === 'unlinked') return options.showUnlinkedNodes === true;
    return true;
  });

  const context: RowContext = {
    workflow,
    definitions,
    subgraphs,
    links: linkIndex(workflow.links),
    outputValue: createOutputValues(workflow, definitions),
    numbers,
  };

  // 1 ノードずつ閉じ込める。読めないノードは「壊れた」印を付けて残す
  return ordered.map((node) => {
    try {
      return buildNodeView(context, node);
    } catch (error) {
      reportFault(
        t('fault.where.nodeRows', { id: String(node.id), type: String(node.type) }),
        error,
      );
      return brokenView(node, context.numbers.get(node.id) ?? null, messageOf(error));
    }
  });
}

/** 読めない形のノードの表示。種類と理由だけを持つ */
function brokenView(node: WorkflowNode, index: string | null, reason: string): NodeView {
  const classType = String(node.type);
  return {
    id: node.id,
    kind: 'unknown',
    index,
    displayName: classType,
    comment: typeof node.title === 'string' ? node.title : '',
    classType,
    rows: [],
    outputs: [],
    mode: nodeMode(node),
    unresolved: true,
    values: [],
    linked: true,
    collapsed: false,
    broken: reason,
  };
}
