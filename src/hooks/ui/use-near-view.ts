import { useEffect, useState } from 'react';

const NEAR_MARGIN = '200px';

interface NearView {
  readonly attachTarget: (element: HTMLElement | null) => void;
  readonly near: boolean;
}

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
