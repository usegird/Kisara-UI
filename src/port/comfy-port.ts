import type { ModelFile } from '@/graph/model-files';
import type { SavedStyle, StyleTable } from '@/graph/styles';
import type { WorkflowTemplate } from '@/graph/template-filter';
import type { NodeDefinition, NodeDefinitionMap } from '@/graph/types';
import type {
  ConnectionDiagnosis,
  ReconnectPolicy,
  RequestFailure,
  RequestOptions,
  SocketGiveUp,
  SocketStatus,
} from '@/port/connection';
import type { OutputFileRef, OutputImageBody } from '@/port/files';
import type { HistoryDetail, HistoryResult, QueueSnapshot } from '@/port/history';
import type {
  ComfyEvent,
  PromptAccepted,
  PromptNode,
  PromptRejection,
  RunFailure,
  SubmitPromptParams,
} from '@/port/run';
import type {
  HistoryRunSource,
  RunHistoryEntry,
  RunHistoryFile,
  RunHistoryRead,
} from '@/port/run-history';
import type { SystemStats } from '@/port/system-stats';
import type { TagsPort } from '@/port/tags';
import type { SavedWorkflow, TemplateIndex, WorkflowSaveFailure } from '@/port/workflows';

// ─────────────────────────────
// ComfyUI の通信の窓口の型。能力ごとの型を 1 つに束ね、上の層は HTTP か拡張かを知らない。
// 接続先の URL は呼ぶ側が引数で渡す。
// ─────────────────────────────

/** 疎通と、失敗の原因の推定 */
interface ConnectionPort {
  /** 届くかを確かめる。届かなければ投げる */
  readonly check: (baseUrl: string) => Promise<void>;
  /** 投げられたものを、利用者に出す原因の推定に変える（要るなら届くかを確かめ直す） */
  readonly diagnose: (error: unknown, baseUrl: string) => Promise<ConnectionDiagnosis>;
  /** 投げられたものが要求の失敗なら、状態に持てる記録に変える。違えば null */
  readonly failureOf: (error: unknown) => RequestFailure | null;
  /**
   * 版と実行環境（診断ファイルのダイアログを開いたときだけ）。形が違えば null
   */
  readonly systemStats: (baseUrl: string, options?: RequestOptions) => Promise<SystemStats | null>;
}

/** ノード定義（`/object_info`）と利用頻度の表 */
export interface DefinitionsPort {
  readonly fetchAll: (baseUrl: string, options?: RequestOptions) => Promise<NodeDefinitionMap>;
  readonly fetchOne: (
    baseUrl: string,
    className: string,
    options?: RequestOptions,
  ) => Promise<NodeDefinition | null>;
  readonly fetchFrequency: (baseUrl: string, options?: RequestOptions) => Promise<string[]>;
}

/** 実行の投入と中断。**GPU を消費する**ので、利用者が押したときだけ呼ぶ */
interface RunPort {
  readonly submit: (
    baseUrl: string,
    params: SubmitPromptParams,
    options?: RequestOptions,
  ) => Promise<PromptAccepted>;
  /** その実行だけを止める。走っていなければ止めない */
  readonly interrupt: (
    baseUrl: string,
    promptId: string,
    options?: RequestOptions,
  ) => Promise<void>;
  /** 投げられたものが投入の拒否なら、その理由。違えば null */
  readonly rejectionOf: (error: unknown) => PromptRejection | null;
}

/** 実行の通知の口を開くときに渡すもの */
export interface EventOptions {
  readonly baseUrl: string;
  readonly clientId: string;
  readonly onEvent: (event: ComfyEvent) => void;
  readonly onStatus: (status: SocketStatus) => void;
  /** 張り直しを始めるたびに、何回目か（1 始まり）を知らせる */
  readonly onRetry?: (attempt: number) => void;
  /** 回数を使い切って諦めたとき（タイムアウト・切断扱い）。手で閉じたときは呼ばない */
  readonly onGiveUp?: (reason: SocketGiveUp) => void;
  /** 開いていた口が切れたとき、その切れを数えるか（`maxDrops`）。省くと数えない */
  readonly countsDrop?: () => boolean;
  /** 張り直しの決まり。決めるのは呼ぶ側 */
  readonly reconnect: ReconnectPolicy;
}

