import { cva } from 'class-variance-authority';
import { Check, Loader2 } from 'lucide-react';
import { useState } from 'react';

import type { ModelItem } from '@/graph/model-files';
import { usePreviewSlot } from '@/hooks/ui/use-preview-slot';
import { t } from '@/i18n';
import { panReset, panTo } from '@/lib/pan';
import type { Point } from '@/lib/point';
import { isComposingKey } from '@/lib/text-entry';
import { comfyPort } from '@/store/ports/comfy-port';

// ─────────────────────────────
// モデルを選ぶダイアログのカード 1 枚。プレビュー画像は順番待ちで枠が取れてから読み、
// 取れなければ名前だけの枠に落とす。
// ─────────────────────────────

const cardFrame = cva('group/card relative flex flex-col overflow-hidden rounded-md border', {
  variants: { selected: { true: 'ring-ring ring-2', false: '' } },
});
// 読み終わるまで隠す（読みかけの絵を出さない）
const cardImage = cva('size-full object-cover object-[var(--pan-x,50%)_var(--pan-y,50%)]', {
  variants: { ready: { true: '', false: 'opacity-0' } },
});

/** 掴んで落とす（呼び出し元が許すときだけ） */
export interface ModelCardDrag {
  /** 押した時点。掴む前に文字を用意しておく */
  readonly onPointerDown: (item: ModelItem) => void;
  readonly onDragStart: (event: React.DragEvent<HTMLElement>, item: ModelItem) => void;
}

/** モデルのカード 1 枚の props */
export interface ModelCardProps {
  readonly item: ModelItem;
  /** 種別。プレビュー画像の経路に要る */
  readonly folder: string;
  readonly baseUrl: string;
  /** カードの高さ（px）。画像の枠は名前の行を引いた残り */
  readonly height: number;
  /** いまの値か（✓ を付ける） */
  readonly current: boolean;
  /** 選んでいるか（枠で示す。情報はこれを出す） */
  readonly selected: boolean;
  /** 押した。`point` は押した所（キーボードならカードの中心）。情報が覆うかの判断に使う */
  readonly onSelect: (item: ModelItem, point: Point) => void;
  /** ダブルクリック・選んでいるときの Enter。配置のボタンと同じ */
  /** 決める（ダブルクリック・Enter）。`origin` は押したカードの場所（札を飛ばす起点） */
  readonly onPlace: (item: ModelItem, origin: DOMRect) => void;
  readonly drag?: ModelCardDrag | undefined;
}

/** プレビュー画像と名前を描き、押すと選び、ダブルクリックと選んでいるときの Enter で決める */
export function ModelCard({
  item,
  folder,
  baseUrl,
  height,
  current,
  selected,
  onSelect,
  onPlace,
  drag,
}: ModelCardProps): React.ReactElement {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const src = comfyPort().models.previewSrc(baseUrl, folder, item.file);
  const slot = usePreviewSlot(src);

  return (
    <div
      className={cardFrame({ selected })}
      style={{ height }}
      draggable={drag !== undefined}
      onPointerDown={drag === undefined ? undefined : () => drag.onPointerDown(item)}
      onDragStart={drag === undefined ? undefined : (event) => drag.onDragStart(event, item)}
    >
      <button
        type="button"
        className="hover:bg-accent flex min-h-0 w-full flex-1 flex-col text-left"
        title={item.path}
        data-model-card=""
        aria-pressed={selected}
        // ダブルクリックの 2 回目の押下は選び直さない（押し直しで外す動きと重ねない）
        onClick={(event) => {
          if (event.detail >= 2) return;
          // キーボードの押下は位置を持たないので、カードの中心とする（押した瞬間に 1 回だけ読む）
          const rect = event.currentTarget.getBoundingClientRect();
          const point =
            event.detail === 0
              ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
              : { x: event.clientX, y: event.clientY };
          onSelect(item, point);
        }}
        onDoubleClick={(event) => onPlace(item, event.currentTarget.getBoundingClientRect())}
        // 選んでいるカードの Enter は決定（押し直しで外す動きにしない）。選んでいなければ押下で選ぶ
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || !selected || isComposingKey(event)) return;
          event.preventDefault();
          onPlace(item, event.currentTarget.getBoundingClientRect());
        }}
      >
        <span className="bg-muted relative flex min-h-0 w-full flex-1 items-center justify-center">
          {src === null || state === 'failed' ? (
            <span className="text-muted-foreground px-2 text-center text-3xs break-all">
              {item.label}
            </span>
          ) : !slot.granted ? (
            // 接続先が webp へ変換して返すので 1 枚ずつ時間がかかる。順番待ちの間も回して待たせる
            // （画像の要素はまだ置かない）
            <Loader2
              className="text-muted-foreground absolute size-5 motion-safe:animate-spin"
              aria-hidden
            />
          ) : (
            <>
              <img
                src={src}
                alt=""
                // 遅延読み込みにしない（画面の外で止まると、取った枠を返さなくなる）。
                // 一度に描くカードは呼び出し元が少しずつ足すので、読む数はそこで抑えられる
                decoding="async"
                // 掴むのはカードの枠（画像だけを掴ませない）
                draggable={false}
                className={cardImage({ ready: state === 'ready' })}
                // 枠からはみ出た所は、指した位置に合わせて寄せて見せる（上端で画像の上端、
                // 左端で左端）。はみ出ない向きは動かない。描き直さないよう、変数を要素に直接書く
                onMouseMove={(event) =>
                  panTo(event.currentTarget, event.nativeEvent.offsetX, event.nativeEvent.offsetY)
                }
                onMouseLeave={(event) => panReset(event.currentTarget)}
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
