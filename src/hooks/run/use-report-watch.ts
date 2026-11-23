import { useEffect } from 'react';

import type { RunReport } from '@/queue/run-report';
import { useSidePanelStore } from '@/store/use-side-panel-store';
import { useTabsStore } from '@/store/use-tabs-store';

export function useReportWatch(report: RunReport): void {
  const watch = useSidePanelStore((state) => state.reportWatch);
  const clearReportWatch = useSidePanelStore((state) => state.clearReportWatch);
  const setTab = useSidePanelStore((state) => state.setTab);
  const activeId = useTabsStore((state) => state.activeId);
  const failed = report.errors > 0;

  useEffect(() => {
    if (watch === null) return;
    if (watch !== activeId) {
      clearReportWatch();
      return;
    }
    if (!failed) return;
    setTab('report');
    clearReportWatch();
  }, [watch, activeId, failed, setTab, clearReportWatch]);
}