/** 開いた通知の口。状態を見る・疑う・閉じる */
export interface EventConnection {
  readonly status: () => SocketStatus;
  /** 開いているはずの口を疑う（ほかの経路で相手が応答しないと分かったとき） */
  readonly suspect: () => void;
  /** 手動切断。以降は再接続しない */
  readonly close: () => void;
}

/** 実行の通知の購読 */
interface EventsPort {
  readonly connect: (options: EventOptions) => EventConnection;
}

/** キューと履歴、結果のファイル */
interface QueuePort {
  readonly fetchQueue: (baseUrl: string, options?: RequestOptions) => Promise<QueueSnapshot>;
  /** 実行前のタスクをキューから外す。**接続先のキューを変える**（押されたときだけ呼ぶ） */
  readonly deleteQueued: (
    baseUrl: string,
    promptId: string,
    options?: RequestOptions,
  ) => Promise<void>;
  readonly fetchHistory: (
    baseUrl: string,
    maxItems: number | undefined,
    options?: RequestOptions,
  ) => Promise<HistoryResult>;
  readonly fetchHistoryItem: (
    baseUrl: string,
    promptId: string,
    options?: RequestOptions,
  ) => Promise<HistoryDetail | null>;
  readonly fetchPromptFromImage: (
    baseUrl: string,
    file: OutputFileRef,
    options?: RequestOptions,
  ) => Promise<Readonly<Record<string, unknown>> | null>;
  /**
   * 生成画像に埋まっている Workflow JSON。無ければ null
   */
  readonly fetchWorkflowFromImage: (
    baseUrl: string,
    file: OutputFileRef,
    options?: RequestOptions,
  ) => Promise<Readonly<Record<string, unknown>> | null>;
  readonly fetchOutputImage: (
    baseUrl: string,
    file: OutputFileRef,
    options?: RequestOptions,
  ) => Promise<OutputImageBody>;
  /** 結果のファイルを直に指す URL（`img` に渡す） */
  readonly outputSrc: (baseUrl: string, file: OutputFileRef) => string;
  /** 履歴の 1 件分（控えた生の値）から、実行した API Prompt。読めなければ null */
  readonly entryNodesOf: (entry: unknown) => Readonly<Record<string, unknown>> | null;
  /** 履歴の 1 件分（控えた生の値）から、失敗の記録。成功した・記録が無い・読めないなら null */
  readonly entryFailureOf: (entry: unknown) => RunFailure | null;
  /** API Prompt のノードを id → `class_type` と入力の表にする。`class_type` の無いものは外す */
  readonly promptNodesOf: (nodes: Readonly<Record<string, unknown>>) => Map<string, PromptNode>;
}

/** 保存したワークフローと、同梱のテンプレート */
interface WorkflowsPort {
  readonly list: (baseUrl: string, options?: RequestOptions) => Promise<SavedWorkflow[]>;
  readonly fetch: (baseUrl: string, path: string, options?: RequestOptions) => Promise<unknown>;
  readonly save: (
    baseUrl: string,
    path: string,
    content: string,
    options?: { readonly overwrite?: boolean } & RequestOptions,
  ) => Promise<void>;
  /** 投げられたものが、利用者に選んでもらう止まり方ならその理由。ほかの失敗なら null */
  readonly saveFailure: (error: unknown) => WorkflowSaveFailure | null;
  readonly listTemplates: (
    baseUrl: string,
    locale: string,
    options?: RequestOptions,
  ) => Promise<TemplateIndex>;
  readonly fetchTemplate: (
    baseUrl: string,
    name: string,
    options?: RequestOptions,
  ) => Promise<unknown>;
  readonly templateThumbnailSrc: (baseUrl: string, template: WorkflowTemplate) => string | null;
}

/** モデル 1 つのメモの書く先と中身 */
export interface ModelNoteFile {
  readonly folder: string;
  readonly filename: string;
  readonly text: string;
}

