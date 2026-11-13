import { useDroppable } from '@dnd-kit/core';

import { PLACE_LABEL, zone } from '@/components/llm/workspace/chat-image-style';
import { t } from '@/i18n';
import type { ChatImagePlace } from '@/store/settings-fields/chat-image';

// ─────────────────────────────
// 会話の画面のアバターを運んでいる間の、落とし先の枠と運ぶ札。
// ─────────────────────────────

/** 運んでいる画像の見え方。落とし先（枠いっぱい）と運ぶ札（小さな札）で、画像が無ければ地だけ */
const PREVIEW_CLASS = {
  zone: { empty: 'bg-muted size-full opacity-70', image: 'size-full object-cover opacity-70' },
  card: {
    empty: 'bg-muted size-20 rounded-md opacity-80 shadow-md',
    image: 'size-20 rounded-md object-cover opacity-80 shadow-md',
  },
} as const;

/** 落とし先の枠の props */
export interface DropZoneProps {
  readonly place: ChatImagePlace;
  /** 画像が無ければ null（空の地を見せる） */
  readonly url: string | null;
  readonly shown: boolean;
}

/** 落とし先の枠（運んでいる間だけ見せる。文字は出さず、指している枠には画像を置いて見せる） */
export function DropZone({ place, url, shown }: DropZoneProps): React.ReactElement {
  const label = t(PLACE_LABEL[place]);
  const { setNodeRef, isOver } = useDroppable({ id: place, data: { label } });
  return (
    <div ref={setNodeRef} className={zone({ place, over: isOver, shown })} aria-hidden>
      {isOver && shown ? <ImagePreview url={url} at="zone" /> : null}
    </div>
  );
}

/** 運んでいる画像。指している落とし先と、運ぶ札に出す */
export function ImagePreview({
  url,
  at,
}: {
  /** 画像が無ければ null */
  readonly url: string | null;
  readonly at: keyof typeof PREVIEW_CLASS;
}): React.ReactElement {
  if (url === null) return <div className={PREVIEW_CLASS[at].empty} />;
  return <img src={url} alt="" className={PREVIEW_CLASS[at].image} />;
}
