import type { OwnLorebook } from '@/chat/lore';
import type { ChatPlaybookRef, PlaybookInstruction } from '@/chat/playbook';
import type { OutputFileRef } from '@/port/files';
import type {
  Citation,
  GenerationParams,
  LlmFailure,
  TokenUsage,
  ToolBilling,
} from '@/port/llm-port';

// ─────────────────────────────
// 会話の形。会話は置き場に残る 1 件で、タブは会話を 1 つ開く。接続の設定は会話の外に置く。
// ─────────────────────────────

/** 候補の終わり方。受け取り中・終わった・止めた・失敗した */
export type CandidateEnd =
  | { readonly kind: 'streaming' }
  | { readonly kind: 'done'; readonly reason: string | null }
  | { readonly kind: 'stopped' }
  | { readonly kind: 'failed'; readonly failure: LlmFailure };

/**
 * 呼び出しが合わなかった理由。`unknown-tool` は送っていないワークフロー名、
 * ほかは引数の確かめの結果。`argument` はどの引数か
 */
export type ToolCallProblem =
  | { readonly code: 'unknown-tool' }
  | { readonly code: 'json' }
  | {
      readonly code: 'missing' | 'unknown' | 'type' | 'range' | 'choice';
      readonly argument: string;
    };

/**
 * ワークフローの呼び出しの状態
 */
export type ToolCallState =
  | { readonly kind: 'receiving' }
  | { readonly kind: 'waiting' }
  | { readonly kind: 'invalid'; readonly problem: ToolCallProblem }
  | { readonly kind: 'declined' }
  /** 完了待ち。`outputs` は投入したときの結果として渡す出力ノード（無ければすべて。拾い直しに使う） */
  | {
      readonly kind: 'queued';
      readonly promptId: string;
      readonly outputs?: readonly string[] | undefined;
    }
  | { readonly kind: 'done'; readonly images: readonly OutputFileRef[] }
  | { readonly kind: 'failed'; readonly message: string }
  /**
   * 不明。キューにも履歴にも無く、結果が分からない。実行の id と出力ノードは残し、
   * 接続し直したときに履歴で決め直す
   */
  | {
      readonly kind: 'unknown';
      readonly promptId: string;
      readonly outputs?: readonly string[] | undefined;
    };

/** 呼び出しの 1 回の実行。引数の本文（JSON）と状態 */
export interface ToolCallRun {
  readonly arguments: string;
  readonly state: ToolCallState;
}

/** 受け取りの記録。時間は ms、費用（参考）は送った時点のモデルの費用で計算した米ドル */
export interface ResponseTiming {
  readonly firstMs?: number | undefined;
  readonly receivingMs?: number | undefined;
  readonly referenceUsd?: number | undefined;
}

/** 応答の記録（トークン数・受け取りの記録・使用状況。返った・測れたものだけ）。送り返さない */
export interface ResponseRecord {
  readonly usage?: TokenUsage | undefined;
  readonly timing?: ResponseTiming | undefined;
  readonly billing?: ToolBilling | undefined;
}

/**
 * 呼び出しを作らせた応答の記録（呼び出しの「ワークフローを実行」から作らせたとき）
 */
export interface ToolCallGeneration extends ResponseRecord {
  /** 思考の本文（応答にあれば。無ければ空） */
  readonly reasoning: string;
}

/**
 * LLM が返したワークフローの呼び出し 1 件（候補の呼び出しの列の 1 つ）。
 * 引数の本文と状態は最後の実行。実行し直したら、それまでの実行を `previousRuns` に古い順で残す
 */
export interface ToolCallRecord extends ToolCallRun {
  readonly id: string;
  /** ワークフロー名 */
  readonly name: string;
  readonly previousRuns?: readonly ToolCallRun[] | undefined;
  /** 作らせた呼び出しだけ（会話の応答が返した呼び出しは候補の記録を見る） */
  readonly generation?: ToolCallGeneration | undefined;
}

