import { cva } from 'class-variance-authority';
import { createContext } from 'react';

import type { DragHandlers } from '@/hooks/ui/use-drag-from';
import type { DialogMode } from '@/lib/dialog-rect';

// ─────────────────────────────
// 見出しの帯が囲んでいる枠（`DialogFrame` / `DialogWindow`）から受け取るもの。
// 帯の部品とは別ファイルに置く（部品以外を一緒に export すると Fast Refresh が状態を保てない）。
// ─────────────────────────────

/** 枠から見出しの帯へ渡す、出し方と動かし方 */
export interface DialogChrome {
  readonly mode: DialogMode;
  /** 出し方の切り替え。埋め込みしか持たない枠（ビューワー）では null */
  readonly onToggleMode: (() => void) | null;
  /** 自由移動で動かせるときだけ入る。帯を掴む場所にする */
  readonly move: DragHandlers | null;
  /**
   * 枠が見えているか（埋め込みは同じ場所の一番上だけが見える）。描いた直後はまだ見えておらず、
   * 中身へフォーカスを置くのは見えてからにする。持たない枠は常に見えている
   */
  readonly visible?: boolean | undefined;
}

/** 枠が見出しの帯へ `DialogChrome` を渡す口。枠の外では null */
export const DialogChromeContext = createContext<DialogChrome | null>(null);

/**
 * 開くときの動き。枠が描かれた時に 1 回だけ走る。閉じるときは待たせない。
 * 埋め込みは列に嵌まっているので薄く出すだけにする。
 * 中央寄せの `translate` とは別の性質（`transform`）で動かすので、位置はずれない
 */
export const dialogOpening = cva(
  'animate-in fade-in-0 animation-duration-150 ease-out motion-reduce:animate-none',
  { variants: { mode: { floating: 'zoom-in-95', embedded: '' } } },
);
