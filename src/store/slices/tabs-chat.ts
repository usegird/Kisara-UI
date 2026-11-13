import type { StateCreator } from 'zustand';

import { BROWSER_PLACE } from '@/chat/types';
import { applySnapshot, createTabAdder, EMPTY_SNAPSHOT, tabPlace } from '@/store/slices/tabs-kit';
import { useChatLibraryStore } from '@/store/use-chat-library-store';
import { useChatStore } from '@/store/use-chat-store';
import { useGraphStore } from '@/store/use-graph-store';
import { useSettingsStore } from '@/store/use-settings-store';
import type { Tab, TabsState } from '@/store/use-tabs-store';

// ─────────────────────────────
// タブのストアの、会話のタブを足す・開く・会話を替える・置き場を替える操作。
// 会話のタブは会話の id と置き場だけを持ち、中身は会話のストアにある。
// ─────────────────────────────

/** この slice が持つ操作 */
type TabsChatActions = Pick<
  TabsState,
  'addChatTab' | 'openChatTab' | 'openExistingChat' | 'replaceChat' | 'setTabChat' | 'setChatPlace'
>;

/** 会話のタブの操作を作る */
export const createTabsChatSlice: StateCreator<TabsState, [], [], TabsChatActions> = (set, get) => {
  const addTabOf = createTabAdder({ set, get });
  return {
    addChatTab: (chatId) => {
      const id = chatId ?? useChatStore.getState().add();
      const tabId = addTabOf('chat', EMPTY_SNAPSHOT, id);
      // 置き場（新しい会話は最後に選んだ保存先）をタブにも残す（読み込み直したときに使う）
      const place = useChatStore.getState().places[id];
      if (place !== undefined) get().setChatPlace(id, place);
      // 新しい会話で、一覧を縮めていれば引き出しを出して始める（会話を選べるように）
      if (chatId === undefined && useSettingsStore.getState().chatSidebarCollapsed) {
        useChatLibraryStore.getState().setDrawerOpen(true);
      }
      return tabId;
    },

    openChatTab: (init) => {
      // 接続の設定とモデルは全体で持つ。選んだものを全体に入れてから会話を作る
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
