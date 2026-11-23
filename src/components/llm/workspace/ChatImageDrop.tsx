import { useDroppable } from '@dnd-kit/core';

import { PLACE_LABEL, zone } from '@/components/llm/workspace/chat-image-style';
import { t } from '@/i18n';
import type { ChatImagePlace } from '@/store/settings-fields/chat-image';

const PREVIEW_CLASS = {
  zone: { empty: 'bg-muted size-full opacity-70', image: 'size-full object-cover opacity-70' },
  card: {
    empty: 'bg-muted size-20 rounded-md opacity-80 shadow-md',
    image: 'size-20 rounded-md object-cover opacity-80 shadow-md',
  },
} as const;

export interface DropZoneProps {
  readonly place: ChatImagePlace;
  readonly url: string | null;
  readonly shown: boolean;
}

export function DropZone({ place, url, shown }: DropZoneProps): React.ReactElement {
  const label = t(PLACE_LABEL[place]);
  const { setNodeRef, isOver } = useDroppable({ id: place, data: { label } });
  return (
    <div ref={setNodeRef} className={zone({ place, over: isOver, shown })} aria-hidden>
      {isOver && shown ? <ImagePreview url={url} at="zone" /> : null}
    </div>
  );
}

export function ImagePreview({
  url,
  at,
}: {
  readonly url: string | null;
  readonly at: keyof typeof PREVIEW_CLASS;
}): React.ReactElement {
  if (url === null) return <div className={PREVIEW_CLASS[at].empty} />;
  return <img src={url} alt="" className={PREVIEW_CLASS[at].image} />;
}
