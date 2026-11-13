import { isRecord } from '@/lib/guards';

// ─────────────────────────────
// Workflow JSON（ComfyUI の正データ）とノード定義（/object_info の射影）の型。ComfyUI 側のキーは
// そのまま残し、独自キーを足さない。
// ─────────────────────────────

// 未知キー・カスタムノード固有フィールドを素通しで保持するため、各構造は index signature を持つ。
// 型が緩くなる代わりにラウンドトリップを保証する

/** ノードの id */
export type NodeId = number;
/** リンクの id */
export type LinkId = number;

/** ルートグラフのリンク: [link_id, origin_node, origin_slot, target_node, target_slot, type] */
export type WorkflowLinkTuple = [LinkId, NodeId, number, NodeId, number, unknown];

/**
 * subgraph 定義内のリンク。ルートのタプル形式とは異なりオブジェクト形式で入る。
 * 入出力の境界も通常のリンクとして入り、相手側が SUBGRAPH_IO_NODE_ID になる。
 */
export interface WorkflowLinkObject {
  id: LinkId;
  origin_id: NodeId;
  origin_slot: number;
  target_id: NodeId;
  target_slot: number;
  /** 形を仮定せず `slotTypeName` で読む（読むのは `readLink` だけ） */
  type: unknown;
  [key: string]: unknown;
}

/** リンク。ルートはタプル、subgraph の中はオブジェクトの形 */
export type WorkflowLink = WorkflowLinkTuple | WorkflowLinkObject;

/** 形式差を吸収したリンク表現（読み取り専用の派生値） */
export interface ResolvedLink {
  readonly id: LinkId;
  readonly originId: NodeId;
  readonly originSlot: number;
  readonly targetId: NodeId;
  readonly targetSlot: number;
  readonly type: string;
}

/**
 * subgraph 定義の入出力口を表す仮想ノード id（`inputNode.id` / `outputNode.id` の値）。
 * 境界リンクは origin_id=-10（入力口）または target_id=-20（出力口）を持ち、
 * slot は definition.inputs / definition.outputs のインデックスに対応する。
 */
export const SUBGRAPH_IO_NODE_ID = {
  input: -10,
  output: -20,
} as const;

/**
 * node.mode。0=通常 / 2=ミュート / 4=バイパス
 */
export const NODE_MODE = {
  normal: 0,
  mute: 2,
  bypass: 4,
} as const;

/** node.mode を読む。**未設定は通常扱い**（ComfyUI は既定値を省くことがある） */
export function nodeMode(node: WorkflowNode): number {
  return typeof node.mode === 'number' ? node.mode : NODE_MODE.normal;
}

/**
 * スロットの型名として読む。Workflow JSON の `type` は文字列とは限らない
 * （選択肢の配列などを入れるカスタムノードがある）。配列は選択肢なので `COMBO`、
 * それ以外の形は何でも通す `*` とみなす
 */
export function slotTypeName(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return 'COMBO';
  return '*';
}

/** ノードの入力の口 1 つ */
export interface WorkflowNodeInput {
  name: string;
  /** 形を仮定せず `slotTypeName` で読む */
  type: unknown;
  link: LinkId | null;
  label?: string;
  /** widget から入力ソケットに昇格した入力に付く */
  widget?: { name: string };
  [key: string]: unknown;
}

/** ノードの出力の口 1 つ */
export interface WorkflowNodeOutput {
  name: string;
  /** 形を仮定せず `slotTypeName` で読む */
  type: unknown;
  links?: LinkId[] | null;
  [key: string]: unknown;
}

function linkIdOrNull(value: unknown): LinkId | null {
  return typeof value === 'number' ? value : null;
}

/**
 * 入力の口を読む。配列でなければ空。位置は口の番号なので詰めない：
 * 読めない項目は空の口に置き換え、名前とリンクは形を確かめてから使う。知らないキーは保つ
 */
export function nodeInputs(node: WorkflowNode | null | undefined): WorkflowNodeInput[] {
  if (!node || !Array.isArray(node.inputs)) return [];
  return (node.inputs as unknown[]).map((raw) => {
    if (!isRecord(raw)) return { name: '', type: '*', link: null };

    const { label, widget, ...rest } = raw;
    const input: WorkflowNodeInput = {
      ...rest,
      name: typeof raw.name === 'string' ? raw.name : '',
      type: raw.type,
      link: linkIdOrNull(raw.link),
    };
    if (typeof label === 'string') input.label = label;
    if (isRecord(widget) && typeof widget.name === 'string') {
      input.widget = { ...widget, name: widget.name };
    }
    return input;
  });
}

/** 出力の口を読む。`nodeInputs` と同じく、位置は保ち、形を確かめてから使う */
export function nodeOutputs(node: WorkflowNode | null | undefined): WorkflowNodeOutput[] {
  if (!node || !Array.isArray(node.outputs)) return [];
  return (node.outputs as unknown[]).map((raw) =>
    isRecord(raw)
      ? {
          ...raw,
          name: typeof raw.name === 'string' ? raw.name : '',
          type: raw.type,
          links: Array.isArray(raw.links)
            ? (raw.links as unknown[]).filter((id): id is LinkId => typeof id === 'number')
            : null,
        }
      : { name: '', type: '*', links: null },
  );
}

