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

// ─────────────────────────────
// 会話履歴の要約を作る。利用者が押したときだけ LLM に頼み、受け取った本文で会話の
// 要約を置き換える。要約している・失敗したの状態は会話の id ごとにメモリだけに持つ（残さない）
// ─────────────────────────────

/** 1 つの会話の要約の状態（している・失敗した） */
type ChatSummaryState =
  { readonly kind: 'running' } | { readonly kind: 'failed'; readonly failure: LlmFailure };

interface ChatSummaryStoreState {
  readonly states: Readonly<Record<string, ChatSummaryState>>;
  /** 次に縮められる発言を要約する。縮めるものが無い・受け取り中・要約している間は何もしない */
  readonly summarize: (chatId: string) => Promise<void>;
}

/** 要約している要求。会話ごとに 1 つ */
const controllers = new Map<string, AbortController>();

/** 要約できるか（縮める発言があり、受け取り中でも要約している間でもない） */
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
      // 渡す分は上限に収まるだけにする（残りはもう一度押して縮める）
      const ratio = calibration(chat, chat.prompt, sources).ratio;
      const fitted = fitSummaryRange(chat, sources, range, { limit: currentInputLimit(), ratio });
      const upTo = chat.messages[fitted.to - 1]?.id;
      if (upTo === undefined) return;
      const controller = new AbortController();
      controllers.set(chatId, controller);
      put(chatId, { kind: 'running' });
      let text = '';
      // 要約を作った応答の記録（「要約する」の右の i に出す）
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
      // 要約している間に縮めた発言が消えたら、置き換えない
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
