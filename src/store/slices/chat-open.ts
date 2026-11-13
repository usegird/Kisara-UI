import type { StateCreator } from 'zustand';

import { syncedGreeting } from '@/chat/card-greeting';
import { stopPlaybook } from '@/chat/playbook-outline';
import { BROWSER_PLACE, EMPTY_CHAT } from '@/chat/types';
import { newShortId } from '@/lib/id';
import { omitKey } from '@/lib/own-key';
import { createChatStream, forgetStream } from '@/store/slices/chat-stream';
import type { ChatState } from '@/store/use-chat-store';

// ─────────────────────────────
// 会話のストアの、会話を置く・手放す・置き場と書けたかの印・会話の持ち物（構成・プレイブック）を直す操作。
// ─────────────────────────────

/** この slice が持つ操作 */
type ChatOpenActions = Pick<
  ChatState,
  | 'add'
  | 'put'
  | 'setPending'
  | 'unload'
  | 'setPlace'
  | 'setSaveState'
  | 'setNearFull'
  | 'update'
  | 'updatePrompt'
  | 'updatePlaybookChat'
  | 'setPlaybook'
>;

/** 会話を置く・手放す・持ち物を直す操作を作る */
export const createChatOpenSlice: StateCreator<ChatState, [], [], ChatOpenActions> = (set, get) => {
  const { change } = createChatStream(set, get);
  return {
    add: () => {
      const chatId = newShortId();
      const now = Date.now();
      // 新しい会話はいつもブラウザに置く
      get().put(chatId, { ...EMPTY_CHAT, createdAt: now, updatedAt: now }, BROWSER_PLACE);
      return chatId;
    },

    put: (chatId, chat, place = BROWSER_PLACE) => {
      const state = get();
      set({
        chats: { ...state.chats, [chatId]: chat },
        places: { ...state.places, [chatId]: place },
        pending: omitKey(state.pending, chatId),
      });
    },

    setPending: (chatId, next) => {
      const state = get();
      set({
        pending:
          next === null ? omitKey(state.pending, chatId) : { ...state.pending, [chatId]: next },
      });
    },

    unload: (chatId) => {
      forgetStream(chatId);
      const state = get();
      set({
        chats: omitKey(state.chats, chatId),
        places: omitKey(state.places, chatId),
        saveStates: omitKey(state.saveStates, chatId),
        pending: omitKey(state.pending, chatId),
        drafts: omitKey(state.drafts, chatId),
        draftImages: omitKey(state.draftImages, chatId),
        draftDirections: omitKey(state.draftDirections, chatId),
        draftNotes: omitKey(state.draftNotes, chatId),
        loreDrafts: omitKey(state.loreDrafts, chatId),
      });
    },

    setPlace: (chatId, place) => set({ places: { ...get().places, [chatId]: place } }),

    setSaveState: (chatId, saveState) => {
      if (get().saveStates[chatId] !== saveState) {
        set({ saveStates: { ...get().saveStates, [chatId]: saveState } });
      }
    },

    setNearFull: (nearFull) => {
      if (get().nearFull !== nearFull) set({ nearFull });
    },

    update: (chatId, patch) => {
      const chat = get().chats[chatId];
      if (chat === undefined) return;
      const next = { ...chat, ...patch };
      // 欄か利用者の名前を変えたら、始めていない会話の最初の発言を写し直す
      const greets = 'character' in patch || 'persona' in patch;
      change(chatId, greets ? { ...next, messages: syncedGreeting(chat, next, newShortId) } : next);
    },

    updatePrompt: (chatId, edit) => {
      const chat = get().chats[chatId];
      const prompt = chat === undefined ? null : edit(chat.prompt);
      if (chat !== undefined && prompt !== null) change(chatId, { ...chat, prompt });
    },

    updatePlaybookChat: (chatId, edit) => {
      const chat = get().chats[chatId];
      const patch = chat?.playbook === undefined ? null : edit(chat);
      if (chat !== undefined && patch !== null) change(chatId, { ...chat, ...patch });
    },

    setPlaybook: (chatId, patch) => {
      const chat = get().chats[chatId];
      if (chat === undefined) return;
      // 外すときは、プレイブックの辞書を残してどれかと今のフェーズと今の段だけを消す
      const next = patch ?? stopPlaybook(chat);
      if (next !== null) change(chatId, { ...chat, ...next });
    },
  };
};
