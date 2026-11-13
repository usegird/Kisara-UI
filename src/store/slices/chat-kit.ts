import type { StoreApi } from 'zustand';

import {
  characterOf,
  chatNameSources,
  loreMessages,
  loreSourcesOf,
  macroSourcesOf,
  type LoreLibrary,
} from '@/chat/chat-sources';
import { isStreaming } from '@/chat/edit';
import { chatLore, withLore, type LoreResult } from '@/chat/lore';
import type { PromptSources } from '@/chat/macros';
import { buildChatRequest } from '@/chat/request';
import type { SemanticHits } from '@/chat/semantic';
import { chatBytes, chatSizeLevel, type ChatSizeLevel } from '@/chat/size';
import { timingOf } from '@/chat/stream-receive';
import { estimateTools, inputLimitOf, type SendBudget } from '@/chat/tokens';
import type {
  Chat,
  ConnectionProfile,
  ResponseRecord,
  ToolCallRecord,
  ToolCallState,
} from '@/chat/types';
import type { WebTools } from '@/chat/web-tools';
import type {
  ChatCompletionRequest,
  ChatStreamEvent,
  TokenUsage,
  ToolBilling,
  ToolDefinition,
} from '@/port/llm-port';
import { currentLlmTarget, type LlmTarget } from '@/store/chat/llm-target';
import { chatPlaybookOf } from '@/store/chat/playbook-resolve';
import type { ChatState } from '@/store/use-chat-store';
import { useDictionariesStore } from '@/store/use-dictionaries-store';
import { contextLengthOf, useLlmProfilesStore } from '@/store/use-llm-profiles-store';
import type { ResponsePrice } from '@/store/use-response-stats-store';
import { useSemanticStore } from '@/store/use-semantic-store';
import { enabledDictionaryIds, useSettingsStore } from '@/store/use-settings-store';
import { webToolsFor } from '@/store/use-web-search-store';

// ─────────────────────────────
// 会話のストアの slice が共有する送る中身の材料（ロア・出どころ・要求の本文・費用の記録）と、
// 外から入れる受け口（送るワークフロー・受け取った呼び出しの受け手）。
// ─────────────────────────────

/**
 * 送るワークフローと、受け取った呼び出しの確かめ方。ワークフローのツールの
 * ストアが入れる（会話のストアからタブやワークフローを読まないため）。入るまでは何も送らない
 */
interface ChatToolProvider {
  /**
   * その会話で送るワークフロー（画像の引数の選択肢が会話ごとに変わる）
   */
  readonly definitions: (chat: Chat) => readonly ToolDefinition[];
  readonly check: (call: ToolCallRecord, chat: Chat) => ToolCallState;
}

/**
 * この画面で受け取り、確認を待つ呼び出しの受け手（実行の承諾の関門）。呼び出しの実行が入れる。
 * 受け取り終えたときにだけ渡すので、読み込み直して開いた会話の呼び出しは渡らない（勝手に実行しない）。
 * 入るまでは何もしない（確認を待たせたままにする）
 */
type FreshToolCallsReceiver = (
  chatId: string,
  messageId: string,
  calls: readonly ToolCallRecord[],
) => void;

/** 会話の候補の外で受け取る応答（呼び出しを作らせる・要約）の記録を取る口 */
interface ResponseRecorder {
  /** 受け取った知らせを 1 つずつ渡す */
  readonly observe: (event: ChatStreamEvent) => void;
  /** 届いた思考の本文 */
  readonly reasoning: () => string;
  /** 受け取り終えたときに呼び、残す記録を返す */
  readonly finish: () => ResponseRecord;
}

/**
 * ロアの当て方に足す条件。発動率を振る数は送るときだけ渡す。近似判定の
 * 当たりは、送るときは送る時点の結果、プロンプトのタブの見込みでは見込みの結果
 */
interface LoreSend {
  readonly roll?: () => number;
  readonly semantic: SemanticHits;
  /**
   * 入力欄に打ちかけている本文（プロンプトのタブの見込みだけ）。今回のメッセージとして見る範囲の
   * 末尾に入れて当てる（送るときは会話に入っているので渡さない）
   */
  readonly draft?: string | undefined;
}

/** 送る要求の材料（送るときと、プロンプトのタブの送る生データを表示で同じものを使う） */
export interface SendMaterials {
  readonly definitions: readonly ToolDefinition[];
  readonly web: WebTools | null;
  readonly budget: () => SendBudget;
}