/** モデルの一覧・埋め込み情報・メモ */
export interface ModelsPort {
  readonly fetchFiles: (
    baseUrl: string,
    folder: string,
    options?: RequestOptions,
  ) => Promise<ModelFile[]>;
  readonly fetchMetadata: (
    baseUrl: string,
    folder: string,
    filename: string,
    options?: RequestOptions,
  ) => Promise<Map<string, string>>;
  /**
   * `kisara/` に保存したメモの経路の一覧。置き場が無ければ空
   */
  readonly listNotes: (baseUrl: string, options?: RequestOptions) => Promise<ReadonlySet<string>>;
  /** `kisara/` に保存したメモ。無ければ null */
  readonly fetchNotes: (
    baseUrl: string,
    folder: string,
    filename: string,
    options?: RequestOptions,
  ) => Promise<string | null>;
  /** pysssss が書いた同名の `.txt`（読むだけ）。無ければ null */
  readonly fetchPysssssNotes: (
    baseUrl: string,
    folder: string,
    filename: string,
    options?: RequestOptions,
  ) => Promise<string | null>;
  readonly hasNotesRoute: (baseUrl: string, options?: RequestOptions) => Promise<boolean>;
  /** `kisara/` に書く */
  readonly saveNotes: (
    baseUrl: string,
    note: ModelNoteFile,
    options?: RequestOptions,
  ) => Promise<void>;
  readonly previewSrc: (baseUrl: string, folder: string, file: ModelFile | null) => string | null;
}

/** 入力画像の置き場 */
interface InputImagesPort {
  /** 置いて、欄に入れる値（サブフォルダを含む名前）を返す */
  readonly upload: (baseUrl: string, file: File, options?: RequestOptions) => Promise<string>;
  /**
   * `temp/` の下のサブフォルダへ置いて、`[temp]` 付きの値を返す
   */
  readonly uploadTemp: (
    baseUrl: string,
    file: File,
    subfolder: string,
    options?: RequestOptions,
  ) => Promise<string>;
  /** 欄の値が指す画像の URL。画像の値でなければ null */
  readonly src: (baseUrl: string, value: string) => string | null;
}

/** スタイルとワイルドカードの一覧 */
export interface AssetsPort {
  /** ユーザーフォルダ直下の `styles.csv`（読むだけ） */
  readonly fetchStyleTable: (baseUrl: string, options?: RequestOptions) => Promise<StyleTable>;
  /**
   * `kisara/` に 1 件ずつ置いたスタイル
   */
  readonly fetchSavedStyles: (baseUrl: string, options?: RequestOptions) => Promise<SavedStyle[]>;
  /** 1 件（または消した印）を `kisara/` に書く */
  readonly saveStyle: (
    baseUrl: string,
    entry: SavedStyle,
    options?: RequestOptions,
  ) => Promise<void>;
  readonly fetchWildcards: (baseUrl: string, options?: RequestOptions) => Promise<string[] | null>;
}

/**
 * 実行の記録（ユーザーフォルダの 1 起動 1 ファイル）
 */
interface RunHistoryPort {
  /** 記録のファイルの一覧（名前と時期）。置き場がまだ無ければ空。中身は読まない */
  readonly list: (baseUrl: string, options?: RequestOptions) => Promise<RunHistoryEntry[]>;
  /** 1 ファイルを読む。無い・形が違うも結果で返す（通信の失敗だけ投げる） */
  readonly fetch: (
    baseUrl: string,
    name: string,
    options?: RequestOptions,
  ) => Promise<RunHistoryRead>;
  /** ファイル全体を上書きする */
  readonly save: (
    baseUrl: string,
    name: string,
    file: RunHistoryFile,
    options?: RequestOptions,
  ) => Promise<void>;
  /** キューの取り直しで得た履歴の応答（`HistoryResult.raw`）から、記録の材料を取り出す */
  readonly sourcesOf: (raw: unknown) => HistoryRunSource[];
}

/** 会話 1 件の書く 2 つのファイルの中身 */
export interface ChatFiles {
  readonly id: string;
  readonly body: string;
  readonly meta: string;
}

/**
 * 置き場を ComfyUI にした会話。中身は文字のまま受け渡し、会話の形は知らない（読むのは上の層）
 */
