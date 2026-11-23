import { create } from 'zustand';

export type ChatSidePanelTab = 'settings' | 'generation' | 'extension' | 'prompt';

interface ChatSidePanelState {
  readonly tab: ChatSidePanelTab;
  readonly setTab: (tab: ChatSidePanelTab) => void;
  readonly expand: ExpandRequest | null;
  readonly requestExpand: (chatId: string, rows?: readonly string[]) => void;
  readonly clearExpand: () => void;
}

interface ExpandRequest {
  readonly chatId: string;
  readonly seq: number;
  readonly rows?: readonly string[] | undefined;
}

let seq = 0;

export const useChatSidePanelStore = create<ChatSidePanelState>()((set) => ({
  tab: 'prompt',
  setTab: (tab) => set({ tab }),
  expand: null,
  requestExpand: (chatId, rows) => set({ expand: { chatId, seq: (seq += 1), rows } }),
  clearExpand: () => set({ expand: null }),
}));
