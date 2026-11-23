import { useEffect, useState } from 'react';

import {
  applyModelJsonEdit,
  type ModelJsonEditValue,
  type ModelJsonSource,
} from '@/graph/model-json-edits';
import { formatComfyFailure } from '@/queue/comfy-failure-text';
import { useModelNotesStore } from '@/store/use-model-notes-store';
import { useSettingsStore } from '@/store/use-settings-store';

type ModelJsonStatus = 'idle' | 'loading' | 'ready' | 'error';

interface ModelJsonLoad {
  readonly status: ModelJsonStatus;
  readonly source: ModelJsonSource | null;
  readonly error: string | null;
}

type SaveModelJson = (key: string, value: ModelJsonEditValue) => Promise<string | null>;

export interface ModelJsonState extends ModelJsonLoad {
  readonly save: SaveModelJson;
}

const IDLE: ModelJsonLoad = { status: 'idle', source: null, error: null };
const LOADING: ModelJsonLoad = { status: 'loading', source: null, error: null };

interface Result {
  readonly key: string;
  readonly state: ModelJsonLoad;
}

export function useModelJson(folder: string, filename: string | null): ModelJsonState {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const route = useModelNotesStore((state) => (state.baseUrl === baseUrl ? state.status : 'idle'));
  const ensureRoute = useModelNotesStore((state) => state.ensure);
  const readJson = useModelNotesStore((state) => state.readJson);
  const saveJsonEdits = useModelNotesStore((state) => state.saveJsonEdits);
  const [result, setResult] = useState<Result | null>(null);

  const wanted = filename !== null && baseUrl.length > 0;
  const active = wanted && route === 'ready';
  const key = active ? [baseUrl, folder, filename].join(' ') : '';

  useEffect(() => {
    if (wanted) void ensureRoute(baseUrl);
  }, [wanted, baseUrl, ensureRoute]);

  useEffect(() => {
    if (!active || filename === null) return;

    let alive = true;
    readJson(baseUrl, folder, filename)
      .then((source) => {
        if (alive) setResult({ key, state: { status: 'ready', source, error: null } });
      })
      .catch((cause: unknown) => {
        if (!alive) return;
        const error = formatComfyFailure(cause);
        setResult({ key, state: { status: 'error', source: null, error } });
      });

    return () => {
      alive = false;
    };
  }, [active, key, baseUrl, folder, filename, readJson]);

  const current = result?.key === key && active ? result.state : null;

  const save: SaveModelJson = async (field, value) => {
    const source = current?.source;
    if (!active || filename === null || source === null || source === undefined) return null;
    const edits = applyModelJsonEdit(source, field, value);
    try {
      await saveJsonEdits(baseUrl, folder, filename, edits);
    } catch (cause) {
      return formatComfyFailure(cause);
    }
    const next = { original: source.original, edits };
    setResult({ key, state: { status: 'ready', source: next, error: null } });
    return null;
  };

  if (!wanted) return { ...IDLE, save };
  if (route === 'error') return { ...IDLE, save };
  return { ...(current ?? LOADING), save };
}
