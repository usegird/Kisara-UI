import { create } from 'zustand';

import type { LoreLibrary } from '@/chat/chat-sources';
import { appendTurn, isStreaming } from '@/chat/edit';
import type { PlaybookInstruction } from '@/chat/playbook';
import type { PlaybookChat, PlaybookPatch } from '@/chat/playbook-outline';
import type { SemanticHits } from '@/chat/semantic';
import { planSend } from '@/chat/tokens';
import type {
  Chat,
  ChatMessage,
  ChatPlace,
  PromptComposition,
  ToolCallGeneration,
  ToolCallState,
} from '@/chat/types';
import type { ChatCompletionRequest, LlmFailure } from '@/port/llm-port';
import { currentLlmTarget } from '@/store/chat/llm-target';
import { createChatDraftSlice } from '@/store/slices/chat-drafts';
import { refreshLoreDraft, requestOf, sendMaterials, sourcesOf } from '@/store/slices/chat-kit';
import { createChatMessageSlice } from '@/store/slices/chat-messages';
import { createChatOpenSlice } from '@/store/slices/chat-open';
import { createChatSendSlice } from '@/store/slices/chat-send';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';

export {
  canSend,
  chatLoreOf,
  chatSizeLevelOf,
  currentInputLimit,
  isBlocked,
  provideChatTools,
  receiveFreshToolCalls,
  sourcesOf,
  startResponseRecord,
} from '@/store/slices/chat-kit';

// ─────────────────────────────
// 開いている会話の中身（タブで開いている分だけ。鍵は会話の id でタブの id とは別）と、送る・受け取る。
// 置き場に書くのは chat-persist.ts で、書けたか（`saveStates`）もそこが入れる。
// ─────────────────────────────

/** 置き場に書けたか。`full` は容量の不足で書けない（送るのを止める） */
type ChatSaveState = 'saved' | 'unsaved' | 'full';

/**
 * タブで開いた会話を、まだ持っていない理由
 */
export type ChatPending =
  | { readonly kind: 'loading' }
  | { readonly kind: 'waiting'; readonly baseUrl: string; readonly both?: boolean }
  | { readonly kind: 'elsewhere' }
  | { readonly kind: 'missing' }
  /**
   * 置き場の会話が壊れている。クリアするまで開かない
   */
  | { readonly kind: 'broken' }
  /**
   * 読み込みの例外（一時的な失敗）。空の会話で始めない
   */
  | { readonly kind: 'failed' };

/**
 * 入力欄の上の指示の枠。どの操作の指示かと、枠で直せる本文
 */
interface DraftDirection {
  readonly instruction: PlaybookInstruction;
  readonly text: string;
}

/**
 * 呼び出しを作らせたのに返らなかった 1 回の記録（失敗の行に出す。残さない）
 */
export interface ToolCallAttempt {
  /** 送った中身を引く鍵の id（`callRequestKey` の呼び出しの id の位置に使う） */
  readonly id: string;
  readonly generation: ToolCallGeneration;
  /** LLM が書いた本文（無ければ空） */
  readonly text: string;
}

/** 開いている会話の中身・打ちかけ・受け取りの状態と、会話の操作（slice が操作を分けて持つ） */
export interface ChatState {
  readonly chats: Readonly<Record<string, Chat>>;
  /** 開いている会話の置き場。無ければブラウザ */
  readonly places: Readonly<Record<string, ChatPlace>>;
  readonly saveStates: Readonly<Record<string, ChatSaveState>>;
  /** タブで開いたが、まだ中身を持っていない会話（ComfyUI につないでいない・ほかで開いている） */
  readonly pending: Readonly<Record<string, ChatPending>>;
  /** ブラウザの置き場の使った量が上限の 80% を超えている */
  readonly nearFull: boolean;
  /** 打ちかけの本文（タブの控え。端末には残さない） */
  readonly drafts: Readonly<Record<string, string>>;
  /**
   * 打ちかけに添えた画像（データ URL。タブの控え。端末には残さない）
   */
  readonly draftImages: Readonly<Record<string, readonly string[]>>;
  /**
   * プレイブックの操作で入力欄の上の指示の枠に入れた指示。本文は枠で
   * 直せ、送ると打ちかけと一緒に `<direction>` で囲んでその操作として送る。外したか送ったら消す。
   * 端末には残さない
   */
  readonly draftDirections: Readonly<Record<string, DraftDirection>>;
  /**
   * プレイブックの操作で入れた指示に添えてあった送らない注記（`<comment>` の中身）。入力欄の上の
   * 注記の枠に読むだけで出し、送らない。外したか送ったら消す。端末には残さない
   */
  readonly draftNotes: Readonly<Record<string, string>>;
  /**
   * プロンプトのタブの追加辞書の見込みに使う打ちかけの本文。改行したとき・空にしたとき・
   * 入力欄から焦点が外れたときだけ写す（打つたびには当て直さない）。端末には残さない
   */
  readonly loreDrafts: Readonly<Record<string, string>>;