/** 本文の候補（Swipe）。`user` は 1 つだけ、`assistant` は生成し直すたびに増える */
export interface Candidate {
  readonly content: string;
  /** 思考の本文（応答にあれば）。送り返さない */
  readonly reasoning: string;
  readonly end: CandidateEnd;
  readonly usage?: TokenUsage | undefined;
  /** 受け取り中に届いた `finish_reason`。受け取りを終えるときに終わり方へ移す */
  readonly finishReason?: string | undefined;
  /**
   * 受け取りの記録（`assistant` だけ。受け取り終えたときに測れたものだけ）
   */
  readonly timing?: ResponseTiming | undefined;
  /**
   * Web 検索・取得の回数と費用（`assistant` だけ。返ったものだけ）
   */
  readonly billing?: ToolBilling | undefined;
  /**
   * 出典（`assistant` だけ。URL は重ならない。届いた順。無ければ持たない）
   */
  readonly citations?: readonly Citation[] | undefined;
  /** ワークフローの呼び出しの列（`assistant` だけ）。無ければ持たない */
  readonly toolCalls?: readonly ToolCallRecord[] | undefined;
  /**
   * 送るときの見積もり（補正なし。ワークフローの定義を含む）。補正の比に使う
   */
  readonly sentEstimate?: number | undefined;
  /**
   * 上限に収めるため外した履歴の件数（外したときだけ）
   */
  readonly trimmed?: number | undefined;
  /**
   * 添えた画像（データ URL。`user` だけ。無ければ持たない）
   */
  readonly images?: readonly string[] | undefined;
  /**
   * 指示で作り直した候補の、土台と指示（`assistant` だけ）。無ければ持たない
   */
  readonly revision?: CandidateRevision | undefined;
}

/**
 * 指示で作り直した候補が、どの候補を土台に何の指示で作られたか
 */
export interface CandidateRevision {
  /** 土台にした候補の番号 */
  readonly base: number;
  readonly instruction: string;
}

/** 発言の話し手。会話の発言は利用者とアシスタントだけ */
export type MessageRole = 'user' | 'assistant';

/** 会話の発言 1 件。本文の候補を並べ、選んでいる 1 つを送る */
export interface ChatMessage {
  readonly id: string;
  readonly role: MessageRole;
  readonly candidates: readonly Candidate[];
  /** 選んでいる候補の番号。いつも候補の列の中を指す */
  readonly selected: number;
  /**
   * プレイブックの操作で送ったときの指示（`user` だけ）。その発言に続く応答を
   * 受け取るときだけ履歴の末尾に置く。無ければ持たない
   */
  readonly instruction?: PlaybookInstruction | undefined;
}

// ─────────────────────────────
// プロンプトの構成。SillyTavern の Chat Completion プリセットの `prompts` と `prompt_order` に当たる
// ─────────────────────────────

/** プロンプトの項目を送るときの役割 */
export type PromptRole = 'system' | 'user' | 'assistant';

/**
 * 印の種類。中身は別の場所から来る。`currentInput`（メッセージ）と `additionalInfo`（追加辞書の印。
 * 当たった追加辞書の項目の置き場）は SillyTavern に無い KisaraUI の追加
 */
export type PromptMarker =
  | 'chatHistory'
  | 'currentInput'
  | 'additionalInfo'
  | 'personaDescription'
  | 'charDescription'
  | 'charPersonality'
  | 'scenario'
  | 'dialogueExamples';

/** 並びのとおりか、会話の履歴の深さ N（0 は最後の発言の後）。同じ深さでは `order` の小さい方が先 */
export type PromptPosition =
  | { readonly kind: 'relative' }
  | { readonly kind: 'depth'; readonly depth: number; readonly order: number };

/** プロンプトの項目。`marker` があれば印で、`content` は使わない */
export interface PromptItem {
  /** 構成の中で一意。SillyTavern の `identifier` */
  readonly id: string;
  /** 空なら既定の名前（id か印から引く）を出す */
  readonly name: string;
  readonly role: PromptRole;
  readonly marker: PromptMarker | null;
  readonly content: string;
  readonly enabled: boolean;
  readonly position: PromptPosition;
}

/** 会話 1 つのプロンプトの構成。項目の並びとプレフィル */
export interface PromptComposition {
  readonly items: readonly PromptItem[];
  /** 最後に `assistant` として置く書き始め（プレフィル） */
  readonly prefill: { readonly content: string; readonly enabled: boolean };
  /** プリセットの `system_prompt`・`post_history_instructions` で `main`・`jailbreak` を置き換えるか */
  readonly usePresetOverrides: boolean;
  /**
   * 当たったロアを包む前置き・後置き。どちらも空なら持たない
   */
  readonly loreFraming?: LoreFraming | undefined;
}

/**
 * 当たったロアを包む文面。空なら付けない
 */
