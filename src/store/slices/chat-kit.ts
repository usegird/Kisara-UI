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
import { expressionToolsFor } from '@/store/chat/expression-decide';
import { currentLlmTarget, type LlmTarget } from '@/store/chat/llm-target';
import { chatPlaybookOf } from '@/store/chat/playbook-resolve';
import type { ChatState } from '@/store/use-chat-store';
import { useDictionariesStore } from '@/store/use-dictionaries-store';
import { contextLengthOf, useLlmProfilesStore } from '@/store/use-llm-profiles-store';
import type { ResponsePrice } from '@/store/use-response-stats-store';
import { useSemanticStore } from '@/store/use-semantic-store';
import { enabledDictionaryIds, useSettingsStore } from '@/store/use-settings-store';
import { webToolsFor } from '@/store/use-web-search-store';

interface ChatToolProvider {
  readonly definitions: (chat: Chat) => readonly ToolDefinition[];
  readonly check: (call: ToolCallRecord, chat: Chat) => ToolCallState;
}

type FreshToolCallsReceiver = (
  chatId: string,
  messageId: string,
  calls: readonly ToolCallRecord[],
) => void;

interface ResponseRecorder {
  readonly observe: (event: ChatStreamEvent) => void;
  readonly reasoning: () => string;
  readonly finish: () => ResponseRecord;
}

interface LoreSend {
  readonly roll?: () => number;
  readonly semantic: SemanticHits;
  readonly draft?: string | undefined;
}

export interface SendMaterials {
  readonly definitions: readonly ToolDefinition[];
  readonly web: WebTools | null;
  readonly budget: () => SendBudget;
}

type BlockState = Pick<ChatState, 'saveStates' | 'chats'>;

let toolProvider: ChatToolProvider = {
  definitions: () => [],
  check: () => ({ kind: 'invalid', problem: { code: 'unknown-tool' } }),
};

let freshCallsReceiver: FreshToolCallsReceiver = () => undefined;

export function provideChatTools(provider: ChatToolProvider): void {
  toolProvider = provider;
}

export function chatToolsOf(): ChatToolProvider {
  return toolProvider;
}

export function receiveFreshToolCalls(receiver: FreshToolCallsReceiver): void {
  freshCallsReceiver = receiver;
}

export function passFreshToolCalls(
  chatId: string,
  messageId: string,
  calls: readonly ToolCallRecord[],
): void {
  freshCallsReceiver(chatId, messageId, calls);
}

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

export function currentLoreLibrary(): LoreLibrary {
  const settings = useSettingsStore.getState();
  return {
    dictionaries: useDictionariesStore.getState().dictionaries,
    enabledIds: enabledDictionaryIds(settings),
    on: settings.loreDictionariesOn,
  };
}

export function currentInputLimit(): number | null {
  return inputLimitOf(currentContextLength(), useSettingsStore.getState().llmParams.max_tokens);
}

export function sendMaterials(chat: Chat, baseUrl: string): SendMaterials {
  const definitions = [...toolProvider.definitions(chat), ...expressionToolsFor(chat)];
  return {
    definitions,
    web: webToolsFor(baseUrl, 'chat'),
    budget: () => ({ limit: currentInputLimit(), tools: estimateTools(definitions) }),
  };
}

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
    playbook: chatPlaybookOf(chat),
    markerText: (marker) =>
      marker === 'personaDescription' ? description : lored.markerText(marker),
  };
}

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

export function isBlocked(
  state: BlockState,
  chatId: string,
  maxMegabytes: number = useSettingsStore.getState().chatMaxMegabytes,
): boolean {
  return (
    state.saveStates[chatId] === 'full' || chatSizeLevelOf(state, chatId, maxMegabytes) === 'full'
  );
}

export function chatSizeLevelOf(
  state: Pick<BlockState, 'chats'>,
  chatId: string,
  maxMegabytes: number,
): ChatSizeLevel {
  const chat = state.chats[chatId];
  return chat === undefined ? 'ok' : chatSizeLevel(chatBytes(chat), maxMegabytes);
}

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
