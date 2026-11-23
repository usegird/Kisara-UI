import { useEffect, useState } from 'react';

import { formatComfyFailure } from '@/queue/comfy-failure-text';
import { useModelNotesStore } from '@/store/use-model-notes-store';
import { useSettingsStore } from '@/store/use-settings-store';

type ModelNotesStatus = 'idle' | 'loading' | 'ready' | 'error';

interface ModelNotesState {
  readonly status: ModelNotesStatus;
  readonly text: string | null;
  readonly error: string | null;
}

type SaveModelNotes = (text: string) => Promise<string | null>;

export interface ModelNotes extends ModelNotesState {
  readonly save: SaveModelNotes;
}

const IDLE: ModelNotesState = { status: 'idle', text: null, error: null };
const LOADING: ModelNotesState = { status: 'loading', text: null, error: null };

interface Result {
  readonly key: string;
  readonly state: ModelNotesState;
}

export function useModelNotes(folder: string, filename: string | null): ModelNotes {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const route = useModelNotesStore((state) => (state.baseUrl === baseUrl ? state.status : 'idle'));
  const ensureRoute = useModelNotesStore((state) => state.ensure);
  const routeError = useModelNotesStore((state) => state.error);
  const readNotes = useModelNotesStore((state) => state.read);
  const saveNotes = useModelNotesStore((state) => state.save);
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
    readNotes(baseUrl, folder, filename)
      .then((text) => {
        if (alive) setResult({ key, state: { status: 'ready', text, error: null } });
      })
      .catch((cause: unknown) => {
        if (alive) {
          setResult({
            key,
            state: { status: 'error', text: null, error: formatComfyFailure(cause) },
          });
        }
      });

    return () => {
      alive = false;
    };
  }, [active, key, baseUrl, folder, filename, readNotes]);

  const save: SaveModelNotes = async (text) => {
    if (!active || filename === null) return null;
    try {
      await saveNotes(baseUrl, folder, filename, text);
    } catch (cause) {
      return formatComfyFailure(cause);
    }
    setResult({ key, state: { status: 'ready', text, error: null } });
    return null;
  };

  if (!wanted) return { ...IDLE, save };
  if (route === 'error') return { status: 'error', text: null, error: routeError, save };
  return { ...(result?.key === key && active ? result.state : LOADING), save };
}
