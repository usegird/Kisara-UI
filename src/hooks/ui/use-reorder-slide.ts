import { useLayoutEffect, useRef } from 'react';

import { prefersReducedMotion } from '@/lib/host';

// ─────────────────────────────
// 並べ替えを落としたあと、ほかの行を並びを変える前の位置から新しい位置へ滑らせる
// （位置が変わらない行は動かさない）。
// ─────────────────────────────

/** 動きの長さ（ms） */
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

/** 一覧の受け口と、並びを変える直前に位置を控える手続き */
interface ReorderSlide {
  /** 一覧の要素を受け取る（ref に渡す） */
  readonly attachSlideList: (element: HTMLElement | null) => void;
  /**
   * 並びを変える直前に呼ぶ。次に描いたとき、控えた位置から滑らせる。
   * `skip` は落とした行（ポインタの下にあるので、跳ばずにその場に置く）
   */
  readonly remember: (skip: string) => void;
}

/**
 * 控えた行の上端から、並びが変わって描いた直後の位置へ行を動かす。行は一覧の中の
 * `data-slide-key` を持つ要素で、キーで前後を突き合わせる。
 */
export function useReorderSlide(): ReorderSlide {
  const list = useRef<HTMLElement | null>(null);
  const before = useRef<Map<string, number> | null>(null);

  // 描くたびに見るが、控えがあるとき（落とした直後）だけ動かす
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

/** 滑らせる行に付ける印 */
export function slideKey(key: string): { readonly [KEY_ATTRIBUTE]: string } {
  return { [KEY_ATTRIBUTE]: key };
}
