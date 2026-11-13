import type { StateCreator } from 'zustand';

import { normalizeModelSort } from '@/graph/model-files';
import { moveFloating } from '@/lib/floating-position';
import { resizeColumn } from '@/store/settings-fields/column-widths';
import { stepZoom, ZOOM_DEFAULT } from '@/store/settings-fields/column-zoom';
import { normalizingSetterOf, setterOf } from '@/store/settings-fields/settings-table';
import { normalizeViewerGrid } from '@/store/settings-fields/viewer-grid';
import type { SettingsState } from '@/store/use-settings-store';

// ─────────────────────────────
// 設定のストアの、ワークフローの画面の見え方（表示の切り替え・配色・モデル選択・実行の記録・ビューワー・列の幅と倍率）の操作。
// ─────────────────────────────

/** この slice が持つ操作 */
type SettingsViewActions = Pick<
  SettingsState,
  | 'setShowControlNodes'
  | 'setShowUnlinkedNodes'
  | 'setShowPassedLines'
  | 'setTheme'
  | 'setModelCardHeight'
  | 'setModelSort'
  | 'setImageSortAscending'
  | 'setLoraCopyFormat'
  | 'setRecordRunHistory'
  | 'setRunHistoryLimit'
  | 'moveControl'
  | 'setViewerGrid'
  | 'setSlideshowSeconds'
  | 'resizeColumn'
  | 'stepColumnZoom'
  | 'resetColumnZoom'
  | 'stepNarrowZoom'
  | 'resetNarrowZoom'
>;

/** ワークフローの画面の見え方（表示の切り替え・配色・モデル選択・実行の記録・ビューワー・列の幅と倍率）の操作を作る */
export const createSettingsViewSlice: StateCreator<
  SettingsState,
  [['zustand/persist', unknown]],
  [],
  SettingsViewActions
> = (set) => ({
  setShowControlNodes: setterOf(set, 'showControlNodes'),
  setShowUnlinkedNodes: setterOf(set, 'showUnlinkedNodes'),
  setShowPassedLines: setterOf(set, 'showPassedLines'),
  setTheme: setterOf(set, 'theme'),
  setModelCardHeight: normalizingSetterOf(set, 'modelCardHeight'),
  setModelSort: (patch) =>
    set((state) => ({ modelSort: normalizeModelSort({ ...state.modelSort, ...patch }) })),
  setImageSortAscending: setterOf(set, 'imageSortAscending'),
  setLoraCopyFormat: setterOf(set, 'loraCopyFormat'),
  setRecordRunHistory: setterOf(set, 'recordRunHistory'),
  setRunHistoryLimit: normalizingSetterOf(set, 'runHistoryLimit'),
  moveControl: (from, dx, dy) => set({ controlPosition: moveFloating(from, dx, dy) }),
  setViewerGrid: (patch) =>
    set((state) => ({ viewerGrid: normalizeViewerGrid({ ...state.viewerGrid, ...patch }) })),
  setSlideshowSeconds: normalizingSetterOf(set, 'slideshowSeconds'),
  resizeColumn: (column, delta) =>
    set((state) => ({
      columnWidths: {
        ...state.columnWidths,
        [column]: resizeColumn(column, state.columnWidths[column], delta),
      },
    })),
  stepColumnZoom: (column, direction) =>
    set((state) => ({
      columnZooms: {
        ...state.columnZooms,
        [column]: stepZoom(state.columnZooms[column], direction),
      },
    })),
  resetColumnZoom: (column) =>
    set((state) => ({ columnZooms: { ...state.columnZooms, [column]: ZOOM_DEFAULT } })),
  stepNarrowZoom: (direction) =>
    set((state) => ({ narrowZoom: stepZoom(state.narrowZoom, direction) })),
  resetNarrowZoom: () => set({ narrowZoom: ZOOM_DEFAULT }),
});
