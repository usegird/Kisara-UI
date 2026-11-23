import type { StateCreator } from 'zustand';

import { BROWSER_PLACE } from '@/chat/types';
import { applySnapshot, createTabAdder, EMPTY_SNAPSHOT, tabPlace } from '@/store/slices/tabs-kit';
import { useChatLibraryStore } from '@/store/use-chat-library-store';
import { useChatStore } from '@/store/use-chat-store';
import { useGraphStore } from '@/store/use-graph-store';
import { useSettingsStore } from '@/store/use-settings-store';
import type { Tab, TabsState } from '@/store/use-tabs-store';

type TabsChatActions = Pick<
  TabsState,
  'addChatTab' | 'openChatTab' | 'openExistingChat' | 'replaceChat' | 'setTabChat' | 'setChatPlace'
>;

export const createTabsChatSlice: StateCreator<TabsState, [], [], TabsChatActions> = (set, get) => {
  const addTabOf = createTabAdder({ set, get });
  return {
    addChatTab: (chatId) => {
      const id = chatId ?? useChatStore.getState().add();
      const tabId = addTabOf('chat', EMPTY_SNAPSHOT, id);
      const place = useChatStore.getState().places[id];
      if (place !== undefined) get().setChatPlace(id, place);
      if (chatId === undefined && useSettingsStore.getState().chatSidebarCollapsed) {
        useChatLibraryStore.getState().setDrawerOpen(true);
      }
      return tabId;
    },

    openChatTab: (init) => {
      if (init !== undefined) useSettingsStore.getState().setLlmTarget(init);
      return get().openExistingChat(useChatStore.getState().add());
    },

    openExistingChat: (chatId, place = useChatStore.getState().places[chatId] ?? BROWSER_PLACE) => {
      const { activeId, tabs } = get();
      const open = tabs.find((tab) => tab.chatId === chatId);
      if (open !== undefined) {
        get().selectTab(open.id);
        return open.id;
      }
      const active = tabs.find((tab) => tab.id === activeId);
      if (active?.kind !== 'workflow' || useGraphStore.getState().workflow !== null) {
        const id = addTabOf('chat', EMPTY_SNAPSHOT, chatId);
        get().setChatPlace(chatId, place);
        return id;
      }
      const tab: Tab = { id: activeId, kind: 'chat', chatId, ...tabPlace(place) };
      set({ tabs: tabs.map((item) => (item.id === activeId ? tab : item)) });
      applySnapshot(EMPTY_SNAPSHOT);
      return activeId;
    },

    replaceChat: (tabId, chatId, place = BROWSER_PLACE) => {
      const previous = get().tabs.find((tab) => tab.id === tabId);
      if (previous?.kind !== 'chat') return;
      set({
        tabs: get().tabs.map((tab) =>
          tab.id === tabId ? { id: tabId, kind: 'chat', chatId, ...tabPlace(place) } : tab,
        ),
      });
      if (previous.chatId !== undefined && previous.chatId !== chatId) {
        useChatStore.getState().unload(previous.chatId);
      }
    },

    setTabChat: (tabId, chatId) =>
      set({ tabs: get().tabs.map((tab) => (tab.id === tabId ? { ...tab, chatId } : tab)) }),

    setChatPlace: (chatId, place) => {
      set({
        tabs: get().tabs.map((tab) =>
          tab.chatId === chatId ? { ...tab, ...tabPlace(place) } : tab,
        ),
      });
    },
  };
};
