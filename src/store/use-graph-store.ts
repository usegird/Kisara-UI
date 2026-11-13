import { create } from 'zustand';

import type { AppInputRef } from '@/graph/app-inputs';
import type { SortKey } from '@/graph/level-edit';
import type { ConnectRequest, InsertNodeOptions } from '@/graph/links';
import type { NodeSettingsPatch } from '@/graph/node-settings';
import type { PlacementAnchor } from '@/graph/order';
import type { DropSide } from '@/graph/order-move';
import type { SubgraphWidgetRef } from '@/graph/subgraph';
import type {
  LinkId,
  NodeDefinition,
  NodeDefinitionMap,
  NodeId,
  Workflow,
  WorkflowNode,
} from '@/graph/types';
import type { WorkflowTool } from '@/graph/workflow-tool';
import { createGraphAddSlice } from '@/store/slices/graph-add';
import { createGraphAppInputSlice } from '@/store/slices/graph-app-inputs';
import { createGraphGroupSlice } from '@/store/slices/graph-groups';
import { EMPTY_HISTORY, NO_SELECTION, type GraphMoment } from '@/store/slices/graph-kit';
import { createGraphLinkSlice } from '@/store/slices/graph-links';
import { createGraphLoadSlice } from '@/store/slices/graph-load';
import { createGraphNodeLookSlice } from '@/store/slices/graph-node-look';
import { createGraphNodeValueSlice } from '@/store/slices/graph-node-values';
import { createGraphOrderSlice } from '@/store/slices/graph-order';
import { createGraphSelectionSlice } from '@/store/slices/graph-selection';
import { createGraphUndoSlice } from '@/store/slices/graph-undo';

// ─────────────────────────────
// グラフの唯一の真実。更新はすべて `graph/` の純関数へ委譲し、操作は slice に分けて create で合わせる。
// 表示順は pos から導出するだけで、別の順序リストを二重に持たない。
// ─────────────────────────────

/**
 * 取り消しとやり直しの控え。古い順。タブごとに画面の中だけで持つ
 */
export interface GraphHistory {
  readonly past: readonly GraphMoment[];
  readonly future: readonly GraphMoment[];
}

/**
 * ComfyUI から開いた元・保存した先と、上書きしてよいかの手掛かり
 */
export interface SavedOrigin {
  /** `workflows/` からの相対経路 */
  readonly path: string;
  /** どの接続先のものか */
  readonly baseUrl: string;
  /** KisaraUI が作ったファイルか（作った印があったか） */
  readonly own: boolean;
}

/** 線の間に挟むノードの口と置き方 */
export interface InsertNodePlacing {
  readonly slots?: InsertNodeOptions | undefined;
  /**
   * 置く場所。無ければ入力元の次
   */
  readonly anchor?: PlacementAnchor | undefined;
  /** 置いたときに空にしておく入力（`addNode` と同じ） */
  readonly blank?: ReadonlySet<string> | undefined;
}

/** 開いているワークフローと選択・取り消しの控えと、グラフの操作（slice が操作を分けて持つ） */
export interface GraphState {
  readonly workflow: Workflow | null;
  /**
   * ワークフロー名。**Workflow JSON には入っていない**ので別に持つ
   * （ComfyUI 側でも名前＝`workflows/` 配下のファイル名）。
   */
  readonly name: string;
  /**
   * ComfyUI の `workflows/` 配下で開いた元、または最後に保存した先。無ければ `null`。
   * 名前と同じく **Workflow JSON には入れない**（上書き保存の行き先に使う）
   */
  readonly savedPath: string | null;
  /**
   * 保存先がどの接続先のものか。今の接続先と違えば上書き保存しない
   */
  readonly savedOn: string | null;
  /** 保存先が KisaraUI の作ったファイルか（作った印があったか）。無ければ上書き保存しない */
  readonly savedOwn: boolean;
  /**
   * 選んでいるノード（選んだ順）
   */
  readonly selectedNodeIds: readonly NodeId[];
  /** 読み込み以降に編集されたか（保存の促しに使う） */
  readonly dirty: boolean;
  /**
   * 隠してよいノード。**開いたときと表示の切り替え時にだけ決める**。
   * 編集で繋がらなくなったノード・足したノードは入らないので隠れない
   */
  readonly hiddenCandidates: ReadonlySet<NodeId>;
  /**
   * カードを足す・消す操作の取り消しとやり直し
   */
  readonly history: GraphHistory;

