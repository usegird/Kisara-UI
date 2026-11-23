import type { StoreApi } from 'zustand';

import { prefillText } from '@/chat/assemble';
import { loreSourcesOf } from '@/chat/chat-sources';
import { endpointOf } from '@/chat/connection-profile';
import { type PromptSources } from '@/chat/macros';
import { NO_SEMANTIC_HITS } from '@/chat/semantic';
import {
  applyStreamEvents,
  finishStream,
  receivedNothing,
  recordSend,
  recordTiming,
  startWithPrefill,
  timingOf,
} from '@/chat/stream-receive';
import { planSend, ratioOf } from '@/chat/tokens';
import { lastToolCalls } from '@/chat/tool-calls';
import type { Chat, ConnectionProfile, ToolCallRecord, ToolCallState } from '@/chat/types';
import type { ChatStreamEvent, LlmFailure, LlmResult } from '@/port/llm-port';
import { decideExpressionLater, settleExpressionCalls } from '@/store/chat/expression-decide';
import { currentLlmTarget, learnOverflow, type LlmTarget } from '@/store/chat/llm-target';
import { llmPort } from '@/store/ports/llm-port';
import { tagSentRequest } from '@/store/ports/llm-sent-log';
import {
  canSend,
  chatToolsOf,
  currentLoreLibrary,
  isBlocked,
  passFreshToolCalls,
  requestOf,
  responsePriceOf,
  sendMaterials,
  sourcesOf,
  type SendMaterials,
} from '@/store/slices/chat-kit';
import type { ChatState } from '@/store/use-chat-store';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';
import { responseKey, useResponseStatsStore } from '@/store/use-response-stats-store';
import { semanticHitsOf, useSemanticStore } from '@/store/use-semantic-store';

const FLUSH_FALLBACK_MS = 100;

const controllers = new Map<string, AbortController>();

const statsKeys = new Map<string, string>();

const pending = new Map<string, ChatStreamEvent[]>();
let cancelFlush: (() => void) | null = null;

type SendPlan = ReturnType<typeof planSend>;

interface ChatStream {
  readonly change: (chatId: string, next: Chat | null) => boolean;
  readonly start: (chatId: string, next: Chat | null) => void;
  readonly sendable: (chatId: string) => Chat | null;
}

interface StreamKit {
  readonly get: () => ChatState;
  readonly change: ChatStream['change'];
  readonly flush: () => void;
  readonly receive: (chatId: string, event: ChatStreamEvent) => void;
}

interface StreamSend {
  readonly chatId: string;
  readonly chat: Chat;
  readonly target: LlmTarget;
  readonly profile: ConnectionProfile;
  readonly sources: PromptSources;
  readonly materials: SendMaterials;
  readonly key: string | null;
  readonly prefill: string;
  readonly signal: AbortSignal;
}

export function createChatStream(
  set: StoreApi<ChatState>['setState'],
  get: () => ChatState,
): ChatStream {
  const change: ChatStream['change'] = (chatId, next) => {
    const { chats } = get();
    if (next === null || chats[chatId] === undefined) return false;
    set({ chats: { ...chats, [chatId]: { ...next, updatedAt: Date.now() } } });
    return true;
  };

  const flush = (): void => {
    cancelFlush?.();
    cancelFlush = null;
    const { chats } = get();
    let next: Record<string, Chat> | null = null;
    for (const [chatId, events] of pending) {
      const chat = chats[chatId];
      if (chat === undefined) continue;
      next ??= { ...chats };
      next[chatId] = applyStreamEvents(chat, events);
    }
    pending.clear();
    if (next !== null) set({ chats: next });
  };

  const receive = (chatId: string, event: ChatStreamEvent): void => {
    if (!noteReceived(chatId, event)) return;
    const list = pending.get(chatId);
    if (list === undefined) pending.set(chatId, [event]);
    else list.push(event);
    cancelFlush ??= scheduleFrame(flush);
  };

  const kit: StreamKit = { get, change, flush, receive };
  return {
    change,
    start: (chatId, next) => {
      if (change(chatId, next)) void stream(kit, chatId);
    },
    sendable: (chatId) => {
      const chat = get().chats[chatId];
      return canSend(chat) && chat !== undefined && !isBlocked(get(), chatId) ? chat : null;
    },
  };
}

export function abortStream(chatId: string): void {
  controllers.get(chatId)?.abort();
}

export function forgetStream(chatId: string): void {
  controllers.get(chatId)?.abort();
  controllers.delete(chatId);
  pending.delete(chatId);
}

async function stream(kit: StreamKit, chatId: string): Promise<void> {
  const chat = kit.get().chats[chatId];
  const target = currentLlmTarget();
  const profile = useLlmProfilesStore
    .getState()
    .profiles.find((item) => item.id === target.profileId);
  if (chat === undefined || profile === undefined) {
    const failure: LlmFailure = { kind: 'not-found' };
    if (chat !== undefined) kit.change(chatId, finishStream(chat, failure));
    return;
  }
  const prefill = prefillText(chat.prompt, sourcesOf(chat));
  kit.change(chatId, startWithPrefill(chat, prefill));
  const controller = new AbortController();
  controllers.set(chatId, controller);
  const materials = sendMaterials(chat, profile.baseUrl);
  const scoring = semanticHitsOf(loreSourcesOf(chat, currentLoreLibrary()), chat.messages);
  const semantic = scoring === null ? NO_SEMANTIC_HITS : await scoring;
  if (scoring !== null) useSemanticStore.getState().setPreview(chatId, semantic);
  const sources = sourcesOf(chat, undefined, { roll: Math.random, semantic });
  const key = startStats(kit, chatId, target, materials.web !== null);
  const send = { chatId, chat, target, profile, sources, materials, key, prefill };
  const result = await sendFitting(kit, { ...send, signal: controller.signal });
  if (controllers.get(chatId) === controller) controllers.delete(chatId);
  if (key !== null) {
    useResponseStatsStore.getState().end(key, performance.now());
    if (statsKeys.get(chatId) === key) statsKeys.delete(chatId);
  }
  kit.flush();
  finishReceived(kit, { chatId, chat, key }, result);
}

