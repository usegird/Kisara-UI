import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useState } from 'react';
import { createPortal } from 'react-dom';

import { PromptAdvisor } from '@/components/llm/advisor/PromptAdvisorPanel';
import { AvatarTools } from '@/components/llm/workspace/AvatarControls';
import { centerOnCursor, collision, jumpToZone } from '@/components/llm/workspace/chat-image-drag';
import {
  avatarWidth,
  forwardWheel,
  ghostSide,
  padSide,
  sideArea,
  sidePad,
  WHEEL_TO_LOG,
} from '@/components/llm/workspace/chat-image-style';
import { DropZone, ImagePreview } from '@/components/llm/workspace/ChatImageDrop';
import {
  BackgroundImage,
  GhostTools,
  ImageFrame,
  MoveGrip,
} from '@/components/llm/workspace/ChatImageFrame';
import { useSideCards } from '@/components/llm/workspace/use-side-cards';
import { MOUSE_ACTIVATION, TOUCH_ACTIVATION } from '@/components/ui/drag-activation';
import { dragAccessibility } from '@/components/ui/drag-announcements';
import { blobUrl } from '@/lib/blob-url';
import {
  CHAT_IMAGE_PLACES,
  chatImageSizeAfterMove,
  type ChatImagePlace,
} from '@/store/settings-fields/chat-image';
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
  const image = useAvatarsStore((state) =>
    imageId === null ? null : (state.avatars[imageId]?.image ?? null),
  );
  const show = useSettingsStore((state) => state.chatShowAvatar);
  const place = useSettingsStore((state) => state.chatImagePlace);
  const frameWidth = useSettingsStore((state) => state.chatImageWidth);
  const frameHeight = useSettingsStore((state) => state.chatImageHeight);
  const cards = useSideCards(chatId);
  const [dragging, setDragging] = useState(false);
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
        style={avatarWidth(frameWidth, frameHeight)}
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
    return <div className="flex shrink-0 justify-center px-4 pt-2">{avatar(false)}</div>;
  };

  const onDragStart = (): void => setDragging(true);
  const onDragCancel = (): void => setDragging(false);
  const onDragEnd = ({ over }: DragEndEvent): void => {
    setDragging(false);
    const next = CHAT_IMAGE_PLACES.find((item) => item === over?.id);
    if (next === undefined) return;
    const settings = useSettingsStore.getState();
    const size = chatImageSizeAfterMove(settings.chatImagePlace, next, {
      width: settings.chatImageWidth,
      height: settings.chatImageHeight,
    });
    if (size.width !== settings.chatImageWidth || size.height !== settings.chatImageHeight) {
      settings.setChatImageSize(size.width, size.height);
    }
    settings.setChatImagePlace(next);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      accessibility={dragAccessibility()}
      onDragStart={onDragStart}
      onDragCancel={onDragCancel}
      onDragEnd={onDragEnd}
    >
      <div
        className={`relative flex h-full min-h-0 [container-type:size] ${sidePad({
          place: padSide(url !== null, place, cards),
        })}`}
        style={avatarWidth(frameWidth, frameHeight)}
        onWheel={forwardWheel}
      >
        {shown('left')}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col [container-type:size]">
          {place === 'background' && url !== null ? <BackgroundImage url={url} /> : null}
          <div className="relative flex min-h-0 flex-1 flex-col">
            {shown('top')}
            {log}
            {shown('aboveInput')}
            {url === null && (place === 'left' || place === 'right') ? (
              <GhostTools chatId={chatId} place={place} />
            ) : null}
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
        {CHAT_IMAGE_PLACES.map((item) => (
          <DropZone key={item} place={item} url={url} shown={dragging} />
        ))}
      </div>
      {createPortal(
        <DragOverlay dropAnimation={null} modifiers={[centerOnCursor]}>
          {dragging ? <ImagePreview url={url} at="card" /> : null}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}
