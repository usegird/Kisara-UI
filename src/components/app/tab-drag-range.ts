import type { Modifier } from '@dnd-kit/core';

// ─────────────────────────────
// タブの札を運べる範囲。
// ─────────────────────────────

/**
 * 運べる横の範囲（掴んだ位置からのずれ）。最初の札の左端から最後の札の右端まで。
 * 並びと、掴んだときの横のスクロールの位置も持つ（自動のスクロールの分を差し引くため）
 */
export interface DragRange {
  readonly min: number;
  readonly max: number;
  readonly list: HTMLElement;
  readonly scrollLeft: number;
}

/**
 * 横にだけ、並びの中だけ運ぶ。並びの外まで運べると、札がはみ出した分だけ横のスクロールの幅が広がり、
 * 端へ寄せたときの自動のスクロールが無い所まで続いてしまう。dnd-kit は自動のスクロールの分を
 * この後で足すので、掴んでからスクロールした分を差し引いた範囲に収める
 */
export function withinTabs(range: DragRange | null): Modifier {
  return ({ transform }) => {
    if (range === null) return { ...transform, y: 0 };
    const scrolled = range.list.scrollLeft - range.scrollLeft;
    const x = Math.min(Math.max(transform.x, range.min - scrolled), range.max - scrolled);
    return { ...transform, x, y: 0 };
  };
}

/** 掴んだ札（並びの `index` 番目）の位置から、並びの両端までの範囲。札が無ければ null */
export function dragRangeOf(list: HTMLElement | null, index: number): DragRange | null {
  const first = list?.firstElementChild?.getBoundingClientRect();
  const last = list?.lastElementChild?.getBoundingClientRect();
  const active = list?.children.item(index)?.getBoundingClientRect();
  if (list === null || first === undefined || last === undefined || active === undefined) {
    return null;
  }
  return {
    min: first.left - active.left,
    max: last.right - active.right,
    list,
    scrollLeft: list.scrollLeft,
  };
}
