import { create } from 'zustand';

import { omitKey } from '@/lib/own-key';

interface ImageTabContent {
  readonly url: string;
  readonly texts: readonly (readonly [string, string])[];
}

interface ImageTabsState {
  readonly images: Readonly<Record<string, ImageTabContent>>;
  readonly put: (tabId: string, content: ImageTabContent) => void;
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
