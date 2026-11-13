import { useEffect, useState } from 'react';

// ─────────────────────────────
// 要素が画面に近づいたか。座標は測らない（交わったかだけを見る。測る仕組みは use-anchor-registry の 1 本）。
// ─────────────────────────────

/** 先読みの余白。スクロールで近づく少し手前から取り始める */
const NEAR_MARGIN = '200px';

/** 見張る要素の受け口と、近づいたか */
interface NearView {
  /** 見張る要素に付けるコールバック ref */
  readonly attachTarget: (element: HTMLElement | null) => void;
  /** 一度でも画面に近づいたか */
  readonly near: boolean;
}

/**
 * 要素が一度でも画面に近づいたかを返す（画面に近い画像だけを取りに行くのに使う）。見張りは
 * 近づくまでだけ付ける。見張れない環境（テストなど）では初めから近づいた扱いにする。
 */
export function useNearView(): NearView {
  const [target, attachTarget] = useState<HTMLElement | null>(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (near || target === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: NEAR_MARGIN },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [near, target]);

  return { attachTarget, near };
}
