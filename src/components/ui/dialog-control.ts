import { cva } from 'class-variance-authority';

// ─────────────────────────────
// ダイアログの帯に置く入力の見た目。帯の部品とは別ファイルに置く
// （部品以外を一緒に export すると Fast Refresh が状態を保てない）。
// ─────────────────────────────

/**
 * ダイアログの帯（見出し・操作の帯）に置く入力・選択・切り替えの見た目。**枠も下線も引かない**。
 * キーで焦点が来たときだけ輪郭を出す。
 *   ・field : 打ち込む欄（検索・高さ）。打った文字は地の色
 *   ・choice: 選ぶもの（並び替え・言語）。欄の名前（虫眼鏡・「高さ」）と同じ薄い色、指すと濃く
 */
export const dialogControl = cva(
  `rounded-sm border-0 bg-transparent px-0.5 text-xs outline-none
    focus-visible:outline-1 focus-visible:outline-ring`,
  {
    variants: {
      kind: {
        field: '',
        choice: 'text-muted-foreground hover:text-foreground',
      },
    },
  },
);
