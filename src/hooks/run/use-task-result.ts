import { useEffect, useMemo, useState } from 'react';

import { t } from '@/i18n';
import type { OutputFileRef } from '@/port/files';
import type { HistoryDetail } from '@/port/history';
import type { RunFailure } from '@/port/run';
import { formatComfyFailure } from '@/queue/comfy-failure-text';
import { pickImage } from '@/queue/outputs';
import type { QueueTask } from '@/queue/queue-tasks';
import { comfyPort } from '@/store/ports/comfy-port';

// ─────────────────────────────
// キューの詳細に出す実行の内容を取り（`GET /history/{prompt_id}`）、結果を組み立てる
// ─────────────────────────────

/** 取得結果。タスクごとに持つ（開き直したときに前のタスクの内容を見せない） */
export interface TaskResult {
  readonly promptId: string;
  readonly nodes: Readonly<Record<string, unknown>> | null;
  readonly outputs: readonly OutputFileRef[];
  readonly fromImage: boolean;
  /** 履歴に残った失敗の記録。成功・記録なし・画像から読んだときは null */
  readonly failure: RunFailure | null;
  readonly error: string | null;
}

/** 実行内容を読む元（控え・控える先・断られたか） */
interface TaskResultSource {
  /** 一度読めた応答の控え */
  readonly cached: unknown;
  readonly onDetail: (promptId: string, raw: unknown) => void;
  /** 投入を断られたタスクか（ComfyUI に居ないので問い合わせない） */
  readonly rejected: boolean;
}

/**
 * 開いているタスクの実行内容。履歴に無ければ生成画像の埋め込み（PNG の `tEXt(prompt)`）から読む。
 * ComfyUI の履歴はメモリ上にあり、再起動で消えるため。
 * 今のタスクの結果がまだ無ければ null
 */
export function useTaskResult(
  task: QueueTask | null,
  baseUrl: string,
  { cached, onDetail, rejected }: TaskResultSource,
): TaskResult | null {
  const [result, setResult] = useState<TaskResult | null>(null);
  const promptId = task?.promptId ?? null;
  // **参照を固定する**。毎描画で作り直すと副作用が回り続けて結果が確定しない
  // （正しさに要るので compiler に任せず手で固定する）
  // メタデータの読み先は **`output` を優先**（`temp` は再起動で消える）
  const firstImage = useMemo(() => pickImage(task?.outputs ?? []), [task]);

  useEffect(() => {
    if (promptId === null || baseUrl.length === 0) return;

    let alive = true;
    const load = async (): Promise<void> => {
      // 一度読めているものは取りに行かない（履歴が消えていても出せる）
      const kept = comfyPort().queue.entryNodesOf(cached);
      // 断られたタスクは ComfyUI に居ないので問い合わせない。送った内容があればそれを出す
      if (rejected || kept !== null) {
        setResult({
          promptId,
          nodes: kept,
          outputs: [],
          fromImage: false,
          failure: rejected ? null : comfyPort().queue.entryFailureOf(cached),
          error: null,
        });
        return;
      }

      // 履歴が引けなくても画像から読めることがあるので、ここでは落とさない
      const detail: HistoryDetail | null = await comfyPort()
        .queue.fetchHistoryItem(baseUrl, promptId)
        .catch(() => null);
      if (detail !== null) {
        if (alive) {
          setResult({
            promptId,
            nodes: detail.nodes,
            outputs: detail.outputs,
            fromImage: false,
            failure: comfyPort().queue.entryFailureOf(detail.entry),
            error: null,
          });
          // 読み戻せない応答は控えない（控えが変わるたびに取り直すので、問い合わせ続けることになる）
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

      // 画像から読んだ場合は、履歴と同じ形（`prompt[2]` に API Prompt）に整えて控える
      if (nodes !== null) onDetail(promptId, { prompt: [null, promptId, nodes, {}, []] });

      setResult({
        promptId,
        nodes,
        outputs: [],
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
