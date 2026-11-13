// ─────────────────────────────
// 「接続する」のダイアログ（ComfyUI・LLM）を出すか。再接続で頼まれたら出し、一度閉じたら自動では出さない。
// 画面の中だけに持つ（端末に残さない）。
// ─────────────────────────────

/** 接続のダイアログを出すかと、出す・閉じる操作 */
export interface ConnectDialogFlags {
  /** 再接続のボタンで出すよう頼まれている */
  readonly requested: boolean;
  /** 一度閉じた（自動では出さない） */
  readonly dismissed: boolean;
  /** 出す（再接続のボタン） */
  readonly open: () => void;
  /** 閉じる（×・Esc・会話を始める） */
  readonly close: () => void;
}

/** 接続のダイアログの状態と操作を作る（ストアの初めの値に広げる） */
export function createConnectDialogFlags(
  set: (patch: Partial<Pick<ConnectDialogFlags, 'requested' | 'dismissed'>>) => void,
): ConnectDialogFlags {
  return {
    requested: false,
    dismissed: false,
    open: () => set({ requested: true }),
    close: () => set({ requested: false, dismissed: true }),
  };
}
