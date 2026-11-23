import { useState } from 'react';

import type { ModelItem } from '@/graph/model-files';
import { usePreviewSlot } from '@/hooks/ui/use-preview-slot';
import { t } from '@/i18n';
import { comfyPort } from '@/store/ports/comfy-port';

export interface ModelPreviewProps {
  readonly item: ModelItem;
  readonly folder: string;
  readonly baseUrl: string;
}

export function ModelPreview({
  item,
  folder,
  baseUrl,
}: ModelPreviewProps): React.ReactElement | null {
  const [failed, setFailed] = useState(false);
  const src = comfyPort().models.previewSrc(baseUrl, folder, item.file);
  const slot = usePreviewSlot(src);

  if (src === null || failed || !slot.granted) return null;
  return (
    <img
      src={src}
      alt={t('modelPicker.info.preview', { name: item.label })}
      decoding="async"
      draggable={false}
      className="bg-muted max-h-48 w-full rounded-md object-contain"
      onLoad={slot.release}
      onError={() => {
        slot.release();
        setFailed(true);
      }}
    />
  );
}
