import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { UnitLink } from '@/chat/types';
import type { SearchEngine } from '@/chat/web-tools';
import type { ModelSort } from '@/graph/model-files';
import type {
  DialogLayouts,
  DialogMode,
  DialogRect,
  PaneDock,
  PaneDocks,
  PanePins,
  PaneWidths,
} from '@/lib/dialog-rect';
import type { FloatingPosition } from '@/lib/floating-position';
import { isRecord } from '@/lib/guards';
import { newShortId } from '@/lib/id';
import { claimTabId, readTabId } from '@/lib/tab-id';
import type { ThemePreference } from '@/lib/theme';
import type { TraceArea, TraceLevel, TraceLevels } from '@/lib/trace';
import type { GenerationParams } from '@/port/llm-port';
import { settingsStorage } from '@/store/persist/settings-storage';
import type { ChatImagePlace } from '@/store/settings-fields/chat-image';
import type { ColumnKey, ColumnWidths } from '@/store/settings-fields/column-widths';
import type { ColumnZooms, ZoomColumn } from '@/store/settings-fields/column-zoom';
import type { Safeguards } from '@/store/settings-fields/safeguards';
import {
  initialSettings,
  readSettings,
  storedSettings,
} from '@/store/settings-fields/settings-table';
import type { ViewerGrid } from '@/store/settings-fields/viewer-grid';
import { createSettingsChatSlice } from '@/store/slices/settings-chat';
import { createSettingsConnectionSlice } from '@/store/slices/settings-connection';
import { createSettingsLoreSlice } from '@/store/slices/settings-lore';
import { createSettingsPanelsSlice } from '@/store/slices/settings-panels';
import { createSettingsViewSlice } from '@/store/slices/settings-view';

export { holdSettingsWrites } from '@/store/persist/settings-storage';

/**
 * 会話から呼べるワークフローの 1 件。タブを優先し、タブが無ければ
 * 保存先のパスから開く。`id` は選んだときに付け、タブやパスが変わっても変えない
 */
export interface ComfyToolTarget {
  readonly id: string;
  readonly tabId: string;
  /** ComfyUI に保存した `workflows/` からのパス。保存していないタブは null */
  readonly path: string | null;
  /** 選んだときのタブの名前（タブを閉じた後も一覧に出す） */
  readonly name: string;
}

/**
 * 右の列の置き場所。名前は下に置いても「右の列」のまま
 */
export type SidePanelDock = 'right' | 'bottom';

// ─────────────────────────────
// 接続設定。**localStorage に永続化**する。
// ここに秘密は置かない。本アプリはサーバーを持たず、保持する値はすべて利用者の端末にしか無い。
// ─────────────────────────────

