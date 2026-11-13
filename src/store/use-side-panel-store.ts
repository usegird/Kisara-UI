import { create } from 'zustand';

// ─────────────────────────────
// 右の列で選んでいるタブ。実行の操作の失敗のアイコンからも切り替えるので、
// 列の中の state ではなくここに置く。**端末には残さない**（読み込み直すとキューに戻る）。
// ─────────────────────────────

/** 右の列のタブ */
export type SidePanelTab = 'queue' | 'history' | 'report' | 'settings';

/** 右の列で選んでいるタブと、切り替える操作 */
interface SidePanelState {
  readonly tab: SidePanelTab;
  readonly setTab: (tab: SidePanelTab) => void;
}

export const useSidePanelStore = create<SidePanelState>()((set) => ({
  tab: 'queue',
  setTab: (tab) => set({ tab }),
}));
