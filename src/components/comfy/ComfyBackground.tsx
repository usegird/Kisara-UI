import { useQueueWatch } from '@/hooks/run/use-queue-watch';
import { useRepeatRunDriver } from '@/hooks/run/use-repeat-run';
import { useRunHistoryLoad } from '@/hooks/run/use-run-history-load';

// ─────────────────────────────
// ComfyUI の見張り。描くものは無い。
// どのタブを見ていても・右の列を縮めても続けるので、右の列の部品ではなく外枠の下に常に置く。
// ─────────────────────────────

/** キューの見張り・繰り返し実行の送り・実行の記録の読み直しを、外枠の下で動かし続ける */
export function ComfyBackground(): null {
  // 取り直しと立て直しは、どのタブを見ていても続ける
  useQueueWatch();
  // 繰り返し実行の送りも同じ理由でここに置く（1 か所だけ）
  useRepeatRunDriver();
  // 実行の記録は、履歴のタブを開いていなくても接続したときに読み直す
  useRunHistoryLoad();
  return null;
}
