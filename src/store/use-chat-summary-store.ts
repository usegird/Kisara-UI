import { create } from 'zustand';

import { endpointOf } from '@/chat/connection-profile';
import { isStreaming } from '@/chat/edit';
import { buildSummaryRequest } from '@/chat/request';
import { textWithDelta } from '@/chat/stream-receive';
import { fitSummaryRange, summaryMessages, summaryRange } from '@/chat/summary';
import { calibration } from '@/chat/tokens';
import type { LlmFailure } from '@/port/llm-port';
import { currentLlmTarget, learnOverflow } from '@/store/chat/llm-target';
import { llmPort } from '@/store/ports/llm-port';
import {
  currentInputLimit,
  sourcesOf,
  startResponseRecord,
  useChatStore,
} from '@/store/use-chat-store';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';
import { useSettingsStore } from '@/store/use-settings-store';

type ChatSummaryState =
  { readonly kind: 'running' } | { readonly kind: 'failed'; readonly failure: LlmFailure };

interface ChatSummaryStoreState {
  readonly states: Readonly<Record<string, ChatSummaryState>>;
  readonly summarize: (chatId: string) => Promise<void>;
}

const controllers = new Map<string, AbortController>();

export function canSummarize(chatId: string): boolean {
  const chat = useChatStore.getState().chats[chatId];
  if (chat === undefined || isStreaming(chat) || controllers.has(chatId)) return false;
  return summaryRange(chat) !== null;
}

export const useChatSummaryStore = create<ChatSummaryStoreState>()((set, get) => {
  const put = (chatId: string, state: ChatSummaryState | null): void => {
    const states = { ...get().states };
    if (state === null) delete states[chatId];
    else states[chatId] = state;
    set({ states });
  };

  return {
    states: {},

    summarize: async (chatId) => {
      const chat = useChatStore.getState().chats[chatId];
      const target = currentLlmTarget();
      const profile = useLlmProfilesStore
        .getState()
        .profiles.find((item) => item.id === target.profileId);
      const range = chat === undefined ? null : summaryRange(chat);
      if (chat === undefined || range === null || !canSummarize(chatId)) return;
      if (profile === undefined || target.model.trim().length === 0) {
        put(chatId, { kind: 'failed', failure: { kind: 'not-found' } });
        return;
      }
      const sources = sourcesOf(chat);
      const ratio = calibration(chat, chat.prompt, sources).ratio;
      const fitted = fitSummaryRange(chat, sources, range, { limit: currentInputLimit(), ratio });
      const upTo = chat.messages[fitted.to - 1]?.id;
      if (upTo === undefined) return;
      const controller = new AbortController();
      controllers.set(chatId, controller);
      put(chatId, { kind: 'running' });
      let text = '';
      const recorder = startResponseRecord(target);
      const result = await llmPort().streamChat(
        endpointOf(profile),
        buildSummaryRequest(summaryMessages(chat, sources, fitted), {
          model: target.model,
          params: useSettingsStore.getState().llmParams,
        }),
        {
          onEvent: (event) => {
            recorder.observe(event);
            if (event.kind === 'delta') text = textWithDelta(text, event);
          },
          signal: controller.signal,
        },
      );
      const response = recorder.finish();
      if (controllers.get(chatId) === controller) controllers.delete(chatId);
      if (!result.ok) {
        learnOverflow(target, result.failure);
        put(
          chatId,
          result.failure.kind === 'stopped' ? null : { kind: 'failed', failure: result.failure },
        );
        return;
      }
      const content = text.trim();
      const current = useChatStore.getState().chats[chatId];
      if (current === undefined || !current.messages.some((message) => message.id === upTo)) {
        put(chatId, null);
        return;
      }
      if (content.length === 0) {
        put(chatId, { kind: 'failed', failure: { kind: 'bad-response' } });
        return;
      }
      useChatStore.getState().update(chatId, { summary: { content, upTo, response } });
      put(chatId, null);
    },
  };
});