export interface LoreFraming {
  readonly prefix: string;
  readonly suffix: string;
}

/**
 * 利用者の情報（SillyTavern の Persona）。名前は `{{user}}` に、説明は
 * Persona Description の項目に入る
 */
export interface Persona {
  readonly name: string;
  readonly description: string;
}

/**
 * 会話が持つ、保存済みの 1 件へのリンク。名前は見つからないときに出す
 */
export interface UnitLink {
  readonly id: string;
  readonly name: string;
}

/**
 * 自分で足す変数。名前はいつも `{{名前}}` の形で持つ（`normalizeVariableName`）。
 * `{{user}}`・`{{char}}` はここに持たない（利用者の情報の名前とアシスタント名が値）
 */
export interface ChatVariable {
  /** 行の識別（画面の並びの key） */
  readonly id: string;
  readonly name: string;
  readonly value: string;
  /**
   * 戻すの行か。`name` が送る文字、`value` が元の文字で、送るときは元の文字を送る文字に替え、画面でだけ
   * 元の文字に戻す（画面の欄は左が `value`・右が `name`）。無ければ送る前に `name` を `value` に
   * 置き換える
   */
  readonly restore?: true;
}

/**
 * プリセット・会話の写しが持つ文字の欄。キャラクターカードを読むときは
 * カードの項目をここへ移す
 */
export interface CharacterFields {
  /** アシスタント名。`{{char}}` の置き換えと画面の名前（プリセットの名前とは別） */
  readonly name: string;
  readonly description: string;
  readonly personality: string;
  readonly scenario: string;
  /** 会話の例（`<START>` の区切りも含む） */
  readonly mesExample: string;
  /** 最初の発言と別の挨拶（会話を始めるときに写す） */
  readonly firstMes: string;
  readonly alternateGreetings: readonly string[];
  /** 作者コメント（`creator_notes`。送らない） */
  readonly creatorNotes: string;
  /** 構成の `main`・`jailbreak` の本文の置き換え */
  readonly systemPrompt: string;
  readonly postHistoryInstructions: string;
  /** 自分で足した変数。無ければ持たない */
  readonly variables?: readonly ChatVariable[] | undefined;
}

/**
 * アバターの画像。端末のアバターの表に 1 枚 1 件。プリセットは id で指す
 */
export interface Avatar {
  readonly id: string;
  readonly name: string;
  readonly image: Blob;
  /** 中身の SHA-256（16 進）。同じ画像を二重に足さない */
  readonly hash: string;
  readonly createdAt: number;
}

/**
 * プリセット（会話に写す文字の欄の組）。個別追加辞書は中に持ち、画像は
 * アバターの表に置いて id で指す。会話は写すときに欄と辞書の中身と画像の id を写す
 */
