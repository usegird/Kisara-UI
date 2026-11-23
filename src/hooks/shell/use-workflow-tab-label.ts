import { useShallow } from 'zustand/react/shallow';

import { useTabRunning } from '@/hooks/run/use-tab-running';
import { t } from '@/i18n';
import { useGraphStore } from '@/store/use-graph-store';
import { EMPTY_SNAPSHOT, useTabsStore, type TabLabel } from '@/store/use-tabs-store';

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
