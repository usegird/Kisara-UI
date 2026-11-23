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

type ToolCallAnswer = Awaited<ReturnType<ChatState['requestToolCall']>>;

interface ToolCallAsk {
  readonly chatId: string;
  readonly chat: Chat;
  readonly messageId: string;
  readonly target: LlmTarget;
  readonly profile: ConnectionProfile;
  readonly definition: ToolDefinition;
}

interface ToolCallReply {
  readonly result: LlmResult<null>;
  readonly calls: readonly ToolCallRecord[];
  readonly generation: () => ToolCallGeneration;
  readonly text: () => string;
  readonly pendingKey: string;
}

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

async function generateToolCalls(ask: ToolCallAsk): Promise<ToolCallReply> {
  const { chat, target } = ask;
  let calls: ToolCallRecord[] = [];
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
    signal: new AbortController().signal,
  });
  const generation = (): ToolCallGeneration => ({
    reasoning: recorder.reasoning(),
    ...recorder.finish(),
  });
  return { result, calls, generation, text: () => text, pendingKey };
}

function settledCalls(reply: ToolCallReply, current: Chat): ToolCallRecord[] {
  const generation = reply.generation();
  return reply.calls.map((call) => {
    const settled = { ...call, id: `call_${newShortId()}`, generation };
    return { ...settled, state: chatToolsOf().check(settled, current) };
  });
}

function failed(kind: LlmFailure['kind']): ToolCallAnswer {
  return { ok: false, failure: { kind } };
}

function attemptOf(chatId: string, reply: ToolCallReply): ToolCallAttempt {
  const id = `attempt_${newShortId()}`;
  useSentRequestsStore.getState().move(reply.pendingKey, [callRequestKey(chatId, id)]);
  return { id, generation: reply.generation(), text: reply.text() };
}