function startStats(
  kit: StreamKit,
  chatId: string,
  target: LlmTarget,
  web: boolean,
): string | null {
  const receiving = kit.get().chats[chatId]?.messages.at(-1);
  const key =
    receiving === undefined ? null : responseKey(chatId, receiving.id, receiving.selected);
  if (key === null) return null;
  statsKeys.set(chatId, key);
  useResponseStatsStore.getState().start(key, responsePriceOf(target), performance.now(), web);
  return key;
}

async function sendFitting(kit: StreamKit, send: StreamSend): Promise<LlmResult<null>> {
  const { chatId, chat, sources, materials } = send;
  let plan = planSend({ chat, composition: chat.prompt, sources }, materials.budget());
  for (let attempt = 0; ; attempt += 1) {
    const result = await sendOnce(kit, send, plan);
    if (result.ok || attempt > 0) return result;
    const overflow = result.failure.overflow;
    if (overflow === undefined) return result;
    learnOverflow(send.target, result.failure);
    kit.flush();
    const current = kit.get().chats[chatId];
    if (current === undefined || !receivedNothing(current, send.prefill)) return result;
    const ratio = overflow.prompt === null ? undefined : ratioOf(overflow.prompt, plan.estimate);
    const next = planSend({ chat, composition: chat.prompt, sources }, materials.budget(), ratio);
    if (next.drop <= plan.drop) return result;
    plan = next;
  }
}

function sendOnce(kit: StreamKit, send: StreamSend, plan: SendPlan): Promise<LlmResult<null>> {
  const { chatId, key } = send;
  const sending = kit.get().chats[chatId];
  if (sending !== undefined) kit.change(chatId, recordSend(sending, plan.estimate, plan.drop));
  const request = requestOf(send.chat, send.target, send.sources, {
    materials: send.materials,
    drop: plan.drop,
  });
  if (key !== null) tagSentRequest(request, key);
  return llmPort().streamChat(endpointOf(send.profile), request, {
    onEvent: (event) => kit.receive(chatId, event),
    signal: send.signal,
  });
}

function finishReceived(
  kit: StreamKit,
  sent: { readonly chatId: string; readonly chat: Chat; readonly key: string | null },
  result: LlmResult<null>,
): void {
  const { chatId, key } = sent;
  const times = key === null ? undefined : useResponseStatsStore.getState().stats[key];
  const received = kit.get().chats[chatId];
  if (received !== undefined && times !== undefined) {
    kit.change(
      chatId,
      recordTiming(received, (candidate) => timingOf(times, candidate.usage, times.price)),
    );
  }
  const current = kit.get().chats[chatId];
  if (current === undefined) return;
  const check = (call: ToolCallRecord): ToolCallState => chatToolsOf().check(call, current);
  const settled = settleExpressionCalls(sent.chat, current);
  kit.change(chatId, finishStream(settled, result.ok ? null : result.failure, check));
  const finished = kit.get().chats[chatId];
  const last = finished?.messages.at(-1);
  if (finished === undefined || last === undefined) return;
  decideExpressionLater(finished, (update) => {
    const latest = kit.get().chats[chatId];
    if (latest !== undefined) kit.change(chatId, update(latest));
  });
  const before = new Set(lastToolCalls(sent.chat).map((call) => call.id));
  const waiting = lastToolCalls(finished).filter(
    (call) => call.state.kind === 'waiting' && !before.has(call.id),
  );
  if (waiting.length > 0) passFreshToolCalls(chatId, last.id, waiting);
}

function noteReceived(chatId: string, event: ChatStreamEvent): boolean {
  const key = statsKeys.get(chatId);
  if (key !== undefined && event.kind === 'delta' && (event.content || event.reasoning)) {
    const at = performance.now();
    useResponseStatsStore.getState().first(key, at);
    useResponseStatsStore.getState().resume(key, at);
  }
  if (event.kind !== 'processing') return true;
  if (key !== undefined) useResponseStatsStore.getState().processing(key, performance.now());
  return false;
}

function scheduleFrame(callback: () => void): () => void {
  let done = false;
  const run = (): void => {
    if (done) return;
    done = true;
    cancel();
    callback();
  };
  const timer = globalThis.setTimeout(run, FLUSH_FALLBACK_MS);
  const frame =
    typeof globalThis.requestAnimationFrame === 'function'
      ? globalThis.requestAnimationFrame(run)
      : null;
  const cancel = (): void => {
    done = true;
    globalThis.clearTimeout(timer);
    if (frame !== null) globalThis.cancelAnimationFrame(frame);
  };
  return cancel;
}
