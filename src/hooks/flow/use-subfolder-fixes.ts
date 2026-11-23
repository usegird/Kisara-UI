import { useEffect } from 'react';

import { subfolderFixesOf } from '@/graph/model-subfolder';
import type { NodeView } from '@/graph/rows';
import { unscopedId } from '@/graph/subgraph-level';
import { useRowEditing } from '@/hooks/flow/use-row-editing';
import { useRunReportStore } from '@/store/use-run-report-store';
import { useTabsStore } from '@/store/use-tabs-store';

export function useSubfolderFixes(views: readonly NodeView[]): void {
  const { commitValue } = useRowEditing();
  const tabId = useTabsStore((state) => state.activeId);
  const addFolderFixes = useRunReportStore((state) => state.addFolderFixes);
  const fixes = subfolderFixesOf(views);

  useEffect(() => {
    if (fixes.length === 0) return;
    for (const fix of fixes) commitValue(fix.row, fix.to);
    addFolderFixes(
      fixes.map((fix) => ({
        tabId,
        promptNodeId: promptNodeIdOf(fix.viewId),
        widgetName: fix.row.widgetName,
        to: fix.to,
      })),
    );
  }, [fixes, tabId, commitValue, addFolderFixes]);
}

function promptNodeIdOf(viewId: number): string {
  const scoped = unscopedId(viewId);
  if (scoped === null) return String(viewId);
  return `${String(scoped.instanceId)}:${String(scoped.innerId)}`;
}
