import { useShallow } from 'zustand/react/shallow';

import { NODE_MODE } from '@/graph/types';
import { useNodeViews } from '@/hooks/flow/use-node-views';
import { formatDateTime } from '@/i18n/format';
import { forbiddenRunGuide } from '@/queue/connection-guide';
import { buildRunReport, type RunReport } from '@/queue/run-report';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useExecutionStore } from '@/store/use-execution-store';
import { useRunReportStore } from '@/store/use-run-report-store';
import { useTabsStore } from '@/store/use-tabs-store';

// ─────────────────────────────
// エラーのタブの報告。タブの見出し（件数）・中身・実行の操作の失敗のアイコンが同じものを読む。
// まとめる計算は `run-report.ts`。
// ─────────────────────────────

/** 足りないノード・送る前の診断・拒否・実行の失敗・一時保存の注意をまとめた報告を返す */
export function useRunReport(): RunReport {
  const diagnostics = useRunReportStore((state) => state.diagnostics);
  const rejection = useRunReportStore((state) => state.rejection);
  const forbidden = useRunReportStore((state) => state.forbidden);
  const error = useExecutionStore((state) => state.error);
  const unknown = useExecutionStore((state) => state.status === 'unknown');
  // 一時保存の注意。閉じたタブの分は出さない
  const saveNotices = useRunReportStore((state) => state.saveNotices);
  const tabIds = useTabsStore(useShallow((state) => state.tabs.map((tab) => tab.id)));
  // 定義そのものが未取得のときは全ノードが該当してしまうので、案内のバナーに任せて出さない
  const loaded = useDefinitionsStore((state) => state.definitions.size > 0);
  // 隠しているカードも数える（出し入れで件数が変わらないように）
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

  const origin = typeof globalThis.location === 'undefined' ? '' : globalThis.location.origin;
  return buildRunReport(
    {
      missing,
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
