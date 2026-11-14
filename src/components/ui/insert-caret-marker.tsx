import { TextCursor } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { DIALOG_ICON_CLASS } from '@/components/ui/dialog-header';
import { startCaretDrag } from '@/components/ui/text-drag';
import { t } from '@/i18n';
import { caretRectOf } from '@/lib/caret-rect';
import { INSERT_CARET_MARK } from '@/lib/text-drag-session';
import { cn } from '@/lib/utils';

// ─────────────────────────────
// 挿入位置のアイコン。差し込み先の欄のキャレットに重ねて付いていき、掴んで別の位置・欄へ落とすと
// そこが差し込み先になる。差し込み先が無いときは帯に置き、欄へ落として差し込み先を決める。
// Lora・スタイル・ワイルドカードで共通。
// ─────────────────────────────

/** アイコンの大きさの下限（px。size-3.5 と同じ） */
const MIN_SIZE = 14;

/** 欄の端からはみ出してよい量（px。端の行のキャレットを、丸めの誤差で隠さない） */
const EDGE_SLACK = 1;

/** 欄で受ける、キャレットが動きうる知らせ */
const FIELD_EVENTS = ['input', 'selectionchange', 'keyup', 'pointerup'] as const;

/** アイコンを置く位置（ビューポートの座標。キャレットの行の上端と高さ） */
interface MarkerSpot {
  readonly left: number;
  readonly top: number;
  readonly height: number;
}

/**
 * 差し込み先の欄のキャレットに重ねるアイコン。打つ・押す・送るたびに付いていき、欄の見えている範囲の外なら隠す
 */
export function InsertCaretMarker({
  field,
}: {
  readonly field: HTMLTextAreaElement;
}): React.ReactElement | null {
  const [spot, setSpot] = useState<MarkerSpot | null>(null);
  // 掴んでいる間は隠す（指す位置の欄のキャレットが位置を見せ、アイコンが当たり判定を奪わない）
  const [dragging, setDragging] = useState(false);

  // キャレットの位置を読んで置く。置いても欄の文字・選択・送りは変わらないので、読んだ結果で
  // また読み直すことはない（同じ位置なら書かない）
  useEffect(() => {
    const doc = field.ownerDocument;
    const view = doc.defaultView;
    const update = (): void => {
      const next = spotOf(field);
      setSpot((current) =>
        current?.left === next?.left &&
        current?.top === next?.top &&
        current?.height === next?.height
          ? current
          : next,
      );
    };
    update();
    // キャレットの移り変わりは、文書へ知らせるブラウザと欄へ知らせるブラウザがあるので両方で受け、
    // 知らせの無い環境のために打鍵と押下でも読む
    doc.addEventListener('selectionchange', update);
    // 欄の中の送り・外の列の送り（どちらも泡立たないので捕まえる側で受ける）
    doc.addEventListener('scroll', update, true);
    for (const type of FIELD_EVENTS) field.addEventListener(type, update);
    view?.addEventListener('resize', update);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(field);
    return () => {
      doc.removeEventListener('selectionchange', update);
      doc.removeEventListener('scroll', update, true);
      for (const type of FIELD_EVENTS) field.removeEventListener(type, update);
      view?.removeEventListener('resize', update);
      observer?.disconnect();
    };
  }, [field]);

  if (spot === null) return null;
  const onDragStart = (event: React.DragEvent<HTMLElement>): void => {
    startCaretDrag(event);
    // 掴んだ瞬間の見た目をブラウザが写してから隠す
    globalThis.setTimeout(() => setDragging(true), 0);
  };
  return createPortal(
    <span
      // 指先の操作の近道。キーボードでは欄にキャレットを置けば同じになるので、読み上げには出さない
      aria-hidden
      draggable
      // 指先の真下に来ても、下の欄へ落とせるようにする目印
      {...{ [INSERT_CARET_MARK]: '' }}
      title={t('insertBar.caretMarker')}
      className="text-success fixed z-40 cursor-grab"
      style={{
        left: spot.left - spot.height / 2,
        top: spot.top,
        opacity: dragging ? 0 : 1,
        pointerEvents: dragging ? 'none' : 'auto',
      }}
      onDragStart={onDragStart}
      onDragEnd={() => setDragging(false)}
    >
      {/* 行の高さに合わせ、欄のキャレットに重ねる */}
      <TextCursor style={{ width: spot.height, height: spot.height }} strokeWidth={2.5} />
    </span>,
    field.ownerDocument.body,
  );
}

/** 差し込み先が無いときに帯の決定の右へ置くアイコン。複数行の欄へ落とすと差し込み先になる */
export function InsertCaretHandle(): React.ReactElement {
  return (
    <span
      draggable
      // 見出しの理由の文が同じことを伝えるので、読み上げには出さない
      aria-hidden
      title={t('insertBar.caretHandle')}
      className={cn(DIALOG_ICON_CLASS, 'text-success shrink-0 cursor-grab')}
      onDragStart={startCaretDrag}
    >
      <TextCursor className="size-4" />
    </span>
  );
}

/**
 * 帯の決定の右に置くもの。差し込み先があれば欄のキャレットにアイコンを重ね（帯には何も置かない）、
 * 無ければ帯にアイコンを置く。開いている間だけ描くこと
 */
export function InsertCaretAside({
  field,
}: {
  readonly field: HTMLTextAreaElement | null;
}): React.ReactElement {
  return field === null ? <InsertCaretHandle /> : <InsertCaretMarker field={field} />;
}

/** 見出しの補足。差し込み先が無ければ、代わりにその理由を赤で出す */
export function InsertTargetSubtitle({
  subtitle,
  blocked,
}: {
  readonly subtitle: string;
  /** 差し込み先が無い理由。差し込み先があれば null */
  readonly blocked: string | null;
}): React.ReactNode {
  if (blocked === null) return subtitle;
  return <span className="text-destructive">{blocked}</span>;
}

/** 欄のキャレットの上に置くアイコンの位置。欄の見えている範囲の外なら null */
function spotOf(field: HTMLTextAreaElement): MarkerSpot | null {
  if (!field.isConnected) return null;
  const caret = caretRectOf(field, field.selectionStart);
  const box = field.getBoundingClientRect();
  const inside =
    caret.top >= box.top - EDGE_SLACK &&
    caret.bottom <= box.bottom + EDGE_SLACK &&
    caret.left >= box.left - EDGE_SLACK &&
    caret.left <= box.right + EDGE_SLACK;
  if (!inside) return null;
  // 写しの印が高さを持たない環境でも絵が消えないよう、下限を置く
  return { left: caret.left, top: caret.top, height: Math.max(caret.bottom - caret.top, MIN_SIZE) };
}