  /**
   * 新しい会話（ブラウザに置く）。接続の設定・モデル・生成の設定は全体のものを使う
   */
  readonly add: () => string;
  /** 読み戻した・読み込んだ会話を置く */
  readonly put: (chatId: string, chat: Chat, place?: ChatPlace) => void;
  /** 中身をまだ持っていない理由を置く（null で外す） */
  readonly setPending: (chatId: string, pending: ChatPending | null) => void;
  /** 開いている会話を手放す（受け取り中なら止める）。置き場からは消さない */
  readonly unload: (chatId: string) => void;
  readonly setPlace: (chatId: string, place: ChatPlace) => void;
  readonly setSaveState: (chatId: string, state: ChatSaveState) => void;
  readonly setNearFull: (nearFull: boolean) => void;
  readonly update: (chatId: string, patch: Partial<Omit<Chat, 'messages'>>) => void;
  /**
   * プロンプトの構成を直す。`edit` が null を返せば何もしない
   */
  readonly updatePrompt: (
    chatId: string,
    edit: (composition: PromptComposition) => PromptComposition | null,
  ) => void;
  /**
   * 会話のプレイブック（参照と今のフェーズ）とプレイブックの辞書を一緒に直す。
   * `edit` が null を返せば何もしない。プレイブックが無ければ何もしない
   */
  readonly updatePlaybookChat: (
    chatId: string,
    edit: (chat: PlaybookChat) => PlaybookPatch | null,
  ) => void;
  /** プレイブックを選ぶ（プレイブックの辞書と一緒に）・外す（null。プレイブックの辞書は残す） */
  readonly setPlaybook: (chatId: string, patch: PlaybookPatch | null) => void;
  /**
   * プレイブックの指示を送る。`parts` の後ろに打ちかけの本文を足し、
   * `<direction>` で囲んだ発言にする。`parts` も打ちかけも空なら送らない
   */
  readonly sendDirection: (
    chatId: string,
    parts: readonly string[],
    instruction: PlaybookInstruction,
  ) => void;
  /**
   * プレイブックの操作の指示を入力欄の上の指示の枠に入れる（送らない）。打ちかけは
   * そのまま残し、どの操作かを覚える。枠があれば置き換える
   */
  readonly fillDirection: (
    chatId: string,
    parts: readonly string[],
    instruction: PlaybookInstruction,
  ) => void;
  /** 指示の枠の本文を直す */
  readonly setDirectionText: (chatId: string, text: string) => void;
  /** 指示の枠を外す */
  readonly clearDirection: (chatId: string) => void;
  readonly setDraft: (chatId: string, text: string) => void;
  /** 注記の枠に出す注記を置く（null で外す） */
  readonly setDraftNote: (chatId: string, note: string | null) => void;
  /** 打ちかけに画像を添える（末尾に足す） */
  readonly addDraftImages: (chatId: string, images: readonly string[]) => void;
  /** 打ちかけに添えた画像を 1 つ外す */
  readonly removeDraftImage: (chatId: string, index: number) => void;
  /** 打ちかけの本文と添えた画像を送る（どちらかがあれば送る） */
  readonly send: (chatId: string) => void;
  readonly regenerate: (chatId: string) => void;
  /** 失敗した応答をその候補に受け取り直す（失敗していなければ生成し直す） */
  readonly retry: (chatId: string) => void;
  /**
   * 呼び出しだけを返した最後の応答に、同じ候補で本文を書かせる
   */
  readonly writeReply: (chatId: string) => void;
  /** そのメッセージの手前まで会話を戻し、その本文を入力欄へ写す（生成はしない） */
  readonly rollback: (chatId: string, messageId: string) => void;
  readonly stop: (chatId: string) => void;
  /** 発言と要約を消す（会話をクリア）。受け取り中なら何もしない */
  readonly clear: (chatId: string) => void;
  readonly selectCandidate: (chatId: string, messageId: string, index: number) => void;
  readonly updateMessage: (chatId: string, messageId: string, content: string) => void;
  readonly removeMessage: (chatId: string, messageId: string) => void;
  /**
   * 直前の応答がその本文だったことにする（初期メッセージのセット）
   */
  readonly respondWith: (chatId: string, contents: readonly string[], selected: number) => void;
  /**
   * ワークフローの呼び出しの状態を変える。LLM の続きは受け取らない
   */
  readonly setToolCall: (
    chatId: string,
    messageId: string,
    callId: string,
    state: ToolCallState,
  ) => void;
  /**
   * 選んだワークフローの呼び出しを LLM に作らせ、その発言の選んでいる候補に足す（「ワークフローを
   * 実行」を押したときだけ呼ぶ）。足した呼び出しの id か、失敗の理由を返す。LLM が応えたのに
   * 呼び出しが返らなかったときは、その 1 回の記録も返す
   */
  readonly requestToolCall: (
    chatId: string,
    messageId: string,
    name: string,
  ) => Promise<
    | { readonly ok: true; readonly callIds: readonly string[] }
    | {
        readonly ok: false;
        readonly failure: LlmFailure;
        readonly attempt?: ToolCallAttempt | undefined;
      }
  >;
  /**
   * 呼び出しを `args` の引数で実行し直す準備をする（承諾を待つ状態にする）
   */
  readonly restartToolCall: (
    chatId: string,
    messageId: string,
    callId: string,
    args: string,
  ) => void;
}

