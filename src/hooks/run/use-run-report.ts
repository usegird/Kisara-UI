import { useShallow } from 'zustand/react/shallow';

import { outerFieldOf } from '@/graph/subgraph-values';
import { NODE_MODE } from '@/graph/types';
import { useNodeViews } from '@/hooks/flow/use-node-views';
import { useMissingModels } from '@/hooks/run/use-missing-models';
import { formatDateTime } from '@/i18n/format';
import { forbiddenRunGuide } from '@/queue/connection-guide';
import {
  buildRunReport,
  innerHeadingOf,
  lastRunFailureOf,
  withoutDismissed,
  type RunReport,
} from '@/queue/run-report';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useExecutionStore } from '@/store/use-execution-store';
import { useGraphStore } from '@/store/use-graph-store';
import { useQueueStore } from '@/store/use-queue-store';
import { useRunReportStore } from '@/store/use-run-report-store';
import { activeSession, useTabsStore } from '@/store/use-tabs-store';

export function useRunReport(): RunReport {
  const diagnostics = useRunReportStore((state) => state.diagnostics);
  const rejection = useRunReportStore((state) => state.rejection);
  const forbidden = useRunReportStore((state) => state.forbidden);
  const dismissed = useRunReportStore((state) => state.dismissed);
  const error = useExecutionStore((state) => state.error);
  const unknown = useExecutionStore((state) => state.status === 'unknown');
  const ranHere = useExecutionStore((state) => state.promptId !== null);
  const session = useTabsStore(activeSession);
  const history = useQueueStore((state) => state.history);
  const restored =
    ranHere || rejection !== null || forbidden ? null : lastRunFailureOf(history, session);
  const saveNotices = useRunReportStore((state) => state.saveNotices);
  const folderFixes = useRunReportStore((state) => state.folderFixes);
  const activeTab = useTabsStore((state) => state.activeId);
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

  const models = useMissingModels(loaded);
  const workflow = useGraphStore((state) => state.workflow);
  const definitions = useDefinitionsStore((state) => state.definitions);

  const origin = typeof globalThis.location === 'undefined' ? '' : globalThis.location.origin;
  const report = buildRunReport(
    {
      missing,
      missingModels: models.missing,
      namedModels: models.named,
      diagnostics,
      rejection,
      forbidden: forbidden ? forbiddenRunGuide(origin) : null,
      error: error ?? restored,
      unknown,
      saveNotices: saveNotices
        .filter((notice) => tabIds.includes(notice.tabId))
        .map((notice) => ({
          kind: notice.kind,
          name: notice.name,
          time: notice.savedAt === null ? null : formatDateTime(notice.savedAt),
        })),
      folderFixes: folderFixes.filter((fix) => fix.tabId === activeTab),
    },
    views,
    (promptNodeId) =>
      workflow === null ? null : innerHeadingOf(views, workflow, definitions, promptNodeId),
    (promptNodeId, inputName) =>
      workflow === null ? null : outerFieldOf(workflow, promptNodeId, inputName, definitions),
  );
  return withoutDismissed(report, dismissed);
}