  readonly loadWorkflow: (raw: unknown, name?: string, saved?: SavedOrigin | null) => void;
  readonly setName: (name: string) => void;
  /** ComfyUI へ保存できた。保存先を覚え、変更の印を消す */
  /** 未保存の印を付ける。ワークフローの外で持つ値（アプリ入力の値）を変えたとき用 */
  readonly markDirty: () => void;
  /**
   * ComfyUI へ保存できた。書いたのは KisaraUI なので、上書きしてよい相手として覚える。
   * `unchanged` が偽（書いた中身と今の中身が違う）なら、未保存の印は消さない
   */
  readonly markSaved: (savedPath: string, baseUrl: string, unchanged?: boolean) => void;
  /** 書く直前に、保存先が KisaraUI の作ったファイルでないと分かった。以後は上書き保存しない */
  readonly disownSaved: () => void;
  readonly clear: () => void;
  /**
   * 控えから載せ直す（タブの切り替え）。**読み込みの検証は通さない**。
   * 一度受け入れた内容をそのまま戻すだけで、外から来た値は扱わない
   */
  readonly restore: (snapshot: {
    readonly workflow: Workflow | null;
    readonly name: string;
    readonly savedPath: string | null;
    /** 無ければ上書きできない扱い（接続先と組で覚える前の控え） */
    readonly savedOn?: string | null | undefined;
    readonly savedOwn?: boolean | undefined;
    readonly selectedNodeIds: readonly NodeId[];
    readonly dirty: boolean;
    readonly hiddenCandidates: ReadonlySet<NodeId>;
    /** 無ければ空から（読み戻したタブ） */
    readonly history?: GraphHistory | undefined;
  }) => void;
  /**
   * 足す・消すを 1 手戻す。戻す手が無ければ false
   */
  readonly undo: () => boolean;
  /** 戻した 1 手をやり直す。やり直す手が無ければ false */
  readonly redo: () => boolean;
  /** 隠す相手を今の線で決め直す（表示の切り替えから） */
  readonly refreshHiddenCandidates: () => void;
  /**
   * 選ぶ。`additive`（Ctrl+クリック）なら選択に足す・外す。それ以外はそのノードだけにする。
   * null で選択を空にする
   */
  readonly select: (nodeId: NodeId | null, additive?: boolean) => void;

  readonly setTitle: (nodeId: NodeId, title: string) => void;
  /** App Mode（アプリ入力）の対象を切り替える。保持先は `extra.linearData` */
  readonly toggleAppInput: (nodeId: NodeId, widgetName: string) => void;
  /** アプリ入力の並べ替え。順序は `extra.linearData.inputs` の配列順そのもの */
  readonly moveAppInput: (from: AppInputRef, to: AppInputRef) => void;
  /**
   * LLM からの呼び出し設定（`extra.kisara.tool`）。null で消す。取り消しの対象にしない
   */
  readonly setWorkflowTool: (tool: WorkflowTool | null) => void;
  /** アプリ入力の幅（12 分割）。全幅に戻すと指定ごと消える */
  readonly setAppInputSpan: (nodeId: NodeId, widgetName: string, span: number) => void;
  /** アプリ入力の高さ（px）。本体と同じ `inputs` の 3 番目の要素に持ち、カードとは共用しない */
  readonly setAppInputHeight: (nodeId: NodeId, widgetName: string, height: number) => void;
  /** まとめてアプリ入力から外す（枠の × ） */
  readonly removeAppInputs: (refs: readonly AppInputRef[]) => void;
  /** カードの複数行の高さ（px）。標準の `size` に持つ（本体と同じ置き場）。アプリ入力とは共用しない */
  readonly setMultilineHeight: (nodeId: NodeId, definition: NodeDefinition, height: number) => void;
  /** カードの折りたたみ（パラメータを隠す）。保持先は標準の `flags.collapsed` */
  readonly toggleCollapsed: (nodeId: NodeId) => void;
  /**
   * subgraph を枠として開く・閉じる。保持先は `extra.kisara.openSubgraphs`。
   * **取り消しの対象にしない**（見え方の切り替え）
   */
  readonly setSubgraphOpen: (instanceId: NodeId, open: boolean) => void;
  readonly setWidgetValue: (
    nodeId: NodeId,
    definition: NodeDefinition,
    inputName: string,
    value: unknown,
  ) => boolean;

  /** subgraph の昇格 widget（値の実体は内部ノード）を書き換える */
  readonly setProxyWidgetValue: (target: SubgraphWidgetRef, value: unknown) => boolean;

  /**
   * `control_after_generate` に従って seed を進める。
   * ComfyUI 本家と同じく**キューに入れた直後**に呼ぶ（サーバーは関与しない）。
   */
  readonly advanceSeeds: (definitions: NodeDefinitionMap) => void;

  /** カードに出していない設定（大きさ・実行モード・色）を書き換える */
  readonly updateNodeSettings: (nodeId: NodeId, patch: NodeSettingsPatch) => void;

  /**
   * ノード定義から新しいノードを作って足す。
   * `anchor` を渡すとその隣（入力元の右隣など）に置き、右のノードは右へ送る。
   * `blank` は置いたときに空にしておく入力（モデルを選ぶ選択肢）。
   * 判定にはモデルの一覧が要るので、呼ぶ側（フック）が決めて渡す
   */
  readonly addNode: (
    definition: NodeDefinition,
    anchor?: PlacementAnchor,
    connect?: ConnectRequest,
    blank?: ReadonlySet<string>,
  ) => void;
  /**
   * 線の間に新しいノードを挟む。**同じ出力から出ている線**なら何本でもまとめて挟める
   * （出力から変数への点線の ⊕）
   */
  readonly insertNodeAt: (
    linkIds: readonly LinkId[],
    definition: NodeDefinition,
    placing?: InsertNodePlacing,
  ) => void;

