import { create } from 'zustand';

import { omitKey } from '@/lib/own-key';

interface PlaybookPanelState {
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
