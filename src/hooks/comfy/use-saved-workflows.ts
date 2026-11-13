import { useEffect, useState } from 'react';

import type { SavedWorkflow } from '@/port/workflows';
import { formatComfyFailure } from '@/queue/comfy-failure-text';
import { comfyPort } from '@/store/ports/comfy-port';

// ─────────────────────────────
// ComfyUI に保存されているワークフローの一覧。開くダイアログとハンバーガーメニューの一覧で共有する。
// ─────────────────────────────

/** 保存されているワークフローの一覧と、取れなかった理由 */
interface SavedWorkflows {
  /** 読み込み中は null */
  readonly items: readonly SavedWorkflow[] | null;
  readonly error: string | null;
}

/**
 * 出している間に 1 回だけ一覧を取る（自動更新はしない）。
 * @param active - true の間だけ取る（開き直すたびに取り直す）
 * @param baseUrl - 空なら取らない
 */
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
