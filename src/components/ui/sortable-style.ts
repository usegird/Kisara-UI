import { CSS, type Transform } from '@dnd-kit/utilities';

// ─────────────────────────────
// 並べ替えの 1 項目に付けるずらしと戻りの動き（dnd-kit の useSortable の値から）。
// 大きさは変えず、位置だけを動かす（高さの違う項目どうしで伸び縮みさせない）
// ─────────────────────────────

/** 掴んでいる項目を隣の項目より上に描く重なりの順 */
export const DRAGGING_Z_INDEX = 10;

/** useSortable の `transform`・`transition` から、項目の `style` を作る */
export function sortableStyle(
  transform: Transform | null,
  transition: string | undefined,
): React.CSSProperties {
  return { transform: CSS.Translate.toString(transform), transition };
}