export interface Preset {
  readonly id: string;
  readonly name: string;
  readonly fields: CharacterFields;
  /** アバターの id。指す先が無ければ画像なしとして扱う */
  readonly imageId: string | null;
  /**
   * 個別追加辞書の並び。無ければ空。会話で切った印は持たない
   */
  readonly lorebooks: readonly OwnLorebook[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** 会話 1 件の中身。構成・写した欄・発言の列を持ち、置き場に 1 件で残る */
export interface Chat {
  readonly name: string;
  /** この会話だけのプロンプトの構成 */
  readonly prompt: PromptComposition;
  /** 写したプリセットの印（どのプリセットから写したか。送るのには使わない）。無ければ null */
  readonly preset: UnitLink | null;
  /**
   * プリセットの文字の欄の写し。送る中身はここから組む。無ければ null
   */
  readonly character: CharacterFields | null;
  /** 利用者の情報（この会話だけ）。無ければ null */
  readonly persona: Persona | null;
  readonly messages: readonly ChatMessage[];
  /**
   * 古い発言を縮めた要約。無ければ持たない
   */
  readonly summary?: ChatSummary | undefined;
  /**
   * プレイブック（どれかと今のフェーズ）。選んでいなければ持たない
   */
  readonly playbook?: ChatPlaybookRef | undefined;
  /**
   * 個別追加辞書の並び。プリセットを選んだときに中身を写し、以後プリセットを
   * 読まない。空は辞書なし。1 冊ずつ、この会話で当てないかを持つ。持たないのは写す前からの会話で、
   * リンクしたプリセットの辞書を読む
   */
  readonly lorebooks?: readonly OwnLorebook[] | undefined;
  /**
   * アバターの id。写し方は `lorebooks` と同じ（中身でなく id を写す）
   */
  readonly imageId?: string | null | undefined;
  /** 作った時刻（ms）。分からなければ 0 */
  readonly createdAt: number;
  /** 最後に変えた時刻（ms）。メッセージ・名前・設定を変えたときに進める。開いただけでは進めない */
  readonly updatedAt: number;
}

/**
 * 会話履歴の要約。`upTo` の発言（その id）までを縮めた本文
 */
export interface ChatSummary {
  readonly content: string;
  readonly upTo: string;
  /**
   * 要約を作った応答の記録（無ければ持たない）
   */
  readonly response?: ResponseRecord | undefined;
}

/**
 * 会話の置き場。ブラウザ・ComfyUI・両方のどれか。両方に置いた会話も、
 * 内部識別子（会話の id）が同じなら 1 つの会話として扱う
 */
export type ChatPlace =
  | { readonly kind: 'browser' }
  | { readonly kind: 'comfy'; readonly baseUrl: string }
  | { readonly kind: 'both'; readonly baseUrl: string };

export const BROWSER_PLACE: ChatPlace = { kind: 'browser' };

/** 置き場にブラウザを含むか */
export function inBrowser(place: ChatPlace): boolean {
  return place.kind !== 'comfy';
}

/** 置き場に含む ComfyUI の接続先。含まなければ null */
export function comfyUrlOf(place: ChatPlace): string | null {
  return place.kind === 'browser' ? null : place.baseUrl;
}

/** ブラウザと ComfyUI のそれぞれに置いてあるかから、置き場を組み立てる */
export function placeFrom(browser: boolean, comfyUrl: string | null): ChatPlace {
  if (comfyUrl === null) return BROWSER_PLACE;
  return browser ? { kind: 'both', baseUrl: comfyUrl } : { kind: 'comfy', baseUrl: comfyUrl };
}

/**
 * 一覧に出す項目。一覧は本文を読まずにこれだけを読む
 */
export interface ChatMeta {
  readonly id: string;
  readonly name: string;
  /** 最初の `user` の発言の頭 */
  readonly head: string;
  /** 置き場での大きさ（バイト） */
  readonly size: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** 接続の設定（Connection profile）。複数の会話から使う */
export interface ConnectionProfile {
  readonly id: string;
  /**
   * 設定を見分ける。ブラウザのパスワード管理の利用者名にもなる
   */
  readonly baseUrl: string;
  /**
   * 最後に接続したときにキーを入れていたか。開いた直後にキーが無ければ自動でつながない。
   * キーそのものは持たない（ゲートウェイが持つ）
   */
  readonly keyRequired: boolean;
  readonly defaultModel: string;
}

const RELATIVE: PromptPosition = { kind: 'relative' };

function marker(id: PromptMarker, role: PromptRole = 'system'): PromptItem {
  return { id, name: '', role, marker: id, content: '', enabled: true, position: RELATIVE };
}

/** 文面の項目のうち、既定の名前を持つものの id（SillyTavern の `identifier`） */
export const MAIN_PROMPT_ID = 'main';
export const POST_HISTORY_ID = 'jailbreak';
/**
 * 追加辞書の印の id（構成にいつも 1 つ）
 */
export const ADDITIONAL_INFO_ID = 'additionalInfo';

/**
 * 初めの構成。中身を外から入れる印（追加辞書・会話履歴・メッセージ）だけを
 * 置き、文面の項目は置かない（空から始めて、使う人が足す）
 */
export function defaultComposition(): PromptComposition {
  return {
    items: [marker(ADDITIONAL_INFO_ID), marker('chatHistory'), marker('currentInput', 'user')],
    prefill: { content: '', enabled: false },
    usePresetOverrides: true,
  };
}

export const EMPTY_CHAT: Chat = {
  name: '',
  prompt: defaultComposition(),
  preset: null,
  character: null,
  persona: null,
  messages: [],
  createdAt: 0,
  updatedAt: 0,
};

/** システムプロンプトのテンプレート（名前を付けて保存したシステムプロンプト） */
export interface SystemPromptTemplate {
  readonly id: string;
  readonly name: string;
  readonly content: string;
  /** 生成の設定（決めた項目と値）。選ぶと本文と一緒に会話に写す */
  readonly params: GenerationParams;
  readonly createdAt: number;
  readonly updatedAt: number;
}
