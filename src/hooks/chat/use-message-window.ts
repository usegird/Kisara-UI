import { useEffect, useState } from 'react';

const DEFAULT_WINDOW_STEP = 20;

const NEAR_PX = 400;
const ROOT_MARGIN = `${String(NEAR_PX)}px 0px`;
const TRIM_SLACK_PX = 100;

interface Shown {
  readonly start: number;
  readonly end: number;
}

export interface MessageWindow extends Shown {
  readonly attachTopMark: (element: HTMLElement | null) => void;
  readonly attachBottomMark: (element: HTMLElement | null) => void;
  readonly attachList: (element: HTMLElement | null) => void;
}

interface Range {
  readonly key: string;
  readonly start: number | null;
  readonly end: number;
  readonly latest: boolean;
}

export interface WindowGrowth {
  readonly size: number;
  readonly step?: number | undefined;
}

interface SeenMarks {
  top: boolean;
  bottom: boolean;
}

interface WindowLimits {
  readonly total: number;
  readonly size: number;
  readonly step: number;
}

interface FarItems {
  readonly older: number;
  readonly newer: number;
}

export function useMessageWindow(
  total: number,
  { size, step = DEFAULT_WINDOW_STEP }: WindowGrowth,
  resetKey: string,
  root: Element | null,
): MessageWindow {
  const [range, setRange] = useState<Range>({ key: resetKey, start: null, end: 0, latest: true });
  const [top, setTop] = useState<HTMLElement | null>(null);
  const [bottom, setBottom] = useState<HTMLElement | null>(null);
  const [list, setList] = useState<HTMLElement | null>(null);

  if (range.key !== resetKey || (range.start === null && total > 0)) {
    setRange({ key: resetKey, start: Math.max(0, total - step), end: total, latest: true });
  }

  const watchable = typeof globalThis.IntersectionObserver === 'function';
  const { start, end } = watchable ? current(range, total, step) : { start: 0, end: total };

  useEffect(() => {
    if (!watchable || root === null) return;
    const seen: SeenMarks = { top: false, bottom: false };
    const observer = new globalThis.IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === top) seen.top = entry.isIntersecting;
          if (entry.target === bottom) seen.bottom = entry.isIntersecting;
        }
        const next = nextWindow({ start, end }, { total, size, step }, seen, () =>
          farItems(list, root, end - start),
        );
        if (next.start === start && next.end === end) return;
        setRange((now) =>
          now.start === null ? now : { ...now, ...next, latest: next.end === total },
        );
      },
      { root, rootMargin: ROOT_MARGIN },
    );
    if (top !== null) observer.observe(top);
    if (bottom !== null) observer.observe(bottom);
    return () => observer.disconnect();
  }, [watchable, root, top, bottom, list, start, end, total, size, step]);

  return { start, end, attachTopMark: setTop, attachBottomMark: setBottom, attachList: setList };
}

function current(range: Range, total: number, step: number): Shown {
  if (range.start === null) return { start: Math.max(0, total - step), end: total };
  if (range.latest) return { start: Math.min(range.start, total), end: total };
  const end = Math.min(range.end, total);
  return { start: Math.min(range.start, end), end };
}

function nextWindow(
  at: Shown,
  { total, size, step }: WindowLimits,
  seen: SeenMarks,
  far: () => FarItems,
): Shown {
  const older = at.start > 0 && seen.top;
  const newer = !older && at.end < total && seen.bottom;
  const start = older ? Math.max(0, at.start - step) : at.start;
  const end = newer ? Math.min(total, at.end + step) : at.end;
  const excess = end - start - size;
  if (excess <= 0) return { start, end };

  const items = far();
  const fromOlder = older ? 0 : Math.min(excess, items.older);
  const fromNewer = newer ? 0 : Math.min(excess - fromOlder, items.newer);
  return { start: start + fromOlder, end: end - fromNewer };
}

function farItems(list: Element | null, root: Element, count: number): FarItems {
  if (list === null || list.children.length !== count) return { older: 0, newer: 0 };
  const view = root.getBoundingClientRect();
  const margin = NEAR_PX + TRIM_SLACK_PX;
  const rects = Array.from(list.children, (item) => item.getBoundingClientRect());
  const older = rects.findIndex((rect) => rect.bottom >= view.top - margin);
  const newer = rects.toReversed().findIndex((rect) => rect.top <= view.bottom + margin);
  return { older: older < 0 ? count : older, newer: newer < 0 ? count : newer };
}