export interface ChatsPort {
  /** `kisara/chats/` の一覧の項目（`.meta.json` の中身）。置き場が無ければ空 */
  readonly listMetas: (baseUrl: string, options?: RequestOptions) => Promise<unknown[]>;
  /** 会話のファイル。無ければ null */
  readonly fetchChat: (baseUrl: string, id: string, options?: RequestOptions) => Promise<unknown>;
  /** 本文と一覧の項目の 2 つを書く（上書きする） */
  readonly saveChat: (baseUrl: string, files: ChatFiles, options?: RequestOptions) => Promise<void>;
  /** 2 つのファイルを消す。**接続先のファイルを消す**（消す・移すを押されたときだけ呼ぶ） */
  readonly removeChat: (baseUrl: string, id: string, options?: RequestOptions) => Promise<void>;
  /** 投げられたものが、置き場の容量の不足（大きすぎる要求・ディスクの不足）か */
  readonly isFull: (error: unknown) => boolean;
}

/**
 * 控えを書く単位。会話は `ChatsPort`
 */
export type LibraryKind = 'presets' | 'system-prompts' | 'dictionaries' | 'playbooks' | 'avatars';

/** 控え 1 件の書く中身。画像があれば画像も書く */
export interface LibraryItemFile {
  readonly kind: LibraryKind;
  readonly id: string;
  readonly body: string;
  readonly image: Blob | null;
}

/**
 * プリセット・システムプロンプトのテンプレート・追加辞書の控え。
 * 中身は文字のまま受け渡し、形は知らない（読むのは上の層）
 */
export interface LibraryBackupPort {
  /** 控えの全件（`<id>.json` の中身）。置き場が無ければ空 */
  readonly list: (
    baseUrl: string,
    kind: LibraryKind,
    options?: RequestOptions,
  ) => Promise<unknown[]>;
  /** 1 件を書く（上書きする）。画像があれば画像も書く */
  readonly save: (
    baseUrl: string,
    item: LibraryItemFile,
    options?: RequestOptions,
  ) => Promise<void>;
  /** 1 件の画像。無ければ null */
  readonly fetchImage: (
    baseUrl: string,
    kind: LibraryKind,
    id: string,
    options?: RequestOptions,
  ) => Promise<Blob | null>;
  /** 1 件を消す。**接続先のファイルを消す**（一覧から消したときだけ呼ぶ） */
  readonly remove: (
    baseUrl: string,
    kind: LibraryKind,
    id: string,
    options?: RequestOptions,
  ) => Promise<void>;
}

/**
 * ストレージの管理で見る・消す、ユーザーフォルダの KisaraUI の物（控えを除く）
 */
export type UserFileKind = 'history' | 'notes' | 'styles' | 'tags';

/** ユーザーフォルダの 1 つのファイル。経路はその種類のフォルダからの相対（区切りは `/`） */
export interface UserFile {
  readonly path: string;
  readonly bytes: number;
  /** 最後に書いた時刻（ミリ秒）。分からなければ null */
  readonly modified: number | null;
}

/** ストレージの管理が使う、ユーザーフォルダの KisaraUI の物の一覧・読み取り・削除 */
interface UserFilesPort {
  /** フォルダの中のファイル。フォルダが無ければ空 */
  readonly list: (
    baseUrl: string,
    kind: UserFileKind,
    options?: RequestOptions,
  ) => Promise<UserFile[]>;
  /** 1 つのファイルの中身（文字のまま）。無ければ null */
  readonly read: (
    baseUrl: string,
    kind: UserFileKind,
    path: string,
    options?: RequestOptions,
  ) => Promise<string | null>;
  /** 1 つのファイルを消す。**接続先のファイルを消す**（ストレージの管理で適用したときだけ呼ぶ） */
  readonly remove: (
    baseUrl: string,
    kind: UserFileKind,
    path: string,
    options?: RequestOptions,
  ) => Promise<void>;
}

/** ComfyUI の窓口の全体。入口が実装を作って受け口に入れる */
export interface ComfyPort {
  readonly connection: ConnectionPort;
  readonly definitions: DefinitionsPort;
  readonly run: RunPort;
  readonly events: EventsPort;
  readonly queue: QueuePort;
  readonly workflows: WorkflowsPort;
  readonly models: ModelsPort;
  readonly inputImages: InputImagesPort;
  readonly assets: AssetsPort;
  readonly tags: TagsPort;
  readonly runHistory: RunHistoryPort;
  readonly chats: ChatsPort;
  readonly library: LibraryBackupPort;
  readonly userFiles: UserFilesPort;
}
