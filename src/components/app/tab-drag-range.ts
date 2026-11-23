import type { Modifier } from '@dnd-kit/core';

export interface DragRange {
  readonly min: number;
  readonly max: number;
  readonly list: HTMLElement;
  readonly scrollLeft: number;
}

export function withinTabs(range: DragRange | null): Modifier {
  return ({ transform }) => {
    if (range === null) return { ...transform, y: 0 };
    const scrolled = range.list.scrollLeft - range.scrollLeft;
    const x = Math.min(Math.max(transform.x, range.min - scrolled), range.max - scrolled);
    return { ...transform, x, y: 0 };
  };
}

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
