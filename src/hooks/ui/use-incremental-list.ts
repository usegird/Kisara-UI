import { useEffect, useState } from 'react';

interface IncrementalList {
  readonly count: number;
  readonly done: boolean;
  readonly sentinelRef: (element: HTMLElement | null) => void;
}

const ROOT_MARGIN = '400px';

export function useIncrementalList(
  total: number,
  step: number,
  resetKey: string,
  rootMargin: string = ROOT_MARGIN,
): IncrementalList {
  const [state, setState] = useState({ key: resetKey, count: step });
  const [sentinel, setSentinel] = useState<HTMLElement | null>(null);

  if (state.key !== resetKey) setState({ key: resetKey, count: step });

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
