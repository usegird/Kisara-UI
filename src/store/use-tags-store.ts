import { create } from 'zustand';

import {
  mergeTags,
  orderDictionaries,
  type IndexedTag,
  type TagSources,
} from '@/graph/tag-dictionary';
import type { TagsPort } from '@/port/tags';
import { formatComfyFailure } from '@/queue/comfy-failure-text';
import { registerTabScopedValue } from '@/store/kit/tab-scoped';
import { comfyPort } from '@/store/ports/comfy-port';
import {
  planCommit,
  type TagChanges,
  type TagCommitFailure,
  type WriteStep,
} from '@/store/slices/tags-kit';
import { useSettingsStore } from '@/store/use-settings-store';

export type { TagChanges, TagCommitFailure } from '@/store/slices/tags-kit';

export type TagWriteFailure = 'not-loaded' | 'failed';

export const TAG_PANEL_DIALOG = 'tag-panel';

type TagsStatus = 'idle' | 'loading' | 'ready' | 'saving' | 'error';

interface TagsState extends TagSources {
  readonly status: TagsStatus;
  readonly loadedFrom: string | null;
  readonly error: string | null;
  readonly merged: readonly IndexedTag[];
  readonly load: (baseUrl: string) => Promise<void>;
  readonly refresh: (baseUrl: string) => Promise<void>;
  readonly invalidate: () => void;
  readonly commit: (
    baseUrl: string,
    changes: TagChanges,
  ) => Promise<TagCommitFailure | TagWriteFailure | null>;
  readonly panelOpen: boolean;
  readonly openPanel: () => void;
  readonly closePanel: () => void;
  readonly closeRequested: boolean;
  readonly requestClosePanel: () => void;
  readonly clearCloseRequest: () => void;
}

const EMPTY: TagSources & { readonly merged: readonly IndexedTag[] } = {
  pysssss: null,
  dictionaries: [],
  overrides: [],
  merged: [],
};

function withSources(state: TagSources, patch: Partial<TagSources>): Partial<TagsState> {
  const sources = {
    pysssss: state.pysssss,
    dictionaries: state.dictionaries,
    overrides: state.overrides,
    ...patch,
  };
  return { ...patch, merged: mergeTags(sources, sourcesOff()) };
}

function sourcesOff(): ReadonlySet<string> {
  return new Set(useSettingsStore.getState().tagSourcesOff);
}

function panelActions(
  set: (patch: Partial<TagsState>) => void,
): Pick<
  TagsState,
  | 'panelOpen'
  | 'openPanel'
  | 'closePanel'
  | 'closeRequested'
  | 'requestClosePanel'
  | 'clearCloseRequest'
> {
  return {
    panelOpen: false,
    openPanel: () => set({ panelOpen: true, closeRequested: false }),
    closePanel: () => set({ panelOpen: false, closeRequested: false }),
    closeRequested: false,
    requestClosePanel: () => set({ closeRequested: true }),
    clearCloseRequest: () => set({ closeRequested: false }),
  };
}

export function createTagsStore(port: TagsPort) {
  return create<TagsState>()((set, get) => {
    let generation = 0;

    async function load(baseUrl: string): Promise<void> {
      if (baseUrl.length === 0) return;
      const current = ++generation;
      set({ status: 'loading', error: null });
      try {
        const [pysssss, dictionaries, overrides] = await Promise.all([
          port.fetchPysssss(baseUrl, {}),
          port.fetchDictionaries(baseUrl, {}),
          port.fetchOverrides(baseUrl, {}),
        ]);
        if (current !== generation) return;
        const sources = { pysssss, dictionaries: orderDictionaries(dictionaries), overrides };
        set({
          status: 'ready',
          loadedFrom: baseUrl,
          error: null,
          ...withSources(sources, sources),
        });
      } catch (error) {
        if (current !== generation) return;
        set({ status: 'error', loadedFrom: null, error: formatComfyFailure(error), ...EMPTY });
      }
    }

    async function write(steps: readonly WriteStep[]): Promise<boolean> {
      const current = generation;
      set({ status: 'saving', error: null });
      try {
        for (const step of steps) {
          await step.run();
          if (current === generation) set(withSources(get(), step.apply(get())));
        }
        if (current === generation) set({ status: 'ready' });
        return true;
      } catch (error) {
        if (current === generation) set({ status: 'ready', error: formatComfyFailure(error) });
        return false;
      }
    }

    return {
      status: 'idle',
      loadedFrom: null,
      error: null,
      ...EMPTY,
      async load(baseUrl) {
        if (get().status !== 'idle') return;
        await load(baseUrl);
      },
      refresh: load,
      invalidate: () => {
        generation++;
        set({ status: 'idle', loadedFrom: null });
      },
      async commit(baseUrl, changes) {
        if (get().loadedFrom !== baseUrl) return 'not-loaded';
        const steps = planCommit(get(), port, baseUrl, changes);
        if (typeof steps === 'string') return steps;
        return (await write(steps)) ? null : 'failed';
      },
      ...panelActions(set),
    };
  });
}

const portTags: TagsPort = {
  fetchPysssss: (...args) => comfyPort().tags.fetchPysssss(...args),
  fetchDictionaries: (...args) => comfyPort().tags.fetchDictionaries(...args),
  fetchOverrides: (...args) => comfyPort().tags.fetchOverrides(...args),
  saveDictionary: (...args) => comfyPort().tags.saveDictionary(...args),
  saveOverrides: (...args) => comfyPort().tags.saveOverrides(...args),
};

export const useTagsStore = createTagsStore(portTags);

useSettingsStore.subscribe((state, previous) => {
  if (state.tagSourcesOff === previous.tagSourcesOff) return;
  useTagsStore.setState((tags) => withSources(tags, {}));
});

registerTabScopedValue('tagPanel', {
  current: () => (useTagsStore.getState().panelOpen ? true : null),
  isValue: (saved): saved is true => saved === true,
  open: () => useTagsStore.getState().openPanel(),
  close: () => useTagsStore.getState().closePanel(),
});
