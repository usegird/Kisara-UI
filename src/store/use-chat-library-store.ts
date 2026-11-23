import { create } from 'zustand';

import { useSettingsStore } from '@/store/use-settings-store';

interface ChatLibraryState {
  readonly revision: number;
  readonly refresh: () => void;
  readonly openList: () => void;
  readonly drawerOpen: boolean;
  readonly setDrawerOpen: (open: boolean) => void;
  readonly toggleList: () => void;
}

export const useChatLibraryStore = create<ChatLibraryState>()((set, get) => ({
  revision: 0,
  refresh: () => set({ revision: get().revision + 1 }),
  openList: () => useSettingsStore.getState().setChatSidebarCollapsed(false),
  drawerOpen: false,
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
  toggleList: () => {
    const settings = useSettingsStore.getState();
    if (!settings.chatSidebarCollapsed) {
      settings.setChatSidebarCollapsed(true);
      set({ drawerOpen: false });
      return;
    }
    set({ drawerOpen: !get().drawerOpen });
  },
}));
