import { useShallow } from 'zustand/react/shallow';

import { useTabRunning } from '@/hooks/run/use-tab-running';
import { t } from '@/i18n';
import { useGraphStore } from '@/store/use-graph-store';
import { EMPTY_SNAPSHOT, useTabsStore, type TabLabel } from '@/store/use-tabs-store';

// ─────────────────────────────
// ワークフローのタブの見出し。外殻のタブバーは種別を知らないので、見出しの読み方を種別の層から渡す。
// ─────────────────────────────

/**
 * ワークフローのタブの名前と未保存の印と、そのタブから投げたタスクが実行中かを返す。タブ 1 枚ごとに呼ぶ。
 * 二重管理を避け、アクティブなタブだけはグラフストアの値を直接読む（控えは切り替えた時点のもの）。
 * アクティブでないタブはグラフストアの変化で描き直さない（名前を打つたびに全タブが描き直しにならない）。
 */
export function useWorkflowTabLabel(id: string): TabLabel {
  const active = useTabsStore((state) => state.activeId === id);
  const snapshot = useTabsStore(
    useShallow((state): TabLabel => {
      const saved = state.snapshots[id] ?? EMPTY_SNAPSHOT;
      return { name: saved.name, dirty: saved.dirty };
    }),
  );
  const live = useGraphStore(
    useShallow((state): TabLabel | null =>
      active ? { name: state.name, dirty: state.dirty } : null,
    ),
  );
  const running = useTabRunning(id);
  const label = live ?? snapshot;
  return running ? { ...label, busy: true, busyLabel: t('app.tabs.running') } : label;
}
