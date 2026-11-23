import { useEffect } from 'react';

import { textFieldOffsetAt } from '@/lib/caret-from-point';
import { placeEntry } from '@/lib/insert-motion';
import {
  endTextDrag,
  INSERT_CARET_MARK,
  isTextDropTarget,
  takeTextDrag,
  TEXT_DRAG_TYPE,
} from '@/lib/text-drag-session';

function isOurs(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes(TEXT_DRAG_TYPE) === true;
}

function dropFieldOf(event: DragEvent): HTMLTextAreaElement | null {
  const { target } = event;
  if (isTextDropTarget(target)) return target;
  if (!(target instanceof Element) || target.closest(`[${INSERT_CARET_MARK}]`) === null) {
    return null;
  }
  const doc = target.ownerDocument;
  if (typeof doc.elementsFromPoint !== 'function') return null;
  return doc.elementsFromPoint(event.clientX, event.clientY).find(isTextDropTarget) ?? null;
}

function placeCaret(field: HTMLTextAreaElement, event: DragEvent): void {
  if (field.ownerDocument.activeElement !== field) field.focus({ preventScroll: true });
  const offset = textFieldOffsetAt(field, event.clientX, event.clientY);
  if (offset === null) return;
  if (field.selectionStart !== offset || field.selectionEnd !== offset) {
    field.setSelectionRange(offset, offset);
  }
}

export function useTextDropCaret(): void {
  useEffect(() => {
    const doc = globalThis.document;

    const onDragOver = (event: DragEvent): void => {
      const field = isOurs(event) ? dropFieldOf(event) : null;
      if (field === null) return;
      event.preventDefault();
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'copy';
      placeCaret(field, event);
    };

    const onDrop = (event: DragEvent): void => {
      const field = isOurs(event) ? dropFieldOf(event) : null;
      if (field === null) return;
      event.preventDefault();
      placeCaret(field, event);
      const session = takeTextDrag();
      if (session === null) return;
      void session.resolve().then((result) => {
        if ('error' in result) {
          session.onError?.(result.error);
          return;
        }
        if (field.isConnected) {
          placeEntry(field, result.text, null);
        }
      });
    };

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
