import { ZoomIn, ZoomOut } from 'lucide-react';

import { t } from '@/i18n';

// ─────────────────────────────
// 狭い画面の拡大・縮小のボタン。倍率を持つのは呼ぶ側（use-flow-scrolling）で、ここは押されたことを伝えるだけ
// ─────────────────────────────

const BUTTON =
  'text-muted-foreground hover:text-foreground flex size-9 items-center justify-center rounded-md';

/** 拡大・縮小のボタンの受け取り物 */
export interface ZoomButtonsProps {
  /** 正なら広げ、負なら縮める */
  readonly onZoom: (direction: number) => void;
}

/** 拡大と縮小のアイコンのボタンを縦に並べる */
export function ZoomButtons({ onZoom }: ZoomButtonsProps): React.ReactElement {
  return (
    <div className="absolute right-4 bottom-4 z-30 flex flex-col gap-2">
      <button
        type="button"
        className={BUTTON}
        aria-label={t('flow.canvas.zoomIn')}
        title={t('flow.canvas.zoomIn')}
        onClick={() => onZoom(1)}
      >
        <ZoomIn className="size-5" aria-hidden />
      </button>
      <button
        type="button"
        className={BUTTON}
        aria-label={t('flow.canvas.zoomOut')}
        title={t('flow.canvas.zoomOut')}
        onClick={() => onZoom(-1)}
      >
        <ZoomOut className="size-5" aria-hidden />
      </button>
    </div>
  );
}
