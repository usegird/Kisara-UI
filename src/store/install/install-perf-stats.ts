import type { StoreApi } from 'zustand';

import {
  heapUsage,
  recordStat,
  resetStats,
  statsSnapshot,
  watchLongFrames,
  type HeapUsage,
} from '@/lib/perf-stats';
import { useAppValuesStore } from '@/store/use-app-values-store';
import { useConnectionStore } from '@/store/use-connection-store';
import { useDefinitionsStore } from '@/store/use-definitions-store';
import { useDialogStore } from '@/store/use-dialog-store';
import { useExecutionStore } from '@/store/use-execution-store';
import { useFaultStore } from '@/store/use-fault-store';
import { useGraphStore } from '@/store/use-graph-store';
import { useModelFilesStore } from '@/store/use-model-files-store';
import { useOutputImagesStore } from '@/store/use-output-images-store';
import { useQueueStore } from '@/store/use-queue-store';
import { useRepeatStore } from '@/store/use-repeat-store';
import { useRunReportStore } from '@/store/use-run-report-store';
import { useSettingsStore } from '@/store/use-settings-store';
import { useSidePanelStore } from '@/store/use-side-panel-store';
import { useStylesStore } from '@/store/use-styles-store';
import { useTabsStore } from '@/store/use-tabs-store';
import { useTagsStore } from '@/store/use-tags-store';
import { useTaskDetailStore } from '@/store/use-task-detail-store';
import { useTaskLogStore } from '@/store/use-task-log-store';
import { useViewerStore } from '@/store/use-viewer-store';
import { useWildcardsStore } from '@/store/use-wildcards-store';

// ─────────────────────────────
// 回数の台帳の取り付け（ストアの変化と長いフレームを数え、コンソールの `kisaraStats` で読む）。
// **開発と計測用ビルドでだけ**入口から読み込む（通常の本番ビルドには入らない）。
// ─────────────────────────────

/** 台帳の名前 → ストア。名前は `use-***-store` の *** */
const STORES: Readonly<Record<string, StoreApi<unknown>>> = {
  'app-values': useAppValuesStore,
  connection: useConnectionStore,
  definitions: useDefinitionsStore,
  dialog: useDialogStore,
  execution: useExecutionStore,
  fault: useFaultStore,
  graph: useGraphStore,
  'model-files': useModelFilesStore,
  'output-images': useOutputImagesStore,
  queue: useQueueStore,
  repeat: useRepeatStore,
  'run-report': useRunReportStore,
  settings: useSettingsStore,
  'side-panel': useSidePanelStore,
  styles: useStylesStore,
  tabs: useTabsStore,
  tags: useTagsStore,
  'task-detail': useTaskDetailStore,
  'task-log': useTaskLogStore,
  viewer: useViewerStore,
  wildcards: useWildcardsStore,
};

/** コンソールの `kisaraStats` で呼べる手続き */
interface PerfStatsConsole {
  readonly reset: () => void;
  readonly snapshot: typeof statsSnapshot;
  readonly table: () => void;
  /** 今の JS ヒープの量。計測用ビルドでなければ null */
  readonly heap: () => HeapUsage | null;
}

/** 回数だけの表（開発サーバの時間は StrictMode・HMR が乗り使えないので出さない） */
function countsOnly(): Record<string, number> {
  return Object.fromEntries(
    Object.entries(statsSnapshot()).map(([name, stat]) => [name, stat.count]),
  );
}

/** `profiling` は計測用ビルドか。違えば表に時間を出さない */
export function installPerfStats(profiling: boolean): void {
  for (const [name, store] of Object.entries(STORES)) {
    store.subscribe(() => recordStat(`store:${name}`));
  }
  watchLongFrames();

  const api: PerfStatsConsole = {
    reset: resetStats,
    snapshot: statsSnapshot,
    table: () => console.table(profiling ? statsSnapshot() : countsOnly()),
    heap: () => (profiling ? heapUsage() : null),
  };
  Object.assign(globalThis, { kisaraStats: api });
}
