import { useEffect, useRef, useState } from 'react';

import { accumulateWheel, wheelPixels, zoomKey, type WheelHeld } from '@/lib/zoom-input';
import { stepZoom, ZOOM_DEFAULT, zoomFactor } from '@/store/settings-fields/column-zoom';

interface DialogZoom {
  readonly attachZoom: (element: HTMLElement | null) => void;
  readonly zoom: number;
}

export function useDialogZoom(): DialogZoom {
  const [element, attachZoom] = useState<HTMLElement | null>(null);
  const [percent, setPercent] = useState(ZOOM_DEFAULT);
  const wheel = useRef<WheelHeld<null> | null>(null);

  useEffect(() => {
    if (element === null) return;

    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const { direction, held } = accumulateWheel(wheel.current, null, wheelPixels(event));
      wheel.current = held;
      if (direction !== 0) setPercent((current) => stepZoom(current, direction));
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return;
      const key = zoomKey(event);
      if (key === null) return;

      const focused = document.activeElement;
      const idle = focused === null || focused === document.body;
      const mine = idle ? element.matches(':hover') : element.contains(focused);
      if (!mine) return;

      event.preventDefault();
      setPercent((current) => (key === 'reset' ? ZOOM_DEFAULT : stepZoom(current, key)));
    };

    element.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('keydown', onKeyDown);
    return () => {
      element.removeEventListener('wheel', onWheel);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [element]);

  return { attachZoom, zoom: zoomFactor(percent) };
}
