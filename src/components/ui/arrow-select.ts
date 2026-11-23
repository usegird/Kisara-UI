import { isComposingKey, isTextEntry } from '@/lib/text-entry';

export type ArrowSelectLayout = 'list' | 'grid';

const ITEM_SELECTOR = 'button[aria-pressed]';

function itemsOf(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(ITEM_SELECTOR)];
}

function currentOf(items: readonly HTMLElement[]): number {
  const active = document.activeElement;
  const focused = items.findIndex((item) => item === active || item.contains(active));
  return focused >= 0 ? focused : items.findIndex((item) => item.ariaPressed === 'true');
}

function rowNeighbor(items: readonly HTMLElement[], from: number, down: boolean): number {
  const origin = items[from]?.getBoundingClientRect();
  if (origin === undefined) return -1;
  const center = origin.left + origin.width / 2;
  let rowTop: number | null = null;
  let best = -1;
  let bestGap = Infinity;
  items.forEach((item, index) => {
    const rect = item.getBoundingClientRect();
    const beyond = down ? rect.top > origin.top + 1 : rect.top < origin.top - 1;
    if (!beyond) return;
    const closer = rowTop === null || (down ? rect.top < rowTop - 1 : rect.top > rowTop + 1);
    const same = rowTop !== null && Math.abs(rect.top - rowTop) <= 1;
    if (!closer && !same) return;
    if (closer) {
      rowTop = rect.top;
      bestGap = Infinity;
    }
    const gap = Math.abs(rect.left + rect.width / 2 - center);
    if (gap < bestGap) {
      bestGap = gap;
      best = index;
    }
  });
  return best;
}

function targetOf(
  items: readonly HTMLElement[],
  from: number,
  key: string,
  layout: ArrowSelectLayout,
): number | null {
  if (layout === 'list') {
    if (key === 'ArrowDown') return from + 1;
    if (key === 'ArrowUp') return from - 1;
    return null;
  }
  if (key === 'ArrowRight') return from + 1;
  if (key === 'ArrowLeft') return from - 1;
  if (key === 'ArrowDown' || key === 'ArrowUp')
    return rowNeighbor(items, from, key === 'ArrowDown');
  return null;
}

export function arrowSelect(
  event: React.KeyboardEvent<HTMLElement>,
  layout: ArrowSelectLayout,
): void {
  if (!event.key.startsWith('Arrow') || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.shiftKey || isComposingKey(event) || isTextEntry(event.target)) return;
  const items = itemsOf(event.currentTarget);
  const from = currentOf(items);
  if (from < 0) return;
  const target = targetOf(items, from, event.key, layout);
  if (target === null) return;
  const next = items[target];
  event.preventDefault();
  if (next === undefined) return;
  next.focus();
  next.click();
}
