import { useEffect } from 'react';

import { textFieldOffsetAt } from '@/lib/caret-from-point';
import { insertAtCaret } from '@/lib/insert-at-caret';
import {
  endTextDrag,
  isTextDropTarget,
  takeTextDrag,
  TEXT_DRAG_TYPE,
} from '@/lib/text-drag-session';

// ─────────────────────────────
// 文字のドラッグの落とし先。入る位置のキャレットを見せ、落ちたらそこへ入れる。
// ─────────────────────────────

/** 目印（`TEXT_DRAG_TYPE`）の付いたドラッグか。ほかのドラッグ（ファイルなど）には触れない */
function isOurs(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes(TEXT_DRAG_TYPE) === true;
}

/**
 * 指す位置へキャレットを動かす。位置が取れなければ動かさない（欄のいまのキャレット位置へ入れる）。
 * ブラウザ任せでは、重ねている間に落とす位置のキャレットが出ない環境があるので、欄に焦点を当てて見せる。
 */
function placeCaret(field: HTMLTextAreaElement, event: DragEvent): void {
  if (field.ownerDocument.activeElement !== field) field.focus({ preventScroll: true });
  const offset = textFieldOffsetAt(field, event.clientX, event.clientY);
  if (offset === null) return;
  if (field.selectionStart !== offset || field.selectionEnd !== offset) {
    field.setSelectionRange(offset, offset);
  }
}

/**
 * 文書全体で目印の付いた文字のドラッグを受け、重ねている間はキャレットを見せ、落ちたら同じ位置へ
 * 入れる（見せた位置と入る位置をずらさない）。入れる文字は落ちた時に作り（`text-drag-session`）、
 * 打鍵と同じく欄の取り消し履歴に積む（`insertAtCaret`）。
 */
export function useTextDropCaret(): void {
  useEffect(() => {
    const doc = globalThis.document;

    const onDragOver = (event: DragEvent): void => {
      if (!isOurs(event) || !isTextDropTarget(event.target)) return;
      // 落とせることを示す（既定のままだと、文字を持たないドラッグは落とせない扱いになる）
      event.preventDefault();
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'copy';
      placeCaret(event.target, event);
    };

    const onDrop = (event: DragEvent): void => {
      if (!isOurs(event) || !isTextDropTarget(event.target)) return;
      // ブラウザには入れさせない（見せた位置へこちらで入れる）
      event.preventDefault();
      const field = event.target;
      placeCaret(field, event);
      const session = takeTextDrag();
      if (session === null) return;
      void session.resolve().then((result) => {
        if ('error' in result) {
          session.onError?.(result.error);
          return;
        }
        if (field.isConnected) insertAtCaret(field, result.text);
      });
    };

    // 落とさずに終えたら置き場を空にする（落としたときは取り出し済み）
    const onDragEnd = (): void => endTextDrag();

    doc.addEventListener('dragover', onDragOver, true);
    doc.addEventListener('drop', onDrop, true);
    doc.addEventListener('dragend', onDragEnd, true);
    return () => {
      doc.removeEventListener('dragover', onDragOver, true);
      doc.removeEventListener('drop', onDrop, true);
      doc.removeEventListener('dragend', onDragEnd, true);
    };
  }, []);
}
