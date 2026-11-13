import { cva } from 'class-variance-authority';
import { Check, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { ImageItem } from '@/graph/image-options';
import { usePreviewSlot } from '@/hooks/ui/use-preview-slot';
import { t } from '@/i18n';
import { isComposingKey } from '@/lib/text-entry';

// ─────────────────────────────
// 画像を選ぶダイアログの、画像 1 つぶんのカード。
// ─────────────────────────────

const cardFrame = cva('relative flex flex-col overflow-hidden rounded-md border', {
  variants: { selected: { true: 'ring-ring ring-2', false: '' } },
});
// 読み終わるまで隠す（読みかけの絵を出さない）
const cardImage = cva('size-full object-contain', {
  variants: { ready: { true: '', false: 'opacity-0' } },
});

/** 画像のカードの props */
export interface ImageCardProps {
  readonly item: ImageItem;
  /** 画像の URL。作れなければ null（名前だけの枠） */
  readonly src: string | null;
  /** カードの高さ（px）。画像の枠は名前の行を引いた残り */
  readonly height: number;
  /** いまの値か（✓ を付ける） */
  readonly current: boolean;
  /** 選んでいるか（枠で示す） */
  readonly selected: boolean;
  /** 送って見せる（アップロードしたカード）。true になったときに 1 回だけ送る */
  readonly reveal: boolean;
  readonly onSelect: (item: ImageItem) => void;
  /** ダブルクリック・選んでいるときの Enter。決定と同じ */
  readonly onPlace: (item: ImageItem) => void;
}

/**
 * 画像のカード。画像は読めないことがある（消えた・接続先が返さない）ので、名前だけの枠に落とす。
 * 読むのはモデルのカードと同じ順番待ちで枠が取れてから
 */
export function ImageCard({
  item,
  src,
  height,
  current,
  selected,
  reveal,
  onSelect,
  onPlace,
}: ImageCardProps): React.ReactElement {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const slot = usePreviewSlot(src);
  const box = useRef<HTMLDivElement>(null);

  // 格子の中で見える所まで送る（画面の外の仕組みに合わせるので effect に置く）
  useEffect(() => {
    if (reveal) box.current?.scrollIntoView({ block: 'nearest' });
  }, [reveal]);

  return (
    <div ref={box} className={cardFrame({ selected })} style={{ height }}>
      <button
        type="button"
        className="hover:bg-accent flex min-h-0 w-full flex-1 flex-col text-left"
        title={item.path}
        aria-pressed={selected}
        // ダブルクリックの 2 回目の押下は選び直さない（押し直しで外す動きと重ねない）
        onClick={(event) => {
          if (event.detail < 2) onSelect(item);
        }}
        onDoubleClick={() => onPlace(item)}
        // 選んでいるカードの Enter は決定（押し直しで外す動きにしない）
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || !selected || isComposingKey(event)) return;
          event.preventDefault();
          onPlace(item);
        }}
      >
        <span className="bg-muted relative flex min-h-0 w-full flex-1 items-center justify-center">
          {src === null || state === 'failed' ? (
            <span className="text-muted-foreground px-2 text-center text-3xs break-all">
              {item.label}
            </span>
          ) : !slot.granted ? (
            <Loader2
              className="text-muted-foreground absolute size-5 motion-safe:animate-spin"
              aria-hidden
            />
          ) : (
            <>
              <img
                src={src}
                alt=""
                // 遅延読み込みにしない（画面の外で止まると、取った枠を返さなくなる）
                decoding="async"
                draggable={false}
                // 切らずに枠へ収める（入力に使う画像は全体を見て選ぶため）
                className={cardImage({ ready: state === 'ready' })}
                onLoad={() => {
                  slot.release();
                  setState('ready');
                }}
                onError={() => {
                  slot.release();
                  setState('failed');
                }}
              />
              {state === 'ready' ? null : (
                <Loader2
                  className="text-muted-foreground absolute size-5 motion-safe:animate-spin"
                  aria-hidden
                />
              )}
            </>
          )}
          {current ? (
            <>
              <Check className="text-foreground absolute top-1 left-1 size-4" aria-hidden />
              <span className="sr-only">{t('modelPicker.card.current')}</span>
            </>
          ) : null}
        </span>
        <span className="w-full truncate px-1.5 py-1 text-2xs">{item.label}</span>
      </button>
    </div>
  );
}
