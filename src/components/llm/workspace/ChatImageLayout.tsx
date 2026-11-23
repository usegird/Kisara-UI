import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';

import { expressionImageOf } from '@/chat/avatar-expression';
import { shownExpressionOf } from '@/chat/expression-tool';
import { PromptAdvisor } from '@/components/llm/advisor/PromptAdvisorPanel';
import { AvatarTools } from '@/components/llm/workspace/AvatarControls';
import {
  centerOnCursor,
  collision,
  jumpToZone,
  previewSlotOf,
  type PreviewSlot,
} from '@/components/llm/workspace/chat-image-drag';
import {
  forwardWheel,
  ghostSide,
  padSide,
  sideArea,
  sidePad,
  sidePadWidth,
  STACKED_ROW,
  WHEEL_TO_LOG,
} from '@/components/llm/workspace/chat-image-style';
import { DragCard, DropPreview, DropZones } from '@/components/llm/workspace/ChatImageDrop';
import {
  BackgroundImage,
  GhostTools,
  ImageFrame,
  MoveGrip,
} from '@/components/llm/workspace/ChatImageFrame';
import { useAvatarDrag, type AvatarDrag } from '@/components/llm/workspace/use-avatar-drag';
import { useSideCards } from '@/components/llm/workspace/use-side-cards';
import { MOUSE_ACTIVATION, TOUCH_ACTIVATION } from '@/components/ui/drag-activation';
import { dragAccessibility } from '@/components/ui/drag-announcements';
import { blobUrl } from '@/lib/blob-url';
import type { ChatImagePlace } from '@/store/settings-fields/chat-image';
import { useAvatarExpressionsStore } from '@/store/use-avatar-expressions-store';
import { useAvatarsStore } from '@/store/use-avatars-store';
import { useChatStore } from '@/store/use-chat-store';
import { useSettingsStore } from '@/store/use-settings-store';

export interface ChatImageLayoutProps {
  readonly chatId: string;
  readonly log: React.ReactNode;
  readonly composer: React.ReactNode;
  readonly after?: React.ReactNode;
}

