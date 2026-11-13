// ─────────────────────────────
// ダイアログの左の列（フォルダ）の出し方の巡り。モデル選びとストレージの管理で共通に使う。
// ピン止めは呼び出し元が端末に残す。
// ─────────────────────────────

/** 押した次の形。`pin` はピン止めを変えるときだけ */
export function directoryCycle(
  pinned: boolean,
  shown: boolean,
): { readonly pin?: boolean; readonly shown: boolean } {
  if (pinned) return { pin: false, shown: false };
  return shown ? { pin: true, shown: false } : { shown: true };
}

/** 切り替えのアイコンに渡す今の形 */
export function directoryStateOf(pinned: boolean, shown: boolean): 'pinned' | 'shown' | 'hidden' {
  if (pinned) return 'pinned';
  return shown ? 'shown' : 'hidden';
}
