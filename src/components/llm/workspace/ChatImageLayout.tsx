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

// ─────────────────────────────
// 会話の画面に、リンクしたプリセットの画像（アバター）を置く。縮める大きさはコンテナの単位（cqw・cqh）で
// 決め、測る仕組みは足さない。置き場と枠の縦横は設定のストアが端末に残す。
// ─────────────────────────────

/** アバターを置く会話の画面の props */
export interface ChatImageLayoutProps {
  readonly chatId: string;
  /** 会話のログ（伸びる） */
  readonly log: React.ReactNode;
  readonly composer: React.ReactNode;
  /** 入力欄の下に置くもの（会話が始まる前の空き） */
  readonly after?: React.ReactNode;
}

/** 会話のログと入力欄を並べ、5 つの置き場のどれかにアバターを置く。運んで置き場を移し、枠の縦横を変える */
export function ChatImageLayout({
  chatId,
  log,
  composer,
  after,
}: ChatImageLayoutProps): React.ReactElement {
  // 会話が写したアバターの id（プリセットは読まない）
  const imageId = useChatStore((state) => state.chats[chatId]?.imageId ?? null);
  const image = useAvatarsStore((state) =>
    imageId === null ? null : (state.avatars[imageId]?.image ?? null),
  );
  const show = useSettingsStore((state) => state.chatShowAvatar);
  const place = useSettingsStore((state) => state.chatImagePlace);
  const frameWidth = useSettingsStore((state) => state.chatImageWidth);
  const frameHeight = useSettingsStore((state) => state.chatImageHeight);
  // 構成の相談かプレイブックのカードがある間は、画像が無くても枠と同じ幅の余白を取る
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
      // 左右は画像が無ければ場所を取らない（会話の欄に重ね、指したときだけ枠を出す）
      if (url === null) return <div className={ghostSide({ place: at })}>{avatar(true)}</div>;
      return <aside className={sideArea({ place: at })}>{avatar(true)}</aside>;
    }
    // 上下は画像が無くても場所を取る（選んでも本文が動かない）。真ん中に揃え、高さは枠に合わせる
    return <div className="flex shrink-0 justify-center px-4 pt-2">{avatar(false)}</div>;
  };

  const onDragStart = (): void => setDragging(true);
  const onDragCancel = (): void => setDragging(false);
  const onDragEnd = ({ over }: DragEndEvent): void => {
    setDragging(false);
    const next = CHAT_IMAGE_PLACES.find((item) => item === over?.id);
    if (next === undefined) return;
    const settings = useSettingsStore.getState();
    // 縦長は左右、横長は上下に収まるように、枠の縦横を向きに合わせる
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
      {/* 画像の幅を会話の欄の最小幅と高さから決めるので、外枠を大きさのコンテナにする */}
      <div
        className={`relative flex h-full min-h-0 [container-type:size] ${sidePad({
          place: padSide(url !== null, place, cards),
        })}`}
        style={avatarWidth(frameWidth, frameHeight)}
        onWheel={forwardWheel}
      >
        {shown('left')}
        {/* 上下の画像の高さを会話の欄の高さから決めるので、大きさのコンテナにする */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col [container-type:size]">
          {place === 'background' && url !== null ? <BackgroundImage url={url} /> : null}
          {/* 背景の画像より前に描く */}
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
            // 背景の右下の角にアイコンを並べる。右下を指したとき（焦点があるとき）だけ出す
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
        {/* 構成の相談のカードと欄は、アバターの列の上端に重ねる */}
        <PromptAdvisor chatId={chatId} side={place === 'left' ? 'left' : 'right'} />
        {CHAT_IMAGE_PLACES.map((item) => (
          <DropZone key={item} place={item} url={url} shown={dragging} />
        ))}
      </div>
      {/* 運んでいる画像の札。画面の上に出す */}
      {createPortal(
        <DragOverlay dropAnimation={null} modifiers={[centerOnCursor]}>
          {dragging ? <ImagePreview url={url} at="card" /> : null}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}