/** Workflow JSON のノード 1 つ */
export interface WorkflowNode {
  id: NodeId;
  /** class_type。subgraph インスタンスの場合は subgraph 定義の UUID が入る */
  type: string;
  pos: [number, number];
  /** [幅, 高さ]。並べ替え時の間隔計算に使い、値は書き換えない */
  size?: [number, number];
  mode?: number;
  /**
   * 入力の口。形を仮定せず `nodeInputs` で読む。書くときは `WorkflowNodeInput[]` を入れる
   */
  inputs?: unknown;
  /** 出力の口。**形を仮定せず `nodeOutputs` で読む**。書くときは `WorkflowNodeOutput[]` */
  outputs?: unknown;
  properties?: Record<string, unknown>;
  /**
   * widget 値。**ふつうは位置依存の配列**で、名前との対応は widgets.ts が解決する。
   * カスタムノードには**名前をキーにしたオブジェクト**で持つものがあるので、形を仮定せず
   * `widgetValueList` / `widgetValueEntries`（widgets.ts）で読む
   */
  widgets_values?: unknown;
  /** widget 値の名前で引ける写し。新しい本体が書く。値を書き換えたら揃える（widgets.ts） */
  widgets_values_named?: unknown;
  /**
   * カード上のコメント。ComfyUI 本家のノードタイトルと同じキー
   */
  title?: string;
  [key: string]: unknown;
}

/** subgraph 定義の入出力口。`linkIds` は内部側の仮想リンク id */
export interface SubgraphIo {
  id: string;
  name: string;
  /** 形を仮定せず `slotTypeName` で読む */
  type: unknown;
  linkIds?: LinkId[];
  label?: string;
  [key: string]: unknown;
}

/** subgraph の定義（`definitions.subgraphs[]` の 1 つ） */
export interface SubgraphDefinition {
  id: string;
  name: string;
  inputs?: SubgraphIo[];
  outputs?: SubgraphIo[];
  nodes: WorkflowNode[];
  links: WorkflowLink[];
  [key: string]: unknown;
}

/** Workflow JSON 全体 */
export interface Workflow {
  nodes: WorkflowNode[];
  links: WorkflowLink[];
  definitions?: { subgraphs?: SubgraphDefinition[]; [key: string]: unknown };
  [key: string]: unknown;
}

/** subgraph の定義の一覧。無い・読めない形なら空 */
export function subgraphDefinitions(workflow: Workflow): SubgraphDefinition[] {
  const raw = workflow.definitions?.subgraphs;
  return Array.isArray(raw) ? raw : [];
}

// ─────────────────────────────
// ノード定義（/object_info の射影）。実データは 20 MB を超えるので、COMBO の選択肢は射影に含めず
// 必要になった時点で `/object_info/{class}` から遅延取得する。
// ─────────────────────────────

/** ノード定義の入力 1 つ */
export interface InputDefinition {
  readonly name: string;
  /** 'INT' | 'FLOAT' | 'STRING' | 'BOOLEAN' | 'COMBO' | 'IMAGE' などのスロット型 */
  readonly type: string;
  readonly required: boolean;
  /** widget として描画される入力か（＝widgets_values にスロットを持つか） */
  readonly isWidget: boolean;
  /** COMBO の選択肢。未取得なら null */
  readonly options: readonly unknown[] | null;
  readonly config: Readonly<Record<string, unknown>>;
}

/** ノード定義の出力 1 つ */
export interface OutputDefinition {
  readonly name: string;
  readonly type: string;
}

/** ノード定義 1 クラス分 */
export interface NodeDefinition {
  readonly name: string;
  readonly displayName: string;
  readonly category: string;
  /**
   * 定義の出どころ（`/object_info` の `python_module`）。
   * 本体は `nodes` / `comfy_extras.*`、カスタムノードは `custom_nodes.<パック名>`。
   * 取れなければ空。本体・カスタムノード・パートナーの区別は `graph/search.ts` の分類の木
   */
  readonly module: string;
  /** input_order の順（required → optional） */
  readonly inputs: readonly InputDefinition[];
  readonly outputs: readonly OutputDefinition[];
  readonly outputNode: boolean;
  /** ノードの説明（`/object_info` の `description`）。先頭だけ残す。無ければ空か未設定 */
  readonly description?: string | undefined;
}

/** クラス名 → ノード定義 */
export type NodeDefinitionMap = ReadonlyMap<string, NodeDefinition>;

/**
 * `/object_info` に定義を持たないフロントエンド専用ノード
 */
export const FRONTEND_ONLY_TYPES = {
  /** 本文だけを表示する注記ノード。どちらも `/object_info` には現れない */
  notes: ['Note', 'MarkdownNote'] as readonly string[],
  reroute: 'Reroute',
} as const;

/** 注記ノードか（`Note` は複数行テキスト、`MarkdownNote` は Markdown。扱いは同じ） */
export function isNoteType(type: string): boolean {
  return FRONTEND_ONLY_TYPES.notes.includes(type);
}
