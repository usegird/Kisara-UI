import { useLayoutEffect, useRef } from 'react';

import { prefersReducedMotion } from '@/lib/host';

const SLIDE_MS = 200;

const KEY_ATTRIBUTE = 'data-slide-key';

function rowTops(list: HTMLElement): Map<string, number> {
  const tops = new Map<string, number>();
  for (const row of list.querySelectorAll<HTMLElement>(`[${KEY_ATTRIBUTE}]`)) {
    const key = row.getAttribute(KEY_ATTRIBUTE);
    if (key !== null) tops.set(key, row.getBoundingClientRect().top);
  }
  return tops;
}

interface ReorderSlide {
  readonly attachSlideList: (element: HTMLElement | null) => void;
  readonly remember: (skip: string) => void;
}

export function useReorderSlide(): ReorderSlide {
  const list = useRef<HTMLElement | null>(null);
  const before = useRef<Map<string, number> | null>(null);

  useLayoutEffect(() => {
    const element = list.current;
    const tops = before.current;
    if (element === null || tops === null) return;
    before.current = null;
    if (prefersReducedMotion()) return;
    for (const row of element.querySelectorAll<HTMLElement>(`[${KEY_ATTRIBUTE}]`)) {
      const old = tops.get(row.getAttribute(KEY_ATTRIBUTE) ?? '');
      if (old === undefined) continue;
      const dy = old - row.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) continue;
      row.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], {
        duration: SLIDE_MS,
        easing: 'ease-out',
      });
    }
  });

  return {
    attachSlideList: (element) => {
      list.current = element;
    },
    remember: (skip) => {
      if (list.current === null) return;
      const tops = rowTops(list.current);
      tops.delete(skip);
      before.current = tops;
    },
  };
}

export function slideKey(key: string): { readonly [KEY_ATTRIBUTE]: string } {
  return { [KEY_ATTRIBUTE]: key };
}
