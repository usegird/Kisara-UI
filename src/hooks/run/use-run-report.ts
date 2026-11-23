import { useShallow } from 'zustand/react/shallow';

import { NODE_MODE } from '@/graph/types';
import { useNodeViews } from '@/hooks/flow/use-node-views';
import { useMissingModels } from '@/hooks/run/use-missing-models';
import { formatDateTime } from '@/i18n/format';
import { forbiddenRunGuide } from '@/queue/connection-guide';
import { buildRunReport, type RunReport } from '@/queue/run-report';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useExecutionStore } from '@/store/use-execution-store';
import { useRunReportStore } from '@/store/use-run-report-store';
import { useTabsStore } from '@/store/use-tabs-store';

export function useRunReport(): RunReport {
  const diagnostics = useRunReportStore((state) => state.diagnostics);
  const rejection = useRunReportStore((state) => state.rejection);
  const forbidden = useRunReportStore((state) => state.forbidden);
  const error = useExecutionStore((state) => state.error);
  const unknown = useExecutionStore((state) => state.status === 'unknown');
  const saveNotices = useRunReportStore((state) => state.saveNotices);
  const tabIds = useTabsStore(useShallow((state) => state.tabs.map((tab) => tab.id)));
  const loaded = useDefinitionsStore((state) => state.definitions.size > 0);
  const views = useNodeViews({ includeHidden: true });

  const missing = loaded
    ? views
        .filter((view) => view.kind === 'unknown' && view.linked)
        .map((view) => ({
          nodeId: view.id,
          classType: view.classType,
          disabled: view.mode === NODE_MODE.mute || view.mode === NODE_MODE.bypass,
        }))
    : [];

  const missingModels = useMissingModels(loaded);

  const origin = typeof globalThis.location === 'undefined' ? '' : globalThis.location.origin;
  return buildRunReport(
    {
      missing,
      missingModels,
      diagnostics,
      rejection,
      forbidden: forbidden ? forbiddenRunGuide(origin) : null,
      error,
      unknown,
      saveNotices: saveNotices
        .filter((notice) => tabIds.includes(notice.tabId))
        .map((notice) => ({
          kind: notice.kind,
          name: notice.name,
          time: notice.savedAt === null ? null : formatDateTime(notice.savedAt),
        })),
    },
    views,
  );
}