export function ChatImageLayout({
  chatId,
  log,
  composer,
  after,
}: ChatImageLayoutProps): React.ReactElement {
  const imageId = useChatStore((state) => state.chats[chatId]?.imageId ?? null);
  const image = useShownAvatar(chatId, imageId);
  const show = useSettingsStore((state) => state.chatShowAvatar);
  const place = useSettingsStore((state) => state.chatImagePlace);
  const frameWidth = useSettingsStore((state) => state.chatImageWidth);
  const frameHeight = useSettingsStore((state) => state.chatImageHeight);
  const cards = useSideCards(chatId);
  const cardWidth = useSettingsStore((state) => state.chatCardWidth);
  const drag = useAvatarDrag();
  const sensors = useSensors(
    useSensor(MouseSensor, MOUSE_ACTIVATION),
    useSensor(TouchSensor, TOUCH_ACTIVATION),
    useSensor(KeyboardSensor, { coordinateGetter: jumpToZone }),
  );

  if (!show) {
    return (
      <div
        className={`relative flex h-full min-h-0 flex-col [container-type:size] ${sidePad({
          place: cards ? 'right' : 'none',
        })}`}
        style={sidePadWidth(false, { width: frameWidth, height: frameHeight }, cardWidth)}
      >
        {log}
        {composer}
        {after}
        <PromptAdvisor chatId={chatId} side="right" />
      </div>
    );
  }

  const url = image === null ? null : blobUrl(image);
  const shown = (at: ChatImagePlace): React.ReactNode => {
    if (place !== at) return null;
    const avatar = (side: boolean): React.ReactElement => (
      <ImageFrame chatId={chatId} url={url} side={side} />
    );
    if (at === 'left' || at === 'right') {
      if (url === null) return <div className={ghostSide({ place: at })}>{avatar(true)}</div>;
      return <aside className={sideArea({ place: at })}>{avatar(true)}</aside>;
    }
    return <div className={STACKED_ROW}>{avatar(false)}</div>;
  };

  const sideImage = url !== null && (place === 'left' || place === 'right');

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      accessibility={dragAccessibility()}
      onDragStart={drag.onDragStart}
      onDragOver={drag.onDragOver}
      onDragCancel={drag.onDragCancel}
      onDragEnd={drag.onDragEnd}
    >
      <div
        className={`relative flex h-full min-h-0 [container-type:size] ${sidePad({
          place: padSide(url !== null, place, cards),
        })}`}
        style={sidePadWidth(sideImage, { width: frameWidth, height: frameHeight }, cardWidth)}
        onWheel={forwardWheel}
      >
        {shown('left')}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col [container-type:size]">
          {place === 'background' && url !== null ? <BackgroundImage url={url} /> : null}
          <PlacePreview drag={drag} url={url} cards={cards} slot="background" />
          <div className="relative flex min-h-0 flex-1 flex-col">
            <PlacePreview drag={drag} url={url} cards={cards} slot="top" />
            {shown('top')}
            {log}
            {shown('aboveInput')}
            {url === null && (place === 'left' || place === 'right') ? (
              <GhostTools chatId={chatId} place={place} />
            ) : null}
            <PlacePreview drag={drag} url={url} cards={cards} slot="aboveInput" />
            {composer}
            {after}
          </div>
          {place === 'background' ? (
            <div
              className="bottom-column-bottom absolute right-0 z-20 flex flex-col items-end gap-1
                opacity-0 focus-within:opacity-100 hover:opacity-100"
              {...{ [WHEEL_TO_LOG]: '' }}
            >
              <div className="bg-background/60 rounded-md p-0.5">
                <AvatarTools chatId={chatId} move={<MoveGrip />} />
              </div>
            </div>
          ) : null}
        </div>
        {shown('right')}
        <PromptAdvisor chatId={chatId} side={place === 'left' ? 'left' : 'right'} />
        <DropZones shown={drag.dragging} />
        <PlacePreview drag={drag} url={url} cards={cards} slot="outer" />
      </div>
      {createPortal(
        <DragOverlay dropAnimation={null} modifiers={[centerOnCursor]}>
          {drag.dragging && drag.over === null ? <DragCard url={url} size={drag.card} /> : null}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}

function PlacePreview({
  drag,
  url,
  cards,
  slot,
}: {
  readonly drag: AvatarDrag;
  readonly url: string | null;
  readonly cards: boolean;
  readonly slot: PreviewSlot;
}): React.ReactElement | null {
  const cardWidth = useSettingsStore((state) => state.chatCardWidth);
  if (!drag.dragging || previewSlotOf(drag.target) !== slot) return null;
  const { width, height } = drag.frame;
  const sideImage = url !== null && slot === 'outer';
  const pad = {
    className: sidePad({ place: padSide(url !== null, drag.target, cards) }),
    style: sidePadWidth(sideImage, drag.frame, cardWidth),
  };
  return (
    <DropPreview
      key={`${drag.target}:${String(width)}x${String(height)}`}
      place={drag.target}
      url={url}
      width={width}
      height={height}
      pad={pad}
      shown={drag.over !== null}
      onMeasure={drag.measure}
    />
  );
}

function useShownAvatar(chatId: string, imageId: string | null): Blob | null {
  const avatar = useAvatarsStore((state) =>
    imageId === null ? undefined : state.avatars[imageId],
  );
  const on = useSettingsStore((state) => state.chatExpression);
  const label = useChatStore((state) => {
    const chat = state.chats[chatId];
    return chat === undefined ? null : shownExpressionOf(chat.messages, chat.expression, on);
  });
  const entry = useAvatarExpressionsStore((state) =>
    imageId === null ? undefined : state.reads[imageId],
  );
  const hash = avatar?.hash;
  const needed = on || label !== null;
  useEffect(() => {
    if (needed && imageId !== null && hash !== undefined) {
      useAvatarExpressionsStore.getState().ensure(imageId);
    }
  }, [needed, imageId, hash]);
  if (avatar === undefined) return null;
  if (!needed || entry?.hash !== avatar.hash || entry.read.kind !== 'ok') return avatar.image;
  return expressionImageOf(entry.read.set, label) ?? avatar.image;
}
