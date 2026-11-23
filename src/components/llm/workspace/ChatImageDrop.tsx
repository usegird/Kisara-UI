import { useDroppable } from '@dnd-kit/core';
import { cva } from 'class-variance-authority';

import { previewSlotOf } from '@/components/llm/workspace/chat-image-drag';
import {
  frameStyle,
  ghostSide,
  PLACE_LABEL,
  SIDE_ZONE_STYLE,
  sideArea,
  STACKED_ROW,
  zone,
  ZONE_CENTER_STYLE,
  ZONE_FRAME,
  ZONE_SIDE_STYLE,
} from '@/components/llm/workspace/chat-image-style';
import { t } from '@/i18n';
import type { ChatImagePlace } from '@/store/settings-fields/chat-image';
import { useSettingsStore } from '@/store/use-settings-store';

const PREVIEW_LOOK = 'ring-primary overflow-hidden rounded-md opacity-80 shadow-md ring-2';

const previewLayer = cva('pointer-events-none absolute z-40', {
  variants: {
    slot: {
      outer: 'inset-0',
      top: `inset-x-0 top-0 [--chat-pad-l:0px] [--chat-pad-r:0px] ${STACKED_ROW}`,
      aboveInput: `inset-x-0 bottom-0 [--chat-pad-l:0px] [--chat-pad-r:0px] ${STACKED_ROW}`,
      background: 'top-column-top bottom-column-bottom inset-x-0',
    },
    shown: { true: '', false: 'invisible' },
  },
});

const CARD_EMPTY = 'bg-muted size-full rounded-md opacity-80 shadow-md';
const CARD_IMAGE = 'size-full rounded-md object-cover opacity-80 shadow-md';

export function DropZones({ shown }: { readonly shown: boolean }): React.ReactElement {
  return (
    <div className={ZONE_FRAME}>
      <div style={ZONE_SIDE_STYLE.left}>
        <DropZone place="left" shown={shown} />
      </div>
      <div style={ZONE_CENTER_STYLE}>
        <DropZone place="top" shown={shown} />
        <DropZone place="background" shown={shown} />
        <DropZone place="aboveInput" shown={shown} />
      </div>
      <div style={ZONE_SIDE_STYLE.right}>
        <DropZone place="right" shown={shown} />
      </div>
    </div>
  );
}

export interface DropZoneProps {
  readonly place: ChatImagePlace;
  readonly shown: boolean;
}

export function DropZone({ place, shown }: DropZoneProps): React.ReactElement {
  const label = t(PLACE_LABEL[place]);
  const { setNodeRef, isOver } = useDroppable({ id: place, data: { label } });
  const side = place === 'left' || place === 'right';
  return (
    <div
      ref={setNodeRef}
      className={zone({ place, over: isOver, shown })}
      style={side ? SIDE_ZONE_STYLE : undefined}
      aria-hidden
    />
  );
}

export interface CardSize {
  readonly width: number;
  readonly height: number;
}

export interface DragCardProps {
  readonly url: string | null;
  readonly size: CardSize | null;
}

export function DragCard({ url, size }: DragCardProps): React.ReactElement | null {
  if (size === null) return null;
  return (
    <div className="absolute top-1/2 left-1/2 -translate-1/2" style={size}>
      {url === null ? (
        <div className={CARD_EMPTY} />
      ) : (
        <img src={url} alt="" className={CARD_IMAGE} />
      )}
    </div>
  );
}

export interface DropPreviewProps {
  readonly place: ChatImagePlace;
  readonly url: string | null;
  readonly width: number;
  readonly height: number;
  readonly pad: { readonly className: string; readonly style: React.CSSProperties };
  readonly shown: boolean;
  readonly onMeasure: (size: CardSize) => void;
}

export function DropPreview({
  place,
  url,
  width,
  height,
  pad,
  shown,
  onMeasure,
}: DropPreviewProps): React.ReactElement {
  const focusX = useSettingsStore((state) => state.chatImageFocusX);
  const focusY = useSettingsStore((state) => state.chatImageFocusY);
  const attachBox = (element: HTMLElement | null): void => {
    if (element === null) return;
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) onMeasure({ width: rect.width, height: rect.height });
  };
  const content =
    url === null ? (
      <div className="bg-muted size-full" />
    ) : (
      <img
        src={url}
        alt=""
        className="size-full object-cover"
        style={{ objectPosition: `${String(focusX)}% ${String(focusY)}%` }}
      />
    );
  const slot = previewSlotOf(place);
  const layer = previewLayer({ slot, shown });
  if (slot === 'background') {
    return (
      <div ref={attachBox} className={`${layer} ${PREVIEW_LOOK}`} aria-hidden>
        {content}
      </div>
    );
  }
  const side = place === 'left' || place === 'right';
  const box = (
    <div
      ref={attachBox}
      className={`shrink-0 ${PREVIEW_LOOK}`}
      style={frameStyle({ side, ghost: url === null, width, height })}
    >
      {content}
    </div>
  );
  if (side) {
    return (
      <div className={layer} aria-hidden>
        <div className={url === null ? ghostSide({ place }) : sideArea({ place })}>{box}</div>
      </div>
    );
  }
  return (
    <div className="relative h-0 shrink-0" aria-hidden>
      <div className={`${layer} ${pad.className}`} style={pad.style}>
        {box}
      </div>
    </div>
  );
}
