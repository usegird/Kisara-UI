import type { StateCreator } from 'zustand';

import { endpointOf } from '@/chat/connection-profile';
import { editMessage, isStreaming, removeMessage, respondWith, selectCandidate } from '@/chat/edit';
import { buildToolCallRequest } from '@/chat/request';
import { textWithDelta } from '@/chat/stream-receive';
import {
  addToolCallPart,
  appendToolCalls,
  restartToolCall,
  setToolCallState,
} from '@/chat/tool-calls';
import type { Chat, ConnectionProfile, ToolCallGeneration, ToolCallRecord } from '@/chat/types';
import { newShortId } from '@/lib/id';
import type { LlmFailure, LlmResult, ToolDefinition } from '@/port/llm-port';
import { currentLlmTarget, type LlmTarget } from '@/store/chat/llm-target';
import { llmPort } from '@/store/ports/llm-port';
import { tagSentRequest } from '@/store/ports/llm-sent-log';
import { chatToolsOf, sourcesOf, startResponseRecord } from '@/store/slices/chat-kit';
import { createChatStream } from '@/store/slices/chat-stream';
import type { ChatState, ToolCallAttempt } from '@/store/use-chat-store';
import { useLlmProfilesStore } from '@/store/use-llm-profiles-store';
import { callRequestKey, useSentRequestsStore } from '@/store/use-sent-requests-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 会話のストアの、発言を直す操作と、ワークフローの呼び出しの状態を変える・LLM に作らせる操作。
// ─────────────────────────────

/** この slice が持つ操作 */
type ChatMessageActions = Pick<
  ChatState,
  | 'respondWith'
  | 'selectCandidate'
  | 'updateMessage'
  | 'removeMessage'
  | 'setToolCall'
  | 'requestToolCall'
  | 'restartToolCall'
>;

/** 呼び出しを作らせた結果（`requestToolCall` の戻り値） */
type ToolCallAnswer = Awaited<ReturnType<ChatState['requestToolCall']>>;

/** 呼び出しを作らせる 1 回の材料 */
interface ToolCallAsk {
  readonly chatId: string;
  readonly chat: Chat;
  readonly messageId: string;
  readonly target: LlmTarget;
  readonly profile: ConnectionProfile;
  readonly definition: ToolDefinition;
}

/** 呼び出しを作らせて受け取ったもの */
interface ToolCallReply {
  readonly result: LlmResult<null>;
  readonly calls: readonly ToolCallRecord[];
  readonly generation: () => ToolCallGeneration;
  /** 受け取った本文 */
  readonly text: () => string;
  /** 送った中身を、呼び出しの id が決まるまで記録しておく仮の鍵 */
  readonly pendingKey: string;
}

/** 発言を直す操作と、ワークフローの呼び出しの操作を作る */
export const createChatMessageSlice: StateCreator<ChatState, [], [], ChatMessageActions> = (
  set,
  get,
) => {
  const { change } = createChatStream(set, get);
  return {
    respondWith: (chatId, contents, selected) => {
      const chat = get().chats[chatId];
      if (chat !== undefined) change(chatId, respondWith(chat, contents, selected, newShortId()));
    },

    selectCandidate: (chatId, messageId, index) => {
      const chat = get().chats[chatId];
      if (chat !== undefined) change(chatId, selectCandidate(chat, messageId, index));
    },

    updateMessage: (chatId, messageId, content) => {
      const chat = get().chats[chatId];
      if (chat !== undefined) change(chatId, editMessage(chat, messageId, content));
    },

    removeMessage: (chatId, messageId) => {
      const chat = get().chats[chatId];
      if (chat !== undefined) change(chatId, removeMessage(chat, messageId));
    },

    setToolCall: (chatId, messageId, callId, state) => {
      const chat = get().chats[chatId];
      if (chat === undefined) return;
      // 呼び出しの結果では LLM の続きを受け取らない（ワークフローは別に動かす）
      change(chatId, setToolCallState(chat, messageId, callId, state));
    },

    requestToolCall: async (chatId, messageId, name) => {
      const chat = get().chats[chatId];
      const target = currentLlmTarget();
      const profile = useLlmProfilesStore
        .getState()
        .profiles.find((item) => item.id === target.profileId);
      const tool = chat === undefined ? undefined : chatToolsOf().definitions(chat);
      const definition = tool?.find((item) => item.function.name === name);
      if (chat === undefined || isStreaming(chat)) return failed('stopped');
      if (profile === undefined || definition === undefined) return failed('not-found');
      const sent = useSentRequestsStore.getState();
      const reply = await generateToolCalls({
        chatId,
        chat,
        messageId,
        target,
        profile,
        definition,
      });
      // 呼び出しが返らなかった失敗も、作らせた応答の記録と本文を返す（失敗の行で見られるように）
      if (!reply.result.ok) {
        return { ok: false, failure: reply.result.failure, attempt: attemptOf(chatId, reply) };
      }
      const current = get().chats[chatId];
      if (current === undefined) {
        sent.move(reply.pendingKey, []);
        return failed('stopped');
      }
      const added = settledCalls(reply, current);
      if (added.length === 0) {
        return { ok: false, failure: { kind: 'bad-response' }, attempt: attemptOf(chatId, reply) };
      }
      const appended = change(chatId, appendToolCalls(current, messageId, added));
      const keys = appended ? added.map((call) => callRequestKey(chatId, call.id)) : [];
      sent.move(reply.pendingKey, keys);
      if (!appended) return failed('stopped');
      return { ok: true, callIds: added.map((call) => call.id) };
    },

    restartToolCall: (chatId, messageId, callId, args) => {
      const chat = get().chats[chatId];
      if (chat !== undefined) change(chatId, restartToolCall(chat, messageId, callId, args));
    },
  };
};

