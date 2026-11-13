import { useEffect, useRef, useState } from 'react';

import { accumulateWheel, wheelPixels, zoomKey, type WheelHeld } from '@/lib/zoom-input';
import { stepZoom, ZOOM_DEFAULT, zoomFactor } from '@/store/settings-fields/column-zoom';

// ─────────────────────────────
// ダイアログの中身の倍率。列と同じ操作で、ダイアログの上では列ではなく中身を広げ縮めする。
// 開いている間だけ持つ（保存しない）。
// ─────────────────────────────

/** 倍率を受ける枠の受け口と、今の倍率 */
interface DialogZoom {
  /** 倍率を受ける枠（ダイアログの外枠）に付ける */
  readonly attachZoom: (element: HTMLElement | null) => void;
  /** CSS の `zoom` に渡す倍率（1 が等倍） */
  readonly zoom: number;
}

/** ダイアログの外枠の上の Ctrl＋ホイールと倍率のキーで、中身の倍率を変える */
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
