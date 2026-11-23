import { useEffect, useRef, useState } from 'react';

import {
  EDGE_OVERLAY_DELAY,
  edgeOverlayCoversPoint,
  edgeOverlayOverlapsBox,
} from '@/components/ui/edge-overlay';
import type { EdgeDock } from '@/lib/edge-overlay';
import type { Point } from '@/lib/point';

interface InfoReveal {
  readonly shown: boolean;
  readonly coveredCard: string | null;
  readonly reveal: (picked: string, point: Point, box: DOMRect) => void;
  readonly hide: () => void;
  readonly reset: (shown: boolean) => void;
}

export function useInfoReveal(
  area: React.RefObject<HTMLElement | null>,
  dock: EdgeDock,
  size: number,
  initialShown: boolean,
): InfoReveal {
  const [shown, setShown] = useState(initialShown);
  const [coveredCard, setCoveredCard] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const cancel = (): void => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => cancel, []);

  const reveal = (picked: string, point: Point, box: DOMRect): void => {
    const covered = edgeOverlayOverlapsBox(area.current, dock, size, box);
    setCoveredCard(covered ? picked : null);
    if (shown) return;
    cancel();
    if (!edgeOverlayCoversPoint(area.current, dock, size, point)) {
      setShown(true);
      return;
    }
    timer.current = window.setTimeout(() => {
      timer.current = null;
      setShown(true);
    }, EDGE_OVERLAY_DELAY);
  };
  const hide = (): void => {
    cancel();
    setShown(false);
  };
  const reset = (next: boolean): void => {
    setShown(next);
    setCoveredCard(null);
  };
  return { shown, coveredCard, reveal, hide, reset };
}