/** 置き場に書けたかと会話（送るのを止めるかの判定に使う分） */
type BlockState = Pick<ChatState, 'saveStates' | 'chats'>;

let toolProvider: ChatToolProvider = {
  definitions: () => [],
  check: () => ({ kind: 'invalid', problem: { code: 'unknown-tool' } }),
};

let freshCallsReceiver: FreshToolCallsReceiver = () => undefined;

/** 送るワークフローと呼び出しの確かめ方を入れる（ワークフローのツールのストアが呼ぶ） */
export function provideChatTools(provider: ChatToolProvider): void {
  toolProvider = provider;
}

/** 入っている送るワークフローと呼び出しの確かめ方 */
export function chatToolsOf(): ChatToolProvider {
  return toolProvider;
}

/** 受け取った呼び出しの受け手を入れる（呼び出しの実行が呼ぶ） */
export function receiveFreshToolCalls(receiver: FreshToolCallsReceiver): void {
  freshCallsReceiver = receiver;
}

/** 受け取った呼び出しを、入っている受け手へ渡す */
export function passFreshToolCalls(
  chatId: string,
  messageId: string,
  calls: readonly ToolCallRecord[],
): void {
  freshCallsReceiver(chatId, messageId, calls);
}

/** 送る直前に呼ぶ（送った時刻と、送る時点のモデルの費用を控える） */
export function startResponseRecord(target: LlmTarget): ResponseRecorder {
  const price = responsePriceOf(target);
  const sentAt = performance.now();
  let firstAt: number | null = null;
  let reasoning = '';
  let usage: TokenUsage | undefined;
  let billing: ToolBilling | undefined;
  return {
    observe: (event) => {
      if ((event.kind === 'delta' || event.kind === 'tool-call') && firstAt === null) {
        firstAt = performance.now();
      }
      if (event.kind === 'delta') reasoning += event.reasoning;
      else if (event.kind === 'usage') usage = event.usage;
      else if (event.kind === 'billing') billing = event.billing;
    },
    reasoning: () => reasoning,
    finish: () => ({
      ...(usage === undefined ? {} : { usage }),
      timing: timingOf({ sentAt, firstAt, endedAt: performance.now() }, usage, price),
      ...(billing === undefined ? {} : { billing }),
    }),
  };
}

/** 送る時点のモデルの費用（1 トークンあたり。決まっていない負の値と、無いものは null） */
export function responsePriceOf(target: LlmTarget): ResponsePrice {
  const check =
    target.profileId === null ? undefined : useLlmProfilesStore.getState().checks[target.profileId];
  const prices = check?.kind === 'ok' ? (check.details[target.model]?.prices ?? []) : [];
  const usdOf = (name: string): number | null => {
    const usd = prices.find((price) => price.name === name && price.perToken)?.usd;
    return usd === undefined || usd < 0 ? null : usd;
  };
  return {
    prompt: usdOf('prompt'),
    completion: usdOf('completion'),
    cacheRead: usdOf('input_cache_read'),
    cacheWrite: usdOf('input_cache_write'),
  };
}

/** 全体で有効にした追加辞書と、辞書を使うか */
export function currentLoreLibrary(): LoreLibrary {
  const settings = useSettingsStore.getState();
  return {
    dictionaries: useDictionariesStore.getState().dictionaries,
    enabledIds: enabledDictionaryIds(settings),
    on: settings.loreDictionariesOn,
  };
}

/**
 * 送る中身に使える上限（文脈長 − 返答の分）。文脈長が分からなければ null
 */
export function currentInputLimit(): number | null {
  return inputLimitOf(currentContextLength(), useSettingsStore.getState().llmParams.max_tokens);
}

/** 送る要求の材料を、その会話と接続先から集める */
export function sendMaterials(chat: Chat, baseUrl: string): SendMaterials {
  const definitions = toolProvider.definitions(chat);
  return {
    definitions,
    web: webToolsFor(baseUrl, 'chat'),
    budget: () => ({ limit: currentInputLimit(), tools: estimateTools(definitions) }),
  };
}

/**
 * 送る要求の本文。送るときもプロンプトのタブの見込みも、ここだけで組み立てる
 */
export function requestOf(
  chat: Chat,
  target: LlmTarget,
  sources: PromptSources,
  send: { readonly materials: SendMaterials; readonly drop: number },
): ChatCompletionRequest {
  return buildChatRequest(
    chat,
    { model: target.model, params: useSettingsStore.getState().llmParams },
    sources,
    { tools: send.materials.definitions, drop: send.drop, web: send.materials.web },
  );
}

