import { useEffect } from 'react';

import { useConnectionStore } from '@/store/use-connection-store';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useWorkflowToolsStore } from '@/store/use-workflow-tools-store';

// ─────────────────────────────
// 会話のタブを出したとき、呼べるワークフローの定義をまだ読んでいなければ読む。
// ─────────────────────────────

/**
 * つながっていて、ノード定義が揃っていれば（型が分からないと引数を作れない）、接続先ごとに 1 回だけ
 * 呼べるワークフローの定義を読む。以後は拡張のタブの「更新」だけで読み直す。
 */
export function useWorkflowToolsLoad(): void {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const connected = useConnectionStore((state) => state.status === 'connected');
  const ready = useDefinitionsStore((state) => state.definitions.size > 0);
  const loadedFor = useWorkflowToolsStore((state) => state.loadedFor);

  // 接続先（ComfyUI）から読む外との同期なので effect で行う
  useEffect(() => {
    if (connected && ready && baseUrl.length > 0 && loadedFor !== baseUrl) {
      void useWorkflowToolsStore.getState().refresh(baseUrl);
    }
  }, [baseUrl, connected, ready, loadedFor]);
}
