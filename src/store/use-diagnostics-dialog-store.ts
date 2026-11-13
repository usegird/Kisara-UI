import { create } from 'zustand';

// ─────────────────────────────
// 「診断ファイルを書き出す」のダイアログを出すか。設定の欄・失敗の知らせ・
// タブバーの印のどこから開いても同じ 1 つを出す。画面の中だけに持つ（端末に残さない）
// ─────────────────────────────

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