/** 送る生データを表示で、まだ送っていない今回のメッセージの id（会話には入らない） */
const PREVIEW_USER_ID = ':preview-user';
const PREVIEW_ASSISTANT_ID = ':preview-assistant';

export const useChatStore = create<ChatState>()((...store) => ({
  chats: {},
  places: {},
  saveStates: {},
  pending: {},
  nearFull: false,
  drafts: {},
  draftImages: {},
  draftDirections: {},
  draftNotes: {},
  loreDrafts: {},
  ...createChatOpenSlice(...store),
  ...createChatDraftSlice(...store),
  ...createChatSendSlice(...store),
  ...createChatMessageSlice(...store),
}));

/**
 * 次に送る要求の本文（プロンプトのタブの「送る生データを表示」）。送るときと同じ材料と組み立てを使い、
 * 入力欄の文か添えた画像があれば今回のメッセージとして入れる。受け取り中なら今送っている会話のもの。
 * 発動率は振らない（当たりを全部入れる）。近似判定は渡した見込みの結果を使う
 */
export function previewSendRequest(
  chatId: string,
  library: LoreLibrary,
  semantic: SemanticHits,
): ChatCompletionRequest | null {
  const state = useChatStore.getState();
  const chat = state.chats[chatId];
  if (chat === undefined) return null;
  const next = previewChatOf(chat, state.drafts[chatId] ?? '', state.draftImages[chatId] ?? []);
  const target = currentLlmTarget();
  const profile = useLlmProfilesStore
    .getState()
    .profiles.find((item) => item.id === target.profileId);
  const materials = sendMaterials(next, profile?.baseUrl ?? '');
  const sources = sourcesOf(next, library, { semantic });
  const drop = planSend({ chat: next, composition: next.prompt, sources }, materials.budget()).drop;
  return requestOf(next, target, sources, { materials, drop });
}

/**
 * プロンプトのタブの追加辞書の見込みを作り直す（改行したとき・空にしたとき・メッセージの入力欄から
 * 焦点が外れたとき）。打ちかけの本文を見込みに写し、近似判定も会話履歴と打ちかけで比べ直す。
 * 焦点を外さずに送ったときは、送るときに送る中身で当て直す
 */
export function refreshLorePreview(chatId: string): void {
  refreshLoreDraft(useChatStore.getState, useChatStore.setState, chatId);
}

/** 送る生データを表示で送る会話。受け取り中ならそのまま、打ちかけがあれば今回のメッセージを足す */
function previewChatOf(chat: Chat, text: string, images: readonly string[]): Chat {
  if (isStreaming(chat)) return chat;
  const typed = text.trim().length > 0 || images.length > 0;
  if (typed) {
    const turn = { text, userId: PREVIEW_USER_ID, assistantId: PREVIEW_ASSISTANT_ID, images };
    return appendTurn(chat, turn);
  }
  return { ...chat, messages: [...chat.messages, previewAssistant()] };
}

/** 打ちかけが無いときの、受け取る側の仮の `assistant`（手前までを送る形にそろえる） */
function previewAssistant(): ChatMessage {
  return {
    id: PREVIEW_ASSISTANT_ID,
    role: 'assistant',
    candidates: [{ content: '', reasoning: '', end: { kind: 'streaming' } }],
    selected: 0,
  };
}