/** 端末に残す設定と、その操作 */
export interface SettingsState {
  /** 接続先 ComfyUI。空文字＝未設定（オンボーディングを出す） */
  readonly baseUrl: string;
  /**
   * つながった接続先の履歴（新しい順）
   */
  readonly baseUrlHistory: readonly string[];
  /**
   * つながった LLM のベース URL の履歴（新しい順）
   */
  readonly llmUrlHistory: readonly string[];
  /**
   * WebSocket の clientId。**タブごと**に分け、読み込み直しても保つ。
   * 決まるまでは空（つながない・送らない）
   */
  readonly clientId: string;
  /** 操作系ノード（定義も線も無い画面操作用）をフローに出すか。既定は出さない */
  readonly showControlNodes: boolean;
  /** 繋がっていないノード（メモを含む）をフローに出すか。既定は出さない */
  readonly showUnlinkedNodes: boolean;
  /**
   * 受ける行がカードの列の上へ過ぎた変数の線を引くか
   */
  readonly showPassedLines: boolean;
  /**
   * 画面の配色。既定は OS に従う
   */
  readonly theme: ThemePreference;
  /** 3列（App Mode / カード / 変数）の幅 */
  readonly columnWidths: ColumnWidths;
  /** 3列（App Mode / カード / 変数）の中身の倍率（百分率） */
  readonly columnZooms: ColumnZooms;
  /**
   * 狭い画面の倍率（3 列で 1 つ）。列ごとの倍率とは別に残す
   */
  readonly narrowZoom: number;
  /** モデルを選ぶ画面のカードの高さ（px） */
  readonly modelCardHeight: number;
  /** モデルを選ぶ画面の並び替えと昇降。種別を問わず 1 つ */
  readonly modelSort: ModelSort;
  /**
   * 画像を選ぶ画面の昇降。並びは名前だけなので向きだけ持つ
   */
  readonly imageSortAscending: boolean;
  /** Lora の写し取りの書式。打っている途中の空も持つ（使うときに既定へ落とす） */
  readonly loraCopyFormat: string;
  /**
   * 実行の記録を接続先のユーザーフォルダに書くか。既定は書かない
   */
  readonly recordRunHistory: boolean;
  /**
   * 実行の記録の 1 セッションのファイルに残す実行の数。超えたら古い順に外す
   */
  readonly runHistoryLimit: number;
  /** 防御機構の上限（繰り返し実行・LLM の要求の量）。画面からは変えない */
  readonly safeguards: Safeguards;
  /** 実行の操作（コントロールパネル）の置き場所。null は既定の置き場所 */
  readonly controlPosition: FloatingPosition | null;
  /** タスクの詳細で画像の側が占める割合（0.2〜0.8） */
  readonly taskDetailImageRatio: number;
  /** 画像ビューワーの行×列。次に開いたときも同じ枠で出す */
  readonly viewerGrid: ViewerGrid;
  /** 画像ビューワーのスライドショーの送りの間隔（秒）。端末に残す */
  readonly slideshowSeconds: number;
  /**
   * ダイアログごとの出し方と自由移動の枠。無いものは呼び出す側の既定
   */
  readonly dialogLayouts: DialogLayouts;
  /** ノード追加の左の列の幅（px） */
  readonly nodeSearchListWidth: number;
  /** ダイアログの中の列の幅（px）。無いものは列の既定 */
  readonly dialogPaneWidths: PaneWidths;
  /** ダイアログの中の、右か下に置ける列の置き場。無いものは列の既定 */
  readonly dialogPaneDocks: PaneDocks;
  /**
   * ピン止めした列（ダイアログの列ごと）
   */
  readonly dialogPanePins: PanePins;
  /** 右の列を右に置くか下に置くか */
  readonly sidePanelDock: SidePanelDock;
  /** 下に置いたときの帯の高さ（px） */
  readonly sidePanelHeight: number;
  /**
   * 右の列を細い 1 行に縮めているか
   */
  readonly sidePanelCollapsed: boolean;
  /**
   * 会話の左の列の幅（px）
   */
  readonly chatSidebarWidth: number;
  /** 会話の左の列を細い 1 列に縮めているか（ピン止めを外したか） */
  readonly chatSidebarCollapsed: boolean;
  /**
   * 構成の相談の欄の幅（px）
   */
  readonly promptAdvisorWidth: number;
  /**
   * 会話の画面に重ねるカードの並びの幅（px）
   */
  readonly chatCardWidth: number;
  /**
   * 会話・プリセット・テンプレートの控えを ComfyUI に書くか
   */
  readonly chatComfyBackup: boolean;
  /**
   * ComfyUI 連携を有効にするか。既定は有効にしない
   */
  readonly chatComfyTools: boolean;
  /**
   * 呼び出しを確認せずに実行するか（実行前の承諾を省く）。既定は省かない
   */
  readonly chatComfyToolsSkipConfirm: boolean;
  /**
   * ワークフローの説明の後ろに添える共通の追加指示。既定は空
   */
  readonly chatComfyToolsArgGuide: string;
  /**
   * 会話から呼べるワークフロー（選んだ順）。タブと、保存先のパス
   */
  readonly chatComfyToolTargets: readonly ComfyToolTarget[];
  /**
   * 隣り合う system のメッセージをまとめて送るか。既定はまとめない
   */
  readonly squashSystemMessages: boolean;
  /**
   * 会話 1 つの大きさの上限（MB）。超えたらその会話では送らない
   */
  readonly chatMaxMegabytes: number;
  /**
   * 会話のログに一度に描く発言の数
   */
  readonly chatLogWindow: number;
  /**
   * 動的追加辞書（全体の辞書）を当てるか。既定は当てる
   */
  readonly loreDictionariesOn: boolean;
  /**
   * プレイブックの始めるアイコンを出すか。既定は出す
   */
  readonly playbooksOn: boolean;
  /**
   * プレイブックのカードを縮めているか（全体で 1 つ）。既定は縮めない
   */
  readonly playbookCardFolded: boolean;
  /**
   * 選ぶ所から外したプレイブックの鍵（`builtin:<id>`・`own:<id>`）。既定は外さない
   */
  readonly playbooksHidden: readonly string[];
  /**
   * Web 検索の使用ツール（無効を選べる。取得はその提供元）と、手数・取得の本文の上限
   */
  readonly webSearchEngine: SearchEngine;
  readonly webSearchMaxCalls: number;
  readonly webFetchMaxTokens: number;
  /**
   * 近似判定を有効にするか。既定は有効にしない
   */
  readonly loreSemantic: boolean;
  /**
   * 診断のログの段階（分野ごと）。`debug` は端末に `warn` として残す
   */
  readonly traceLevels: TraceLevels;
  /**
   * 近似判定の埋め込みモデルの指定（Hugging Face の URL か `組織/名前`）。空なら言語の推奨
   */
  readonly embeddingModel: string;
  /**
   * 全体で有効にした追加辞書の id（有効にした順）
   */
  readonly loreDictionaryIds: readonly string[];
  /**
   * 会話で使う接続の設定の id・モデル・生成の設定。全部の会話で共通。モデルが空なら
   * 接続の設定の既定を使う（llm-target.ts）
   */
  readonly llmProfileId: string | null;
  readonly llmModel: string;
  readonly llmParams: GenerationParams;
  /**
   * KisaraUI のシステムプロンプトと、読み込んだテンプレートの id と名前。全部の会話で共通。
   * 送る中身の先頭に `system` として置く
   */
  readonly llmSystemPrompt: string;
  readonly llmSystemTemplate: UnitLink | null;
  /**
   * 会話の画面にプリセットの画像（アバター）を出すか
   */
  readonly chatShowAvatar: boolean;
  /**
   * 会話のタブをワークフローのタブより左へ自動で寄せるか（既定は寄せる）
   */
  readonly chatTabsFirst: boolean;
  /** 会話の画面のアバターの置き場と、枠の縦横（px） */
  readonly chatImagePlace: ChatImagePlace;
  readonly chatImageWidth: number;
  readonly chatImageHeight: number;
  /** アバターの中央点（枠に詰めたときに見せる位置。%） */
  readonly chatImageFocusX: number;
  readonly chatImageFocusY: number;
  readonly setBaseUrl: (baseUrl: string) => void;
  /** つながった接続先を履歴の先頭に足す */
  readonly rememberBaseUrl: (baseUrl: string) => void;
  /** 履歴から 1 件消す */
  readonly forgetBaseUrl: (baseUrl: string) => void;
  /** つながった LLM のベース URL を履歴の先頭に足す */
  readonly rememberLlmUrl: (url: string) => void;
  /** LLM の履歴から 1 件消す */
  readonly forgetLlmUrl: (url: string) => void;
  readonly setShowControlNodes: (show: boolean) => void;
  readonly setShowUnlinkedNodes: (show: boolean) => void;
  readonly setShowPassedLines: (show: boolean) => void;
  readonly setTheme: (theme: ThemePreference) => void;
  /** 仕切りのドラッグ量を反映する */
  readonly resizeColumn: (column: ColumnKey, delta: number) => void;
  /** 列の倍率を 1 刻み動かす。`direction` が正なら広げ、負なら縮める */
  readonly stepColumnZoom: (column: ZoomColumn, direction: number) => void;
  /** 列の倍率を等倍に戻す */
  readonly resetColumnZoom: (column: ZoomColumn) => void;
  /** 狭い画面の倍率を 1 刻み動かす */
  readonly stepNarrowZoom: (direction: number) => void;
  /** 狭い画面の倍率を等倍に戻す */
  readonly resetNarrowZoom: () => void;
  /** カードの高さ（px）。範囲外は端に寄せる */
  readonly setModelCardHeight: (height: number) => void;
  /** 並び替えか昇降の片方だけを変える */
  readonly setModelSort: (patch: Partial<ModelSort>) => void;
  readonly setImageSortAscending: (ascending: boolean) => void;
  readonly setLoraCopyFormat: (format: string) => void;
  readonly setRecordRunHistory: (record: boolean) => void;
  readonly setRunHistoryLimit: (limit: number) => void;
  /** 実行の操作を動かした量を反映する。`from` は動かす前に出ていた場所 */
  readonly moveControl: (from: FloatingPosition, dx: number, dy: number) => void;
  /** 行か列の片方だけを変える。範囲外は端に寄せる */
  readonly setViewerGrid: (patch: Partial<ViewerGrid>) => void;
  readonly setSlideshowSeconds: (seconds: number) => void;
  readonly setDialogMode: (id: string, mode: DialogMode) => void;
  readonly setDialogRect: (id: string, rect: DialogRect) => void;
  /** 範囲外は端に寄せる */
  readonly setNodeSearchListWidth: (width: number) => void;
  /** 範囲外は端に寄せる */
  readonly setDialogPaneWidth: (key: string, width: number) => void;
  readonly setDialogPaneDock: (key: string, dock: PaneDock) => void;
  readonly setDialogPanePin: (key: string, pinned: boolean) => void;
  readonly setSidePanelDock: (dock: SidePanelDock) => void;
  /** 範囲外は端に寄せる */
  readonly setTaskDetailImageRatio: (ratio: number) => void;
  /** 範囲外は端に寄せる */
  readonly setSidePanelHeight: (height: number) => void;
  readonly setSidePanelCollapsed: (collapsed: boolean) => void;
  /** 会話の左の列の幅を `delta` だけ変える（範囲に収める） */
  readonly resizeChatSidebar: (delta: number) => void;
  readonly resizePromptAdvisor: (delta: number) => void;
  readonly resizeChatCard: (delta: number) => void;
  readonly setChatSidebarCollapsed: (collapsed: boolean) => void;
  readonly setChatComfyBackup: (on: boolean) => void;
  readonly setChatComfyTools: (on: boolean) => void;
  readonly setChatComfyToolsSkipConfirm: (on: boolean) => void;
  readonly setChatComfyToolsArgGuide: (text: string) => void;
  readonly setLoreDictionariesOn: (on: boolean) => void;
  readonly setPlaybooksOn: (on: boolean) => void;
  readonly setPlaybookCardFolded: (folded: boolean) => void;
  /** そのプレイブックを選ぶ所に出すか */
  readonly setPlaybookShown: (key: string, shown: boolean) => void;
  readonly setSquashSystemMessages: (on: boolean) => void;
  readonly setChatMaxMegabytes: (megabytes: number) => void;
  readonly setChatLogWindow: (count: number) => void;
  readonly setWebSearchEngine: (engine: SearchEngine) => void;
  readonly setWebSearchMaxCalls: (calls: number) => void;
  readonly setWebFetchMaxTokens: (tokens: number) => void;
  readonly setLoreSemantic: (on: boolean) => void;
  readonly setTraceLevel: (area: TraceArea, level: TraceLevel) => void;
  readonly setEmbeddingModel: (value: string) => void;
  /** 追加辞書を全体で有効にする（並びの最後に足す）・外す */
  readonly setLoreDictionaryEnabled: (id: string, on: boolean) => void;
  /** 有効にした並びを、残す id だけにする（一覧に無い id を外す） */
  readonly keepLoreDictionaryIds: (ids: ReadonlySet<string>) => void;
  /** 外したプレイブックの鍵から、もう無い自分のプレイブック（`own:<id>`）を外す */
  readonly keepOwnPlaybookIds: (ids: ReadonlySet<string>) => void;
  /** 呼べるワークフローを末尾に足す。同じタブは足さない */
  readonly addChatComfyToolTarget: (target: ComfyToolTarget) => void;
  readonly removeChatComfyToolTarget: (id: string) => void;
  /** 指しているタブ・パスを直す（パスから開いたタブへ移したとき・タブを保存したとき） */
  readonly updateChatComfyToolTarget: (
    id: string,
    patch: Partial<Pick<ComfyToolTarget, 'tabId' | 'path'>>,
  ) => void;
  /** 会話で使う接続の設定とモデルを替える */
  readonly setLlmTarget: (patch: {
    readonly profileId?: string | null;
    readonly model?: string;
  }) => void;
  /** 生成の設定の 1 項目を決める（undefined で決めないに戻す） */
  readonly setLlmParam: <K extends keyof GenerationParams>(
    key: K,
    value: GenerationParams[K] | undefined,
  ) => void;
  /** 生成の設定をまとめて替える（テンプレートを選んだとき） */
  readonly setLlmParams: (params: GenerationParams) => void;
  readonly setLlmSystemPrompt: (text: string) => void;
  readonly setLlmSystemTemplate: (template: UnitLink | null) => void;
  readonly setChatShowAvatar: (on: boolean) => void;
  readonly setChatTabsFirst: (on: boolean) => void;
  readonly setChatImagePlace: (place: ChatImagePlace) => void;
  /** アバターの枠の縦横を決める（範囲に収める） */
  readonly setChatImageSize: (width: number, height: number) => void;
  /** アバターの中央点を決める（0〜100 の %） */
  readonly setChatImageFocus: (x: number, y: number) => void;
}

