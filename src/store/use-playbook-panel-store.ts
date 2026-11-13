import { create } from 'zustand';

import { omitKey } from '@/lib/own-key';

// ─────────────────────────────
// プレイブックの選ぶ所を開いているか。会話の id ごと。開いている間は
// プレイブックのカードの位置に選ぶ所を出す。写し・アウトラインは会話の中身（use-chat-store）。
// 端末には残さない
// ─────────────────────────────

/** プレイブックを選ぶ所を開いている会話と、開く・閉じる操作 */
interface PlaybookPanelState {
  /** 選ぶ所を開いている会話の id */
  readonly open: Readonly<Record<string, true>>;
  readonly setOpen: (chatId: string, open: boolean) => void;
}

export const usePlaybookPanelStore = create<PlaybookPanelState>()((set, get) => ({
  open: {},
  setOpen: (chatId, open) => {
    const current = get().open;
    if ((current[chatId] === true) === open) return;
    set({ open: open ? { ...current, [chatId]: true } : omitKey(current, chatId) });
  },
}));
