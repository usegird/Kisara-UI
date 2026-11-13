import { create } from 'zustand';

import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 会話の左の列の状態。一覧を取り直す合図。
// 端末には残さない（縮めたか・幅は設定のストアが端末に残す）。
// ─────────────────────────────

/** 会話の左の列の状態と操作 */
interface ChatLibraryState {
  /** 一覧を取り直す合図（読み込んだ・消した・移した・名前を変えた後） */
  readonly revision: number;
  readonly refresh: () => void;
  /** 一覧を出す（縮めていれば列に戻す） */
  readonly openList: () => void;
  /** 縮めた一覧を引き出しで出しているか（画面の中だけ） */
  readonly drawerOpen: boolean;
  readonly setDrawerOpen: (open: boolean) => void;
  /**
   * ヘッダーのハンバーガーメニュー。ピン止めしていれば列を縮め、
   * 縮めていれば引き出しを出す・引っ込める
   */
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
