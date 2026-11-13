import { useCallback, useState } from 'react';

import { t } from '@/i18n';
import type { HistoryRun } from '@/queue/run-history-view';
import { openWorkflow } from '@/store/persist/workflow-file';
import { comfyPort } from '@/store/ports/comfy-port';
import { useSettingsStore } from '@/store/use-settings-store';
import { useTabsStore } from '@/store/use-tabs-store';

// ─────────────────────────────
// 記録の実行をワークフローとして開く。記録は Workflow JSON を持たないので、出力の PNG に埋まったものを読む。
// ─────────────────────────────

/** 記録の実行を開く手続きと、読んでいる途中か・開けなかった理由 */
interface OpenRunWorkflow {
  readonly open: (run: HistoryRun) => Promise<void>;
  /** 画像を読んでいる */
  readonly opening: boolean;
  /** 開けなかった理由。無ければ null */
  readonly error: string | null;
  /** 理由を消す（隣のカードへ移ったとき） */
  readonly clearError: () => void;
}

/** 押したときだけ出力の PNG を順に読み、埋まった Workflow JSON が見つかったところで開いて止める */
export function useOpenRunWorkflow(): OpenRunWorkflow {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // compiler はこのフックを飛ばす（catch の無い try を扱えない）ので、渡す手続きは手で固定する
  const open = useCallback(
    async (run: HistoryRun): Promise<void> => {
      setOpening(true);
      setError(null);
      try {
        const pngs = run.outputs.filter((file) => /\.png$/iu.test(file.filename));
        for (const file of pngs) {
          // 消えた画像・読めない画像は飛ばして次を読む
          const workflow = await comfyPort()
            .queue.fetchWorkflowFromImage(baseUrl, file)
            .catch(() => null);
          if (workflow === null) continue;
          // 中身のあるタブを開いていたら、新しいタブへ開く
          useTabsStore.getState().prepareOpen();
          try {
            // 開くタブの名前は、その実行のワークフロー名（セッション名ではない）
            openWorkflow(workflow, run.entry.name ?? t('history.card.unnamed'));
            return;
          } catch {
            // Workflow JSON の形でなければ次の画像を読む
          }
        }
        setError(t('history.detail.openFailed'));
      } finally {
        setOpening(false);
      }
    },
    [baseUrl],
  );

  const clearError = useCallback(() => setError(null), []);
  return { open, opening, error, clearError };
}
