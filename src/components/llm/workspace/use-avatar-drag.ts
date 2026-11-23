import type { DragEndEvent, DragOverEvent } from '@dnd-kit/core';
import { useState } from 'react';

import type { CardSize } from '@/components/llm/workspace/ChatImageDrop';
import {
  CHAT_IMAGE_PLACES,
  chatImageSizeAfterMove,
  type ChatImagePlace,
} from '@/store/settings-fields/chat-image';
import { useSettingsStore } from '@/store/use-settings-store';

export interface AvatarDrag {
  readonly dragging: boolean;
  readonly over: ChatImagePlace | null;
  readonly target: ChatImagePlace;
  readonly frame: { readonly width: number; readonly height: number };
  readonly card: CardSize | null;
  readonly measure: (size: CardSize) => void;
  readonly onDragStart: () => void;
  readonly onDragOver: (event: DragOverEvent) => void;
  readonly onDragCancel: () => void;
  readonly onDragEnd: (event: DragEndEvent) => void;
}

export function useAvatarDrag(): AvatarDrag {
  const place = useSettingsStore((state) => state.chatImagePlace);
  const width = useSettingsStore((state) => state.chatImageWidth);
  const height = useSettingsStore((state) => state.chatImageHeight);
  const [dragging, setDragging] = useState(false);
  const [over, setOver] = useState<ChatImagePlace | null>(null);
  const [card, setCard] = useState<CardSize | null>(null);
  const target = over ?? place;
  const frame = chatImageSizeAfterMove(place, target, { width, height });

  const stop = (): void => {
    setDragging(false);
    setOver(null);
    setCard(null);
  };
  return {
    dragging,
    over,
    target,
    frame,
    card,
    measure: (size) =>
      setCard((prev) => (prev?.width === size.width && prev.height === size.height ? prev : size)),
    onDragStart: () => setDragging(true),
    onDragOver: ({ over: zone }) => setOver(placeOf(zone?.id)),
    onDragCancel: stop,
    onDragEnd: ({ over: zone }) => {
      stop();
      const next = placeOf(zone?.id);
      if (next === null) return;
      const settings = useSettingsStore.getState();
      const size = chatImageSizeAfterMove(settings.chatImagePlace, next, {
        width: settings.chatImageWidth,
        height: settings.chatImageHeight,
      });
      if (size.width !== settings.chatImageWidth || size.height !== settings.chatImageHeight) {
        settings.setChatImageSize(size.width, size.height);
      }
      settings.setChatImagePlace(next);
    },
  };
}

function placeOf(id: unknown): ChatImagePlace | null {
  return CHAT_IMAGE_PLACES.find((item) => item === id) ?? null;
}
