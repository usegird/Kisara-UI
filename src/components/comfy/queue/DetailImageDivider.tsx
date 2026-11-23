import { useRef } from 'react';

import { PERCENT } from '@/components/ui/units';
import { useDragFrom } from '@/hooks/ui/use-drag-from';
import { t } from '@/i18n';
import { dragSplitRatio } from '@/store/settings-fields/split-ratio';
import { useSettingsStore } from '@/store/use-settings-store';

const RATIO_KEY_STEP = 0.05;

export function DetailImageDivider(): React.ReactElement {
  const divider = useRef<HTMLDivElement | null>(null);
  const imageRatio = useSettingsStore((state) => state.taskDetailImageRatio);
  const setImageRatio = useSettingsStore((state) => state.setTaskDetailImageRatio);
  const resizeImage = useDragFrom(
    () => ({
      ratio: imageRatio,
      total: divider.current?.parentElement?.getBoundingClientRect().width ?? 0,
    }),
    (from: { readonly ratio: number; readonly total: number }, dx: number) =>
      setImageRatio(dragSplitRatio(from.ratio, dx, from.total)),
  );

  return (
    <div
      ref={divider}
      role="separator"
      aria-orientation="vertical"
      aria-label={t('queue.detail.imageWidth')}
      aria-valuenow={Math.round(imageRatio * PERCENT)}
      tabIndex={0}
      title={t('queue.detail.imageWidthHint')}
      className="hover:bg-border focus:bg-ring w-1 shrink-0 cursor-col-resize border-l
        focus:outline-none"
      {...resizeImage}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') setImageRatio(imageRatio + RATIO_KEY_STEP);
        else if (event.key === 'ArrowRight') setImageRatio(imageRatio - RATIO_KEY_STEP);
        else return;
        event.preventDefault();
        event.stopPropagation();
      }}
    />
  );
}
