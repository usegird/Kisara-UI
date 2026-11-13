import { useEffect } from 'react';

import type { NodeView } from '@/graph/rows';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 選択肢（COMBO）の遅延取得を、行が出た時点で走らせる。
// ─────────────────────────────

/** 出ている行のうち、選択肢が未取得のクラス名を集める */
function pendingClasses(views: readonly NodeView[]): string[] {
  const names = new Set<string>();

  for (const view of views) {
    for (const row of view.rows) {
      if (row.type !== 'COMBO' || row.options !== null || row.target === null) continue;

      names.add(row.target.kind === 'node' ? row.target.classType : row.target.innerClassType);
    }
  }
  return [...names].sort();
}

/**
 * 出ている行のうち選択肢が未取得のクラスを取りに行く。押されてから取ると、1 回目の操作が
 * 「読み込み」に消えて選択肢が開かない（押した時点ではまだ選択の欄になっていない）ので、出す段で取る。
 * 取るのはクラス単位で 1 回だけ（1 回は数 KB・数 ms）で、ストア側で重複を止める。
 */
export function useComboOptions(views: readonly NodeView[]): void {
  const baseUrl = useSettingsStore((state) => state.baseUrl);
  const ensureOptions = useDefinitionsStore((state) => state.ensureOptions);

  // 並びを鍵にして、同じ顔ぶれのままでは走らせない
  const pending = pendingClasses(views).join('\u0000');

  useEffect(() => {
    if (baseUrl.length === 0 || pending.length === 0) return;

    for (const className of pending.split('\u0000')) {
      void ensureOptions(baseUrl, className);
    }
  }, [pending, baseUrl, ensureOptions]);
}