/** 設定の置き場（小さい保存領域） */
export const SETTINGS_KEY = 'kisaraui.settings';

export const useSettingsStore = create<SettingsState>()(
  persist(
    (...store) => ({
      clientId: '',
      ...initialSettings(),
      ...createSettingsConnectionSlice(...store),
      ...createSettingsViewSlice(...store),
      ...createSettingsPanelsSlice(...store),
      ...createSettingsChatSlice(...store),
      ...createSettingsLoreSlice(...store),
    }),
    {
      name: SETTINGS_KEY,
      storage: createJSONStorage(() => settingsStorage),
      partialize: storedSettings,
      // 保存値が壊れていても既定に落として起動できるようにする
      merge: (persisted, current) => {
        const saved = isRecord(persisted) ? persisted : {};
        return { ...current, ...saved, ...readSettings(saved) };
      },
    },
  ),
);

/** タブごとの clientId の置き場（タブごとの保存領域） */
export const CLIENT_ID_KEY = 'kisaraui.clientId';

/**
 * このタブの clientId が決まったら入れる。同じ id の通知の接続は本体が 1 本しか生かさないので、
 * 複製したタブとは分ける。決まった値で解決する
 */
const NO_DICTIONARY_IDS: readonly string[] = [];

/**
 * 当てる全体の辞書の id。動的追加辞書のカードを切っていれば空。
 * セレクタに使うので、どちらも同じ物を返す
 */
export function enabledDictionaryIds(
  state: Pick<SettingsState, 'loreDictionariesOn' | 'loreDictionaryIds'>,
): readonly string[] {
  return state.loreDictionariesOn ? state.loreDictionaryIds : NO_DICTIONARY_IDS;
}

/** 取り直す前に保存してあった clientId（複製されたブラウザのタブかを見分ける） */
const storedClientId = readTabId(CLIENT_ID_KEY);

export const clientIdReady: Promise<string> = claimTabId(CLIENT_ID_KEY, newShortId).then(
  (clientId) => {
    useSettingsStore.setState({ clientId });
    return clientId;
  },
);

/**
 * 保存してあった clientId をほかのブラウザのタブが使っていて、作り直したか。複製した
 * ブラウザのタブなら true（読み戻した一時保存が自分の書いたものでなくて当然）
 */
export const clientIdRenewed: Promise<boolean> = clientIdReady.then(
  (clientId) => storedClientId !== null && storedClientId !== clientId,
);
