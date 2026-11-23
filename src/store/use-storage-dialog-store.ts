import { create } from 'zustand';

export type StorageDialogStart = 'overview' | 'comfyBackup';

interface StorageDialogState {
  readonly isOpen: boolean;
  readonly start: StorageDialogStart;
  readonly staleUrl: string | null;
  readonly used: boolean;
  readonly open: (start?: StorageDialogStart) => void;
  readonly close: () => void;
  readonly markStale: (baseUrl: string) => void;
  readonly clearStale: () => void;
}

export const useStorageDialogStore = create<StorageDialogState>()((set) => ({
  isOpen: false,
  start: 'overview',
  staleUrl: null,
  used: false,
  open: (start = 'overview') => set({ isOpen: true, start, used: true }),
  close: () => set({ isOpen: false }),
  markStale: (baseUrl) => set({ staleUrl: baseUrl }),
  clearStale: () => set({ staleUrl: null }),
}));
