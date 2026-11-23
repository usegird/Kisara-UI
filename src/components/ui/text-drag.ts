import { createTextChip } from '@/lib/insert-motion';
import { beginTextDrag, TEXT_DRAG_TYPE, type DragTextResult } from '@/lib/text-drag-session';

const OFF_SCREEN = -9999;
const OFFSET = -12;

function dragLabel(event: React.DragEvent<HTMLElement>, text: string): void {
  const label = createTextChip(event.currentTarget.ownerDocument, text);
  label.style.left = `${String(OFF_SCREEN)}px`;
  event.currentTarget.ownerDocument.body.append(label);
  event.dataTransfer.setDragImage(label, OFFSET, OFFSET);
  globalThis.setTimeout(() => label.remove(), 0);
}

interface TextDragStart {
  readonly label: string;
  readonly text: string | null;
  readonly resolve: () => Promise<DragTextResult>;
  readonly onError?: ((message: string) => void) | undefined;
}

export function startTextDrag(
  event: React.DragEvent<HTMLElement>,
  { label, text, resolve, onError }: TextDragStart,
): void {
  event.dataTransfer.setData(TEXT_DRAG_TYPE, '');
  if (text !== null) event.dataTransfer.setData('text/plain', text);
  event.dataTransfer.effectAllowed = 'copy';
  beginTextDrag({ resolve, onError });
  if (typeof event.dataTransfer.setDragImage === 'function') dragLabel(event, label);
}

export function textDragProps(text: string): {
  readonly draggable: boolean;
  readonly onDragStart: ((event: React.DragEvent<HTMLElement>) => void) | undefined;
} {
  if (text.length === 0) return { draggable: false, onDragStart: undefined };
  return {
    draggable: true,
    onDragStart: (event) =>
      startTextDrag(event, {
        label: text,
        text,
        resolve: () => Promise.resolve({ text }),
      }),
  };
}
