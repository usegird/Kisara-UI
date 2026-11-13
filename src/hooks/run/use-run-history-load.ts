import { useEffect } from 'react';

import { CHECKPOINT_FOLDER, DIFFUSION_MODEL_FOLDER, LORA_FOLDER } from '@/graph/model-files';
import { useConnectionStore } from '@/store/use-connection-store';
import { useModelFilesStore } from '@/store/use-model-files-store';
import { useRunHistoryStore } from '@/store/use-run-history-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { activeSession, useTabsStore } from '@/store/use-tabs-store';

// ─────────────────────────────
// 実行の記録を接続したときに読み直す。履歴のタブを開いていなくても読むので、タブの外（右の列）で持つ。
// ─────────────────────────────

/** つながったら実行の記録・モデルの区分の一覧・開いているセッションの名前を読む */
export function useRunHistoryLoad(): void {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const connected = useConnectionStore((state) => state.status === 'connected');
  const load = useRunHistoryStore((state) => state.load);
  const ensureModels = useModelFilesStore((state) => state.ensure);

  // 接続先（外のシステム）との同期。つながった・接続先が変わったときだけ読む。
  // モデルを区分（モデル・LoRA・その他）に分けるため、種別の一覧も取っておく（タスクの詳細でも使う）
  useEffect(() => {
    if (!connected) return;
    void load(baseUrl);
    for (const folder of [LORA_FOLDER, CHECKPOINT_FOLDER, DIFFUSION_MODEL_FOLDER]) {
      void ensureModels(baseUrl, folder);
    }
  }, [connected, baseUrl, load, ensureModels]);

  // 開いているタブのセッションの名前。つながったとき・タブやセッションを切り替えたときに読む
  const session = useTabsStore(activeSession);
  const loadSession = useRunHistoryStore((state) => state.loadSession);
  useEffect(() => {
    if (!connected) return;
    void loadSession(baseUrl);
  }, [connected, baseUrl, session, loadSession]);
}
