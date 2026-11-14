import { createTextChip } from '@/lib/insert-motion';
import { beginTextDrag, TEXT_DRAG_TYPE, type DragTextResult } from '@/lib/text-drag-session';

// ─────────────────────────────
// 文字のドラッグの掴む側。掴んだものに目印を付け、「落とされたら入れる文字の作り方」を置く。
// 落とし先の欄でキャレットを見せて入れるのは `useTextDropCaret`。
// ─────────────────────────────

/** 写させる間だけ札を置く、画面の外の位置（px） */
const OFF_SCREEN = -9999;
/** 札を指先からずらす量（px）。負の値で指先の右下に出る（指先の真下はキャレットのために空ける） */
const OFFSET = -12;

/**
 * 指先に付いてくる札を作って載せる。既定では掴んだ要素そのもの（Lora ならカードの画像）が付いてきて、
 * 落とし先の欄のキャレットを覆い隠すため、載せる文字だけの小さな札にする。
 * ブラウザは渡した瞬間の見た目を写すので、写したら外す
 */
function dragLabel(event: React.DragEvent<HTMLElement>, text: string): void {
  const label = createTextChip(event.currentTarget.ownerDocument, text);
  // 画面の外に置いて写させる（見えるところに一瞬出さない）
  label.style.left = `${String(OFF_SCREEN)}px`;
  event.currentTarget.ownerDocument.body.append(label);
  event.dataTransfer.setDragImage(label, OFFSET, OFFSET);
  globalThis.setTimeout(() => label.remove(), 0);
}

/** 文字のドラッグを始めるときに渡すもの */
interface TextDragStart {
  /** 札に出す文字 */
  readonly label: string;
  /** 掴んだ時点で分かっている文字。ほかのアプリ・ほかの欄へ落とすとき用（無ければ載せない） */
  readonly text: string | null;
  /** 落とされたときに入れる文字を作る */
  readonly resolve: () => Promise<DragTextResult>;
  /** 作れなかったときに理由を伝える先 */
  readonly onError?: ((message: string) => void) | undefined;
}

/** 掴んだ瞬間に目印と文字を載せ、入れる文字の作り方を置く。写しとして落とす */
export function startTextDrag(
  event: React.DragEvent<HTMLElement>,
  { label, text, resolve, onError }: TextDragStart,
): void {
  event.dataTransfer.setData(TEXT_DRAG_TYPE, '');
  if (text !== null) event.dataTransfer.setData('text/plain', text);
  event.dataTransfer.effectAllowed = 'copy';
  beginTextDrag({ resolve, onError });
  // 札を差し替えられない環境（テストなど）では既定の絵のまま
  if (typeof event.dataTransfer.setDragImage === 'function') dragLabel(event, label);
}

/** 一覧の 1 件を掴めるようにする（文字が決まっているもの）。文字が空なら掴ませない */
export function textDragProps(text: string): {
  readonly draggable: boolean;
  readonly onDragStart: ((event: React.DragEvent<HTMLElement>) => void) | undefined;
} {
  if (text.length === 0) return { draggable: false, onDragStart: undefined };
  return {
    draggable: true,
    onDragStart: (event) =>
      startTextDrag(event, { label: text, text, resolve: () => Promise.resolve({ text }) }),
  };
}

/**
 * 挿入位置のアイコンを掴む。文字は入れず、落とした欄と位置を差し込み先にする（欄に重ねている間と落ちたときに
 * キャレットを置くのは `useTextDropCaret` で、そこで焦点が移って差し込み先が変わる）。指先にはアイコンが付いてくる
 */
export function startCaretDrag(event: React.DragEvent<HTMLElement>): void {
  event.dataTransfer.setData(TEXT_DRAG_TYPE, '');
  event.dataTransfer.effectAllowed = 'copy';
  beginTextDrag({ resolve: () => Promise.resolve({ text: '' }) });
}
