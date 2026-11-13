import type { StateCreator } from 'zustand';

import { changesLorePreview } from '@/chat/chat-sources';
import { omitKey } from '@/lib/own-key';
import { refreshLoreDraft } from '@/store/slices/chat-kit';
import type { ChatState } from '@/store/use-chat-store';

// ─────────────────────────────
// 会話のストアの、打ちかけ（本文・添えた画像・指示の枠・注記の枠）の操作。端末には残さない。
// ─────────────────────────────

/** この slice が持つ操作 */
type ChatDraftActions = Pick<
  ChatState,
  | 'fillDirection'
  | 'setDirectionText'
  | 'clearDirection'
  | 'setDraftNote'
  | 'setDraft'
  | 'addDraftImages'
  | 'removeDraftImage'
>;

/** 打ちかけの操作を作る */
export const createChatDraftSlice: StateCreator<ChatState, [], [], ChatDraftActions> = (
  set,
  get,
) => ({
  fillDirection: (chatId, parts, instruction) => {
    const text = parts.filter((part) => part.trim().length > 0).join('\n\n');
    if (text.length === 0) return;
    set({ draftDirections: { ...get().draftDirections, [chatId]: { instruction, text } } });
  },

  setDirectionText: (chatId, text) => {
    const current = get().draftDirections[chatId];
    if (current === undefined) return;
    set({ draftDirections: { ...get().draftDirections, [chatId]: { ...current, text } } });
  },

  clearDirection: (chatId) => {
    if (get().draftDirections[chatId] === undefined) return;
    // 注記はその操作の指示に添えたものなので、枠を外したら一緒に外す
    set({
      draftDirections: omitKey(get().draftDirections, chatId),
      draftNotes: omitKey(get().draftNotes, chatId),
    });
  },

  setDraftNote: (chatId, note) =>
    set({
      draftNotes:
        note === null || note.trim().length === 0
          ? omitKey(get().draftNotes, chatId)
          : { ...get().draftNotes, [chatId]: note },
    }),

  setDraft: (chatId, text) => {
    const previous = get().drafts[chatId] ?? '';
    set({ drafts: { ...get().drafts, [chatId]: text } });
    if (changesLorePreview(previous, text)) refreshLoreDraft(get, set, chatId);
  },

  addDraftImages: (chatId, images) => {
    if (images.length === 0) return;
    const current = get().draftImages[chatId] ?? [];
    set({ draftImages: { ...get().draftImages, [chatId]: [...current, ...images] } });
  },

  removeDraftImage: (chatId, index) => {
    const current = get().draftImages[chatId] ?? [];
    if (index < 0 || index >= current.length) return;
    const next = current.filter((_, at) => at !== index);
    set({
      draftImages:
        next.length === 0
          ? omitKey(get().draftImages, chatId)
          : { ...get().draftImages, [chatId]: next },
    });
  },
});
