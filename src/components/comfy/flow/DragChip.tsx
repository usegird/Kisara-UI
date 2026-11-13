// ─────────────────────────────
// 掴んでいるもの（出力チップ・変数ボックス）をカーソルに付けて出す見た目。
// DragOverlay の中身なので、位置は dnd-kit が持つ。
// ─────────────────────────────

/** 掴んでいるものの見た目の受け取り物 */
export interface DragChipProps {
  /** スロット型（IMAGE / LATENT など） */
  readonly type: string;
  /** その出力に入っている値の目安。無ければ型だけ出す */
  readonly value: string;
}

/** 型と値の目安を丸い札にして、カーソルの脇に出す */
export function DragChip({ type, value }: DragChipProps): React.ReactElement {
  return (
    <span
      className="bg-muted/90 border-border pointer-events-none inline-flex max-w-56 items-center
        gap-2 rounded-full border px-2.5 py-0.5 text-2xs opacity-70 shadow-sm"
    >
      <span className="shrink-0 font-bold">{type}</span>
      {value.length > 0 ? <span className="min-w-0 truncate">{value}</span> : null}
    </span>
  );
}
