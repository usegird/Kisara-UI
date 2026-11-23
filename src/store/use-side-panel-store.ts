import { create } from 'zustand';

export type SidePanelTab = 'queue' | 'history' | 'report' | 'settings';

interface SidePanelState {
  readonly tab: SidePanelTab;
  readonly setTab: (tab: SidePanelTab) => void;
  readonly reportWatch: string | null;
  readonly watchReport: (tabId: string) => void;
  readonly clearReportWatch: () => void;
}

export const useSidePanelStore = create<SidePanelState>()((set) => ({
  tab: 'queue',
  setTab: (tab) => set({ tab }),
  reportWatch: null,
  watchReport: (tabId) => set({ reportWatch: tabId }),
  clearReportWatch: () => set({ reportWatch: null }),
}));
