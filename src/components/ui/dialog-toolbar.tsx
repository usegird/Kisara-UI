// ─────────────────────────────
// ダイアログの操作の帯。見出しの帯のすぐ下、**列ごとに**置く 1 行。
// ─────────────────────────────

/** 操作の帯の props */
export interface DialogToolbarProps {
  /** 読み上げの名前 */
  readonly label: string;
  readonly children: React.ReactNode;
}

/** 操作の帯。高さは固定にする（左右の列の帯の下端を揃える） */
export function DialogToolbar({ label, children }: DialogToolbarProps): React.ReactElement {
  return (
    <div
      role="toolbar"
      aria-label={label}
      // 高さ 32px。区切りの線 1px はその外に足す（見出しの帯と同じ扱い）
      className="box-content flex h-8 shrink-0 items-center gap-2 overflow-hidden border-b px-3
        text-xs"
    >
      {children}
    </div>
  );
}
