import { create } from 'zustand';

interface DiagnosticsDialogState {
  readonly isOpen: boolean;
  readonly open: () => void;
  readonly close: () => void;
}

export const useDiagnosticsDialogStore = create<DiagnosticsDialogState>()((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
