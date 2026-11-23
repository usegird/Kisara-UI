import { useEffect, useState } from 'react';

import type { SavedWorkflow } from '@/port/workflows';
import { formatComfyFailure } from '@/queue/comfy-failure-text';
import { comfyPort } from '@/store/ports/comfy-port';

interface SavedWorkflows {
  readonly items: readonly SavedWorkflow[] | null;
  readonly error: string | null;
}

export function useSavedWorkflows(active: boolean, baseUrl: string): SavedWorkflows {
  const [result, setResult] = useState<SavedWorkflows>({ items: null, error: null });

  useEffect(() => {
    if (!active || baseUrl.trim().length === 0) return;

    let alive = true;
    comfyPort()
      .workflows.list(baseUrl)
      .then((items) => {
        if (alive) setResult({ items, error: null });
      })
      .catch((cause: unknown) => {
        if (!alive) return;
        setResult({ items: [], error: formatComfyFailure(cause) });
      });

    return () => {
      alive = false;
    };
  }, [active, baseUrl]);

  return result;
}
