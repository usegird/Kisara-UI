import { useEffect, useState } from 'react';

import { summarizeModelMetadata, type ModelInfo } from '@/graph/model-metadata';
import { formatComfyFailure } from '@/queue/comfy-failure-text';
import { comfyPort } from '@/store/ports/comfy-port';
import { useSettingsStore } from '@/store/use-settings-store';

type ModelMetadataStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ModelMetadataState {
  readonly status: ModelMetadataStatus;
  readonly info: ModelInfo | null;
  readonly error: string | null;
}

const IDLE: ModelMetadataState = { status: 'idle', info: null, error: null };
const LOADING: ModelMetadataState = { status: 'loading', info: null, error: null };

interface Result {
  readonly key: string;
  readonly state: ModelMetadataState;
}

export function useModelMetadata(folder: string, filename: string | null): ModelMetadataState {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const [result, setResult] = useState<Result | null>(null);

  const active = filename !== null && baseUrl.length > 0;
  const key = active ? [baseUrl, folder, filename].join(' ') : '';

  useEffect(() => {
    if (!active || filename === null) return;

    let alive = true;
    comfyPort()
      .models.fetchMetadata(baseUrl, folder, filename, {})
      .then((metadata) => {
        if (!alive) return;
        setResult({
          key,
          state: { status: 'ready', info: summarizeModelMetadata(metadata), error: null },
        });
      })
      .catch((cause: unknown) => {
        if (!alive) return;
        const message = formatComfyFailure(cause);
        setResult({ key, state: { status: 'error', info: null, error: message } });
      });

    return () => {
      alive = false;
    };
  }, [active, key, baseUrl, folder, filename]);

  if (!active) return IDLE;

  return result?.key === key ? result.state : LOADING;
}