  /**
   * dnd-kit の並べ替え結果を pos へ書き戻す。添字は**表示順**を指す
   */
  readonly reorder: (from: number, to: number) => void;
  /** dnd-kit から来る「掴んだノード」「重ねた先」で並べ替える */
  readonly moveNode: (activeId: NodeId, overId: NodeId) => void;
  /**
   * カードとグループの並べ替え。グループは鍵（`groupKeyAt`）で指す。
   * 別の所属のカードへ落とすとその所属に移る（グループに入る・抜ける）。前か後ろは `side`
   */
  readonly moveSortable: (active: SortKey, over: SortKey, side?: DropSide) => void;
  /**
   * 選んだノードを 1 つのグループにする
   */
  readonly groupNodes: (nodeIds: readonly NodeId[]) => void;
  /** グループを解く（枠だけを消す） */
  readonly ungroup: (key: string) => void;
  /**
   * グループを subgraph にする。外の階層だけ。取り消しでは 1 手
   */
  readonly convertGroupToSubgraph: (key: string) => void;
  /**
   * subgraph をグループに戻す。外の階層だけ。取り消しでは 1 手
   */
  readonly convertSubgraphToGroup: (instanceId: NodeId) => void;
  readonly renameGroup: (key: string, title: string) => void;
  /** グループの色（本体の `color`）。null で既定に戻す */
  readonly setGroupColor: (key: string, color: string | null) => void;
  /**
   * グループの切り替えをアプリ入力の列に出す・外す。外の階層のグループだけ
   */
  readonly toggleGroupSwitch: (key: string) => void;
  /** 切り替えをまとめて列から外す。ノードの `mode` は変えない */
  readonly clearGroupSwitches: () => void;
  /** メンバーをまとめてバイパスにする・戻す。取り消しでは 1 手 */
  readonly setNodesBypassed: (nodeIds: readonly NodeId[], bypassed: boolean) => void;
  readonly appendNode: (node: WorkflowNode) => void;
  readonly insertNode: (linkId: LinkId, node: WorkflowNode) => void;
  readonly connect: (
    originId: NodeId,
    originSlot: number,
    targetId: NodeId,
    targetSlot: number,
  ) => void;
  /** パラメータ（widget）へ繋ぐ。`inputs[]` に項目が無ければ足してから張る */
  readonly connectToWidget: (
    originId: NodeId,
    originSlot: number,
    targetId: NodeId,
    widget: { readonly name: string; readonly type: string },
  ) => void;
  readonly disconnect: (linkId: LinkId) => void;
  /** まとめて外す（接続線の右クリック。同じ階層の線だけ） */
  readonly disconnectLinks: (linkIds: readonly LinkId[]) => void;
  /** 処理の順（上流が先）に並べ直す。カード列の脇のアイコンから */
  /** 処理の順に並べ直す。`fromOrigin` なら縦も原点から置き直す */
  readonly sortByProcessing: (fromOrigin?: boolean) => void;
  /** ノードを外す。繋がっている線とアプリ入力も一緒に外す */
  readonly removeNode: (nodeId: NodeId) => void;
  /**
   * まとめて外す（選んだカードの削除）。取り消しでは 1 手
   */
  readonly removeNodes: (nodeIds: readonly NodeId[]) => void;
  /**
   * 同じ内容のノードを足す（クローン）。入力の線は引き、出力は繋がない。
   * 置き場所の既定は元のすぐ後ろ（貼り付けも選んでいるカードの後ろを渡す）
   */
  readonly cloneNode: (nodeId: NodeId, at?: PlacementAnchor) => void;
  /**
   * まとめてクローンする。並びは元の表示順。写したものどうしの線は
   * クローンどうしで張る。置き場所の既定は元の中で最後のノードのすぐ後ろ
   */
  readonly cloneNodes: (nodeIds: readonly NodeId[], at?: PlacementAnchor) => void;
}

export const useGraphStore = create<GraphState>()((...store) => ({
  workflow: null,
  name: '',
  savedPath: null,
  savedOn: null,
  savedOwn: false,
  selectedNodeIds: NO_SELECTION,
  dirty: false,
  hiddenCandidates: new Set(),
  history: EMPTY_HISTORY,
  ...createGraphLoadSlice(...store),
  ...createGraphUndoSlice(...store),
  ...createGraphSelectionSlice(...store),
  ...createGraphNodeLookSlice(...store),
  ...createGraphAppInputSlice(...store),
  ...createGraphNodeValueSlice(...store),
  ...createGraphAddSlice(...store),
  ...createGraphOrderSlice(...store),
  ...createGraphGroupSlice(...store),
  ...createGraphLinkSlice(...store),
}));
