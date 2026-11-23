import { useEffect, useMemo, useState } from 'react';

import { t } from '@/i18n';
import type { OutputFileRef, OutputText } from '@/port/files';
import type { HistoryDetail } from '@/port/history';
import type { RunFailure } from '@/port/run';
import { formatComfyFailure } from '@/queue/comfy-failure-text';
import { pickImage } from '@/queue/outputs';
import type { QueueTask } from '@/queue/queue-tasks';
import { comfyPort } from '@/store/ports/comfy-port';

export interface TaskResult {
  readonly promptId: string;
  readonly nodes: Readonly<Record<string, unknown>> | null;
  readonly outputs: readonly OutputFileRef[];
  readonly texts: readonly OutputText[];
  readonly fromImage: boolean;
  readonly failure: RunFailure | null;
  readonly error: string | null;
}

interface TaskResultSource {
  readonly cached: unknown;
  readonly onDetail: (promptId: string, raw: unknown) => void;
  readonly rejected: boolean;
}

export function useTaskResult(
  task: QueueTask | null,
  baseUrl: string,
  { cached, onDetail, rejected }: TaskResultSource,
): TaskResult | null {
  const [result, setResult] = useState<TaskResult | null>(null);
  const promptId = task?.promptId ?? null;
  const firstImage = useMemo(() => pickImage(task?.outputs ?? []), [task]);

  useEffect(() => {
    if (promptId === null || baseUrl.length === 0) return;

    let alive = true;
    const load = async (): Promise<void> => {
      const kept = comfyPort().queue.entryNodesOf(cached);
      if (rejected || kept !== null) {
        setResult({
          promptId,
          nodes: kept,
          outputs: [],
          texts: rejected ? [] : comfyPort().queue.entryTextsOf(cached),
          fromImage: false,
          failure: rejected ? null : comfyPort().queue.entryFailureOf(cached),
          error: null,
        });
        return;
      }

      const detail: HistoryDetail | null = await comfyPort()
        .queue.fetchHistoryItem(baseUrl, promptId)
        .catch(() => null);
      if (detail !== null) {
        if (alive) {
          setResult({
            promptId,
            nodes: detail.nodes,
            outputs: detail.outputs,
            texts: comfyPort().queue.entryTextsOf(detail.entry),
            fromImage: false,
            failure: comfyPort().queue.entryFailureOf(detail.entry),
            error: null,
          });
          if (comfyPort().queue.entryNodesOf(detail.entry) !== null) {
            onDetail(promptId, detail.entry);
          }
        }
        return;
      }

      const nodes =
        firstImage === null
          ? null
          : await comfyPort().queue.fetchPromptFromImage(baseUrl, firstImage);
      if (!alive) return;

      if (nodes !== null) onDetail(promptId, { prompt: [null, promptId, nodes, {}, []] });

      setResult({
        promptId,
        nodes,
        outputs: [],
        texts: [],
        fromImage: nodes !== null,
        failure: null,
        error: nodes === null ? t('queue.detail.notFound') : null,
      });
    };

    load().catch((cause: unknown) => {
      if (!alive) return;
      setResult({
        promptId,
        nodes: null,
        outputs: [],
        texts: [],
        fromImage: false,
        failure: null,
        error: formatComfyFailure(cause),
      });
    });

    return () => {
      alive = false;
    };
  }, [promptId, baseUrl, firstImage, cached, onDetail, rejected]);

  return result !== null && result.promptId === promptId ? result : null;
}
