import { useCallback, useRef } from 'react';

import {
  formatLoraCopy,
  usesFetchedParts,
  usesJsonKeys,
  usesLearnText,
  usesMemo,
} from '@/graph/model-files';
import { mergeModelJson } from '@/graph/model-json-edits';
import { summarizeModelMetadata } from '@/graph/model-metadata';
import { holdPreviewSlots } from '@/hooks/ui/use-preview-slot';
import { t } from '@/i18n';
import { formatComfyFailure } from '@/queue/comfy-failure-text';
import { comfyPort } from '@/store/ports/comfy-port';
import { useModelNotesStore, type ModelNotesStoreState } from '@/store/use-model-notes-store';
import { useSettingsStore } from '@/store/use-settings-store';

const NO_JSON: ReadonlyMap<string, string> = new Map();

type LoraTextResult = { readonly text: string } | { readonly error: string };

type LoraText = (folder: string, value: string) => Promise<LoraTextResult>;

export function useLoraText(): LoraText {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const format = useSettingsStore((state) => state.loraCopyFormat);

  return useCallback(
    async (folder, value) => {
      if (!usesFetchedParts(format)) return { text: formatLoraCopy(format, value) };
      const resume = holdPreviewSlots();
      try {
        const [learned, memo, json] = await Promise.all([
          part(usesLearnText(format), [], 'insertBar.lora.triggersFailed', async () => {
            const metadata = await comfyPort().models.fetchMetadata(baseUrl, folder, value);
            return summarizeModelMetadata(metadata).triggers;
          }),
          part(usesMemo(format), '', 'insertBar.lora.memoFailed', async () => {
            return (await readMemo(baseUrl, folder, value)) ?? '';
          }),
          part(usesJsonKeys(format), NO_JSON, 'insertBar.lora.jsonFailed', () =>
            readJson(baseUrl, folder, value),
          ),
        ]);
        return { text: formatLoraCopy(format, value, { learned, memo, json }) };
      } catch (cause) {
        if (cause instanceof PartFailure) return { error: cause.message };
        throw cause;
      } finally {
        resume();
      }
    },
    [baseUrl, format],
  );
}

class PartFailure extends Error {}

type PartFailureKey =
  'insertBar.lora.triggersFailed' | 'insertBar.lora.memoFailed' | 'insertBar.lora.jsonFailed';

async function part<T>(
  used: boolean,
  fallback: T,
  failure: PartFailureKey,
  load: () => Promise<T>,
): Promise<T> {
  if (!used) return fallback;
  try {
    return await load();
  } catch (cause) {
    throw new PartFailure(t(failure, { message: formatComfyFailure(cause) }));
  }
}

async function readJson(
  baseUrl: string,
  folder: string,
  value: string,
): Promise<ReadonlyMap<string, string>> {
  const notes = await readyNotesRoute(baseUrl);
  if (notes === null) return NO_JSON;
  const merged = mergeModelJson(await notes.readJson(baseUrl, folder, value));
  return new Map(merged.map((entry) => [entry.key, entry.value]));
}

async function readMemo(baseUrl: string, folder: string, value: string): Promise<string | null> {
  const notes = await readyNotesRoute(baseUrl);
  if (notes === null) return null;
  return notes.read(baseUrl, folder, value);
}

async function readyNotesRoute(baseUrl: string): Promise<ModelNotesStoreState | null> {
  await useModelNotesStore.getState().ensure(baseUrl);
  if (useModelNotesStore.getState().status === 'loading') {
    await new Promise<void>((resolve) => {
      const unsubscribe = useModelNotesStore.subscribe((state) => {
        if (state.status === 'loading') return;
        unsubscribe();
        resolve();
      });
    });
  }
  const notes = useModelNotesStore.getState();
  return notes.status === 'ready' && notes.baseUrl === baseUrl ? notes : null;
}

export interface LoraDragText {
  readonly prepare: (value: string) => void;
  readonly peek: (value: string) => LoraTextResult | null;
  readonly resolve: (value: string) => Promise<LoraTextResult>;
}

interface LoraTextCache {
  readonly source: LoraText;
  readonly pending: Map<string, Promise<LoraTextResult>>;
  readonly done: Map<string, LoraTextResult>;
}

export function useLoraDragText(folder: string): LoraDragText {
  const format = useSettingsStore((state) => state.loraCopyFormat);
  const loraText = useLoraText();
  const cache = useRef<LoraTextCache | null>(null);

  const current = (): LoraTextCache => {
    if (cache.current?.source !== loraText) {
      cache.current = { source: loraText, pending: new Map(), done: new Map() };
    }
    return cache.current;
  };

  const resolve = (value: string): Promise<LoraTextResult> => {
    if (!usesFetchedParts(format)) {
      return Promise.resolve({ text: formatLoraCopy(format, value) });
    }
    const entry = current();
    const started = entry.pending.get(value);
    if (started !== undefined) return started;
    const next = loraText(folder, value).then((result) => {
      entry.done.set(value, result);
      return result;
    });
    entry.pending.set(value, next);
    return next;
  };

  const prepare = (value: string): void => void resolve(value);

  const peek = (value: string): LoraTextResult | null => {
    if (!usesFetchedParts(format)) return { text: formatLoraCopy(format, value) };
    return current().done.get(value) ?? null;
  };

  return { prepare, peek, resolve };
}
