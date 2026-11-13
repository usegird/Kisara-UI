import { useEffect, useState } from 'react';

// ─────────────────────────────
// 長い一覧を少しずつ描く。一度に全部描くと、要素の生成と画像の要求が同時に走って操作が止まる。
// ─────────────────────────────

/** いま描いてよい件数と、末尾の目印 */
interface IncrementalList {
  /** いま描いてよい件数 */
  readonly count: number;
  /** 全部描き終えたか */
  readonly done: boolean;
  /** 末尾に置く目印。ここが見えたら次のまとまりを足す */
  readonly sentinelRef: (element: HTMLElement | null) => void;
}

/** 先読みの余白。少し手前で足し始めて、待ちを見せないようにする */
const ROOT_MARGIN = '400px';

/** 末尾の目印が見えたら `step` 件ずつ足し、描く数と同時に走る要求の数を抑える */
export function useIncrementalList(
  total: number,
  step: number,
  /** 絞り込みや並び順が変わったことを示す鍵。変わったら先頭から数え直す */
  resetKey: string,
  /** 先読みの余白。画面に入る分だけ描くなら小さくする */
  rootMargin: string = ROOT_MARGIN,
): IncrementalList {
  const [state, setState] = useState({ key: resetKey, count: step });
  const [sentinel, setSentinel] = useState<HTMLElement | null>(null);

  // 条件が変わったら描画中に数え直す（副作用にすると 1 回余計に描いてしまう）
  if (state.key !== resetKey) setState({ key: resetKey, count: step });

  // 見張れない環境では刻まずに全部描く（足す合図が来ないので出せなくなる）
  const watchable = typeof globalThis.IntersectionObserver === 'function';
  const count = watchable ? Math.min(state.count, total) : total;

  useEffect(() => {
    if (!watchable || sentinel === null || count >= total) return;

    const observer = new globalThis.IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setState((current) => ({ ...current, count: current.count + step }));
      },
      { rootMargin },
    );
    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [watchable, sentinel, count, total, step, rootMargin]);

  return { count, done: count >= total, sentinelRef: setSentinel };
}
