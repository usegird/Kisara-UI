import { useRef } from 'react';

import { PERCENT } from '@/components/ui/units';
import { useDragFrom } from '@/hooks/ui/use-drag-from';
import { t } from '@/i18n';
import { dragSplitRatio } from '@/store/settings-fields/split-ratio';
import { useSettingsStore } from '@/store/use-settings-store';

// ─────────────────────────────
// 詳細の左（内容）と右（画像）の境目。引いて画像の幅を変え、割合で端末に残す。
// ─────────────────────────────

/** ← → で動かす画像の列の幅の割合 */
const RATIO_KEY_STEP = 0.05;

/**
 * 画像の列の幅を変える境目
 */
export function DetailImageDivider(): React.ReactElement {
  const divider = useRef<HTMLDivElement | null>(null);
  const imageRatio = useSettingsStore((state) => state.taskDetailImageRatio);
  const setImageRatio = useSettingsStore((state) => state.setTaskDetailImageRatio);
  const resizeImage = useDragFrom(
    () => ({
      ratio: imageRatio,
      // 割合の分母は、左右を並べた枠（境目の親）の幅
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
        // 隣への送り（← →）に流さない
        event.preventDefault();
        event.stopPropagation();
      }}
    />
  );
}
