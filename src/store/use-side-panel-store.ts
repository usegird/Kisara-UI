import { create } from 'zustand';

export type SidePanelTab = 'queue' | 'history' | 'report' | 'settings';

interface SidePanelState {
  readonly tab: SidePanelTab;
  readonly setTab: (tab: SidePanelTab) => void;
}

export const useSidePanelStore = create<SidePanelState>()((set) => ({
  tab: 'queue',
  setTab: (tab) => set({ tab }),
}));