/**
 * 選んだワークフローの呼び出しを LLM に作らせる。作らせた応答の記録（呼び出しのカードに出す）も取る。
 * 送った中身は呼び出しの id が決まるまで仮の鍵で記録する
 */
async function generateToolCalls(ask: ToolCallAsk): Promise<ToolCallReply> {
  const { chat, target } = ask;
  let calls: ToolCallRecord[] = [];
  // 呼び出しの代わりに書いた本文（呼び出しが返らなかったときに見せる）
  let text = '';
  const recorder = startResponseRecord(target);
  const request = buildToolCallRequest(
    { chat, messageId: ask.messageId, receivingId: newShortId() },
    { model: target.model, params: useSettingsStore.getState().llmParams },
    sourcesOf(chat),
    ask.definition,
  );
  const pendingKey = callRequestKey(ask.chatId, `pending_${newShortId()}`);
  tagSentRequest(request, pendingKey);
  const result = await llmPort().streamChat(endpointOf(ask.profile), request, {
    onEvent: (event) => {
      recorder.observe(event);
      if (event.kind === 'tool-call') calls = addToolCallPart(calls, event);
      if (event.kind === 'delta') text = textWithDelta(text, event);
    },
    // 止める口は置かない（引数を作らせるだけの短い受け取り）
    signal: new AbortController().signal,
  });
  const generation = (): ToolCallGeneration => ({
    reasoning: recorder.reasoning(),
    ...recorder.finish(),
  });
  return { result, calls, generation, text: () => text, pendingKey };
}

/**
 * 受け取った呼び出しに、会話の中で重ならない id と作らせた応答の記録を付け、確かめた状態にする
 * （LLM の id は送り返すときにしか使わない）
 */
function settledCalls(reply: ToolCallReply, current: Chat): ToolCallRecord[] {
  const generation = reply.generation();
  return reply.calls.map((call) => {
    const settled = { ...call, id: `call_${newShortId()}`, generation };
    return { ...settled, state: chatToolsOf().check(settled, current) };
  });
}

/** 理由だけの失敗 */
function failed(kind: LlmFailure['kind']): ToolCallAnswer {
  return { ok: false, failure: { kind } };
}

/**
 * 呼び出しが返らなかった 1 回の記録。送った中身は、記録の id を呼び出しの id の位置に置いた鍵へ移す
 * （失敗の行の送った中身のアイコンが引く）
 */
function attemptOf(chatId: string, reply: ToolCallReply): ToolCallAttempt {
  const id = `attempt_${newShortId()}`;
  useSentRequestsStore.getState().move(reply.pendingKey, [callRequestKey(chatId, id)]);
  return { id, generation: reply.generation(), text: reply.text() };
}