/**
 * 会話のロアを、送るときと同じ条件で当てる（プロンプトのタブの当たりの印にも使う）。発動率と
 * 近似判定は `send` を渡したときだけ使う（見込みでは振らない）
 */
export function chatLoreOf(
  chat: Chat,
  library: LoreLibrary = currentLoreLibrary(),
  context: number | null = currentContextLength(),
  send?: LoreSend,
): LoreResult {
  const sources = loreSourcesOf(chat, library);
  const names = chatNameSources(characterOf(chat), chat.persona);
  const messages = loreMessages(chat, send?.draft);
  return chatLore(sources, chat.prompt, names, {
    messages,
    context,
    roll: send?.roll,
    semantic: send?.semantic,
  });
}

/**
 * 送る中身の出どころ。欄は会話の写しから読み、ロアは会話が指す辞書と
 * 全体で有効にした辞書から当てる。プリセットが消えていても、写しと辞書の id で送る
 */
export function sourcesOf(
  chat: Chat,
  library: LoreLibrary = currentLoreLibrary(),
  send?: LoreSend,
): PromptSources {
  const lored = withLore(
    macroSourcesOf(chat),
    chatLoreOf(chat, library, currentContextLength(), send),
  );
  const description = chat.persona?.description ?? '';
  return {
    ...lored,
    squashSystem: useSettingsStore.getState().squashSystemMessages,
    systemPrompt: useSettingsStore.getState().llmSystemPrompt,
    // 会話は参照だけを持つので、送るたびに定義を引く
    playbook: chatPlaybookOf(chat),
    markerText: (marker) =>
      marker === 'personaDescription' ? description : lored.markerText(marker),
  };
}

/** 送れるか。全体の接続の設定（ベース URL つき）とモデルがあり、受け取り中でない */
export function canSend(
  chat: Chat | undefined,
  target: LlmTarget = currentLlmTarget(),
  profiles: readonly ConnectionProfile[] = useLlmProfilesStore.getState().profiles,
): boolean {
  if (chat === undefined || isStreaming(chat) || target.model.trim().length === 0) return false;
  return profiles.some(
    (profile) => profile.id === target.profileId && profile.baseUrl.trim().length > 0,
  );
}

/**
 * 送るのを止めているか。置き場の容量が足りない、または会話の大きさが上限を超えた。
 * 上限は設定の値（購読する側は自分で読んで渡す）
 */
export function isBlocked(
  state: BlockState,
  chatId: string,
  maxMegabytes: number = useSettingsStore.getState().chatMaxMegabytes,
): boolean {
  return (
    state.saveStates[chatId] === 'full' || chatSizeLevelOf(state, chatId, maxMegabytes) === 'full'
  );
}

/**
 * 会話の大きさの上限に対する段階。会話が無ければ `ok`
 */
export function chatSizeLevelOf(
  state: Pick<BlockState, 'chats'>,
  chatId: string,
  maxMegabytes: number,
): ChatSizeLevel {
  const chat = state.chats[chatId];
  return chat === undefined ? 'ok' : chatSizeLevel(chatBytes(chat), maxMegabytes);
}

/**
 * プロンプトのタブの追加辞書の見込みを作り直す。打ちかけの本文を見込みに写し、近似判定も
 * 会話履歴と打ちかけで比べ直す
 */
export function refreshLoreDraft(
  get: () => ChatState,
  set: StoreApi<ChatState>['setState'],
  chatId: string,
): void {
  const state = get();
  const chat = state.chats[chatId];
  if (chat === undefined) return;
  const draft = state.drafts[chatId] ?? '';
  if ((state.loreDrafts[chatId] ?? '') !== draft) {
    set({ loreDrafts: { ...state.loreDrafts, [chatId]: draft } });
  }
  const sources = loreSourcesOf(chat, currentLoreLibrary());
  useSemanticStore.getState().preview(chatId, sources, chat.messages, draft);
}

/** 会話のモデルの文脈長（ロアの予算・送る中身の上限に使う）。分からなければ null */
function currentContextLength(): number | null {
  const target = currentLlmTarget();
  const { checks, learned } = useLlmProfilesStore.getState();
  if (target.profileId === null) return null;
  return contextLengthOf(
    checks[target.profileId],
    target.model,
    learned[target.profileId]?.[target.model],
  );
}
