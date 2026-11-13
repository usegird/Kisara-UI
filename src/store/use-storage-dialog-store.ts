import { create } from 'zustand';

// ─────────────────────────────
// ストレージの管理を出すかと、古いバックアップの知らせを
// 出すか。設定の欄と知らせのどちらから開いても同じ 1 つを出す。画面の中だけに持つ（端末に残さない）
// ─────────────────────────────

/** 開いたときに出す場所 */
export type StorageDialogStart = 'overview' | 'comfyBackup';

interface StorageDialogState {
  readonly isOpen: boolean;
  readonly start: StorageDialogStart;
  /** 古いバックアップの知らせを出しているか */
  readonly staleNotice: boolean;
  /** 一度でも開いた・知らせたか（それまではダイアログの部品を読まない） */
  readonly used: boolean;
  readonly open: (start?: StorageDialogStart) => void;
  readonly close: () => void;
  readonly notifyStale: () => void;
  readonly closeStaleNotice: () => void;
}

export const useStorageDialogStore = create<StorageDialogState>()((set) => ({
  isOpen: false,
  start: 'overview',
  staleNotice: false,
  used: false,
  open: (start = 'overview') => set({ isOpen: true, start, used: true }),
  close: () => set({ isOpen: false }),
  notifyStale: () => set({ staleNotice: true, used: true }),
  closeStaleNotice: () => set({ staleNotice: false }),
}));
