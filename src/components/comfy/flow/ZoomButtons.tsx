import { ZoomIn, ZoomOut } from 'lucide-react';

import { t } from '@/i18n';

const BUTTON =
  'text-muted-foreground hover:text-foreground flex size-9 items-center justify-center rounded-md';

export interface ZoomButtonsProps {
  readonly onZoom: (direction: number) => void;
}

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
