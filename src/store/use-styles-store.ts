import { create } from 'zustand';

import {
  EMPTY_STYLE_TABLE,
  mergeStyles,
  removeStyle,
  styleKey,
  upsertStyle,
  type SavedStyle,
  type Style,
  type StyleTable,
  type StyleWriteError,
} from '@/graph/styles';
import { isRecord } from '@/lib/guards';
import type { AssetsPort } from '@/port/comfy-port';
import { formatComfyFailure } from '@/queue/comfy-failure-text';
import { registerTabScoped } from '@/store/kit/tab-scoped';
import { comfyPort } from '@/store/ports/comfy-port';

type StylesStatus = 'idle' | 'loading' | 'ready' | 'saving' | 'error';

export const STYLE_EDITOR_DIALOG = 'style-editor';

export type StyleSaveFailure = StyleWriteError | 'not-loaded';

interface StylesState {
  readonly status: StylesStatus;
  readonly table: StyleTable;
  readonly loadedFrom: string | null;
  readonly error: string | null;
  readonly editing: {
    readonly name: string | null;
    readonly prompt?: string;
    readonly draft?: Style;
  } | null;
  readonly load: (baseUrl: string) => Promise<void>;
  readonly refresh: (baseUrl: string) => Promise<void>;
  readonly save: (
    baseUrl: string,
    original: string | null,
    style: Style,
  ) => Promise<StyleSaveFailure | null>;
  readonly remove: (baseUrl: string, name: string) => Promise<void>;
  readonly invalidate: () => void;
  readonly openEditor: (name: string | null, prompt?: string) => void;
  readonly closeEditor: () => void;
  readonly requestNewStyle: (prompt: string) => void;
  readonly newStyleRequest: string | null;
  readonly clearNewStyleRequest: () => void;
  readonly closeRequested: boolean;
  readonly requestCloseEditor: () => void;
  readonly clearCloseRequest: () => void;
}

export interface StylesDeps {
  readonly fetchTable: AssetsPort['fetchStyleTable'];
  readonly fetchSaved: AssetsPort['fetchSavedStyles'];
  readonly saveStyle: AssetsPort['saveStyle'];
}

function message(error: unknown): string {
  return formatComfyFailure(error);
}

export function createStylesStore(deps: StylesDeps) {
  return create<StylesState>()((set, get) => {
    let generation = 0;

    async function load(baseUrl: string): Promise<void> {
      if (baseUrl.length === 0) return;
      const current = ++generation;
      set({ status: 'loading', error: null });

      try {
        const [csv, saved] = await Promise.all([
          deps.fetchTable(baseUrl, {}),
          deps.fetchSaved(baseUrl, {}),
        ]);
        if (current !== generation) return;
        set({ status: 'ready', table: mergeStyles(csv, saved), loadedFrom: baseUrl, error: null });
      } catch (error) {
        if (current !== generation) return;
        set({ status: 'error', table: EMPTY_STYLE_TABLE, loadedFrom: null, error: message(error) });
      }
    }

    async function write(
      baseUrl: string,
      entries: readonly SavedStyle[],
      table: StyleTable,
    ): Promise<void> {
      const current = generation;
      set({ status: 'saving', error: null });

      try {
        for (const entry of entries) await deps.saveStyle(baseUrl, entry, {});
        if (current !== generation) return;
        set({ status: 'ready', table, error: null });
      } catch (error) {
        if (current !== generation) return;
        set({ status: 'ready', error: message(error) });
      }
    }

    return {
      status: 'idle',
      table: EMPTY_STYLE_TABLE,
      loadedFrom: null,
      error: null,
      editing: null,

      async load(baseUrl) {
        if (get().status !== 'idle') return;
        await load(baseUrl);
      },

      refresh: load,

      async save(baseUrl, original, style) {
        if (get().loadedFrom !== baseUrl) return 'not-loaded';
        const result = upsertStyle(get().table, original, style);
        if (result.table === null || result.style === null) return result.error;

        await write(baseUrl, savedEntriesOf(original, result.style), result.table);
        return null;
      },

      async remove(baseUrl, name) {
        if (get().loadedFrom !== baseUrl) return;
        await write(baseUrl, [{ deleted: true, name }], removeStyle(get().table, name));
      },

      invalidate: () => {
        generation++;
        set({ status: 'idle', table: EMPTY_STYLE_TABLE, loadedFrom: null });
      },

      openEditor: (name, prompt) =>
        set({ editing: prompt === undefined ? { name } : { name, prompt } }),
      requestNewStyle: (prompt) =>
        set((state) =>
          state.editing === null
            ? { editing: { name: null, prompt }, newStyleRequest: null }
            : { newStyleRequest: prompt },
        ),
      newStyleRequest: null,
      clearNewStyleRequest: () => set({ newStyleRequest: null }),
      closeEditor: () => set({ editing: null, closeRequested: false, newStyleRequest: null }),
      closeRequested: false,
      requestCloseEditor: () => set({ closeRequested: true }),
      clearCloseRequest: () => set({ closeRequested: false }),
    };
  });
}

function savedEntriesOf(original: string | null, style: Style): SavedStyle[] {
  const entries: SavedStyle[] = [{ deleted: false, style }];
  if (original !== null && styleKey(original) !== styleKey(style.name)) {
    entries.push({ deleted: true, name: original });
  }
  return entries;
}

export const useStylesStore = createStylesStore({
  fetchTable: (baseUrl, options) => comfyPort().assets.fetchStyleTable(baseUrl, options),
  fetchSaved: (baseUrl, options) => comfyPort().assets.fetchSavedStyles(baseUrl, options),
  saveStyle: (baseUrl, entry, options) => comfyPort().assets.saveStyle(baseUrl, entry, options),
});

let liveDraft: Style | null = null;

function isStyle(value: unknown): value is Style {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.prompt === 'string' &&
    typeof value.negative === 'string' &&
    isRecord(value.other)
  );
}

export function reportStyleDraft(draft: Style | null): void {
  liveDraft = draft;
}

registerTabScoped('styleEditor', {
  capture: () => {
    const { editing } = useStylesStore.getState();
    if (editing === null) return undefined;
    return liveDraft === null ? editing : { ...editing, draft: liveDraft };
  },
  restore: (saved) => {
    const styles = useStylesStore.getState();
    if (isRecord(saved) && (typeof saved.name === 'string' || saved.name === null)) {
      const { name, prompt, draft } = saved;
      const editing = {
        name,
        ...(typeof prompt === 'string' ? { prompt } : {}),
        ...(isStyle(draft) ? { draft } : {}),
      };
      useStylesStore.setState({ editing, closeRequested: false });
    } else if (styles.editing !== null) {
      useStylesStore.setState({ editing: null, closeRequested: false, newStyleRequest: null });
    }
  },
});
