import { isComposingKey, isTextEntry } from '@/lib/text-entry';

// ─────────────────────────────
// 選ぶ画面の一覧の矢印キー。選んでいる項目で矢印キーを押すと、一覧を送らず隣の項目を選び直す。
// 項目は一覧の中の `aria-pressed` を持つボタンで、選び直しは焦点を移して押すのと同じにする。
// ─────────────────────────────

/** `list` は上下で前後。`grid` は左右で前後、上下で上下の段の近い位置 */
export type ArrowSelectLayout = 'list' | 'grid';

const ITEM_SELECTOR = 'button[aria-pressed]';

function itemsOf(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(ITEM_SELECTOR)];
}

/** 焦点のある項目、無ければ選んでいる項目 */
function currentOf(items: readonly HTMLElement[]): number {
  const active = document.activeElement;
  const focused = items.findIndex((item) => item === active || item.contains(active));
  return focused >= 0 ? focused : items.findIndex((item) => item.ariaPressed === 'true');
}

/** 上下の段のうち、横の中心がいちばん近い項目 */
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
    // いちばん近い段だけを見る
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

/** 一覧の囲みの `onKeyDown`。一覧の向きのキーなら、端で動けなくても既定（一覧を送る）を止める */
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
  // 一覧の向きに無いキー（縦の一覧の左右）はそのまま
  if (target === null) return;
  const next = items[target];
  // 端（次が無い）でも、選んでいる間は一覧を送らない
  event.preventDefault();
  if (next === undefined) return;
  next.focus();
  next.click();
}
