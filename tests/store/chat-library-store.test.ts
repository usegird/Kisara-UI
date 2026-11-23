import { afterEach, describe, expect, it } from 'vitest';

import { useChatLibraryStore } from '@/store/use-chat-library-store';
import { useSettingsStore } from '@/store/use-settings-store';

afterEach(() => {
  useSettingsStore.setState({ chatSidebarCollapsed: false });
  useChatLibraryStore.setState({ drawerOpen: false });
});

describe('ハンバーガーメニュー', () => {
  it('ピン止めしていれば列を縮め、縮めていれば引き出しを出し入れする', () => {
    const { toggleList } = useChatLibraryStore.getState();
    toggleList();
    expect(useSettingsStore.getState().chatSidebarCollapsed).toBe(true);
    expect(useChatLibraryStore.getState().drawerOpen).toBe(false);

    toggleList();
    expect(useChatLibraryStore.getState().drawerOpen).toBe(true);
    toggleList();
    expect(useChatLibraryStore.getState().drawerOpen).toBe(false);
  });
});
