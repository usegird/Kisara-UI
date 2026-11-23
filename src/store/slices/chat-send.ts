import type { StateCreator } from 'zustand';

import { clearedChat } from '@/chat/card-greeting';
import { appendTurn, isStreaming, regenerate, retry, rollback, writeReply } from '@/chat/edit';
import { stripComments } from '@/chat/macros';
import { directionText } from '@/chat/playbook-text';
import { newShortId } from '@/lib/id';
import { omitKey } from '@/lib/own-key';
import { abortStream, createChatStream } from '@/store/slices/chat-stream';
import type { ChatState } from '@/store/use-chat-store';

type ChatSendActions = Pick<
  ChatState,
  'sendDirection' | 'send' | 'regenerate' | 'retry' | 'writeReply' | 'rollback' | 'stop' | 'clear'
>;

type SentDraftPatch = Pick<
  ChatState,
  'drafts' | 'draftImages' | 'draftDirections' | 'draftNotes' | 'loreDrafts'
>;

export const createChatSendSlice: StateCreator<ChatState, [], [], ChatSendActions> = (set, get) => {
  const { change, start, sendable } = createChatStream(set, get);
  return {
    sendDirection: (chatId, parts, instruction) => {
      const chat = sendable(chatId);
      if (chat === null) return;
      const draft = get().drafts[chatId] ?? '';
      const body = [...parts, draft].map(stripComments).filter((part) => part.trim().length > 0);
      if (body.length === 0) return;
      const text = directionText(body);
      const images = get().draftImages[chatId] ?? [];
      set(sentDraftPatch(get(), chatId));
      const turn = { text, userId: newShortId(), assistantId: newShortId(), images, instruction };
      start(chatId, appendTurn(chat, turn));
    },

    send: (chatId) => {
      const direction = get().draftDirections[chatId];
      if (direction !== undefined) {
        get().sendDirection(chatId, [direction.text], direction.instruction);
        return;
      }
      const chat = sendable(chatId);
      const text = stripComments(get().drafts[chatId] ?? '');
      const images = get().draftImages[chatId] ?? [];
      if ((text.trim().length === 0 && images.length === 0) || chat === null) return;
      set(sentDraftPatch(get(), chatId));
      const turn = { text, userId: newShortId(), assistantId: newShortId(), images };
      start(chatId, appendTurn(chat, turn));
    },

    regenerate: (chatId) => {
      const chat = sendable(chatId);
      if (chat === null) return;
      const draft = get().drafts[chatId] ?? '';
      const next = regenerate(chat, stripComments(draft));
      if (next !== null && draft.trim().length > 0) {
        set({
          drafts: { ...get().drafts, [chatId]: '' },
          loreDrafts: { ...get().loreDrafts, [chatId]: '' },
        });
      }
      if (next !== null) set({ draftNotes: omitKey(get().draftNotes, chatId) });
      start(chatId, next);
    },

    retry: (chatId) => {
      const chat = sendable(chatId);
      if (chat !== null) start(chatId, retry(chat));
    },

    writeReply: (chatId) => {
      const chat = sendable(chatId);
      if (chat !== null) start(chatId, writeReply(chat));
    },

    rollback: (chatId, messageId) => {
      const chat = get().chats[chatId];
      const back = chat === undefined ? null : rollback(chat, messageId);
      if (back === null) return;
      change(chatId, back.chat);
      get().setDraft(chatId, back.content);
      set({
        draftImages:
          back.images.length === 0
            ? omitKey(get().draftImages, chatId)
            : { ...get().draftImages, [chatId]: back.images },
      });
    },

    stop: (chatId) => abortStream(chatId),

    clear: (chatId) => {
      const chat = get().chats[chatId];
      if (chat !== undefined && !isStreaming(chat)) change(chatId, clearedChat(chat, newShortId));
    },
  };
};

function sentDraftPatch(state: ChatState, chatId: string): SentDraftPatch {
  return {
    drafts: { ...state.drafts, [chatId]: '' },
    draftImages: omitKey(state.draftImages, chatId),
    draftDirections: omitKey(state.draftDirections, chatId),
    draftNotes: omitKey(state.draftNotes, chatId),
    loreDrafts: { ...state.loreDrafts, [chatId]: '' },
  };
}
