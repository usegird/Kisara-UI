import { create } from 'zustand';

import { omitKey } from '@/lib/own-key';

// ─────────────────────────────
// 画像のタブの中身。ワークフローを持たない画像と、その文字の埋め込み。
// 画像はファイルから作った `blob:` の URL で持ち、**端末には残さない**（再読み込みで消える）。
// タブを閉じたら URL を手放す。
// ─────────────────────────────

/** 画像のタブ 1 つの中身 */
interface ImageTabContent {
  /** 画像の `blob:` URL */
  readonly url: string;
  /** 文字の埋め込み（キーワードと本文。書かれていた順） */
  readonly texts: readonly (readonly [string, string])[];
}

/** 画像のタブの中身（タブの id ごと）と、置く・外す操作 */
interface ImageTabsState {
  readonly images: Readonly<Record<string, ImageTabContent>>;
  readonly put: (tabId: string, content: ImageTabContent) => void;
  /** タブを閉じたとき。URL を手放す */
  readonly remove: (tabId: string) => void;
}

export const useImageTabsStore = create<ImageTabsState>()((set, get) => ({
  images: {},
  put: (tabId, content) => set({ images: { ...get().images, [tabId]: content } }),
  remove: (tabId) => {
    const { images } = get();
    const content = images[tabId];
    if (!content) return;
    URL.revokeObjectURL(content.url);
    set({ images: omitKey(images, tabId) });
  },
}));
