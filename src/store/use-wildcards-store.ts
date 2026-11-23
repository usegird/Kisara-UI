import { create } from 'zustand';

import { setOwn } from '@/lib/own-key';
import { formatComfyFailure } from '@/queue/comfy-failure-text';
import { createBaseUrlActions } from '@/store/kit/base-url-resource';
import { registerTabScopedValue } from '@/store/kit/tab-scoped';
import { comfyPort } from '@/store/ports/comfy-port';

type WildcardsStatus = 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';

export type WildcardEntries =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly values: readonly string[] }
  | { readonly status: 'unavailable' }
  | { readonly status: 'error'; readonly error: string };

interface WildcardsState {
  readonly status: WildcardsStatus;
  readonly names: readonly string[];
  readonly baseUrl: string;
  readonly error: string | null;
  readonly entries: Readonly<Record<string, WildcardEntries>>;
  readonly ensure: (baseUrl: string) => Promise<void>;
  readonly refresh: (baseUrl: string) => Promise<void>;
  readonly invalidate: () => void;
  readonly ensureEntries: (baseUrl: string, name: string) => Promise<void>;
  readonly panelOpen: boolean;
  readonly openPanel: () => void;
  readonly closePanel: () => void;
}

export function wildcardEntriesOf(
  entries: Readonly<Record<string, WildcardEntries>>,
  name: string,
): WildcardEntries | null {
  return Object.hasOwn(entries, name) ? (entries[name] ?? null) : null;
}

export const useWildcardsStore = create<WildcardsState>()((set, get) => {
  const writeEntries = (baseUrl: string, name: string, next: WildcardEntries): void => {
    const state = get();
    if (state.baseUrl !== baseUrl) return;
    const current = wildcardEntriesOf(state.entries, name);
    if (next.status !== 'loading' && current?.status !== 'loading') return;
    const entries = { ...state.entries };
    setOwn(entries, name, next);
    set({ entries });
  };

  return {
    status: 'idle',
    names: [],
    baseUrl: '',
    error: null,
    entries: {},
    ...createBaseUrlActions(set, get, async (baseUrl): Promise<Partial<WildcardsState>> => {
      const names = await comfyPort().assets.fetchWildcards(baseUrl, {});
      return names === null
        ? { status: 'unavailable', names: [], entries: {} }
        : { status: 'ready', names, error: null, entries: {} };
    }),
    ensureEntries: async (baseUrl, name) => {
      const current = wildcardEntriesOf(get().entries, name);
      if (current !== null && current.status !== 'error') return;
      if (baseUrl.length === 0 || get().baseUrl !== baseUrl) return;
      writeEntries(baseUrl, name, { status: 'loading' });
      try {
        const values = await comfyPort().assets.fetchWildcardEntries(baseUrl, name, {});
        writeEntries(
          baseUrl,
          name,
          values === null ? { status: 'unavailable' } : { status: 'ready', values },
        );
      } catch (error) {
        writeEntries(baseUrl, name, { status: 'error', error: formatComfyFailure(error) });
      }
    },
    panelOpen: false,
    openPanel: () => set({ panelOpen: true }),
    closePanel: () => set({ panelOpen: false }),
  };
});

registerTabScopedValue('wildcards', {
  current: () => (useWildcardsStore.getState().panelOpen ? true : null),
  isValue: (saved): saved is true => saved === true,
  open: () => useWildcardsStore.getState().openPanel(),
  close: () => useWildcardsStore.getState().closePanel(),
});
