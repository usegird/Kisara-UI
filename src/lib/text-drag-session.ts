import { INSERT_SOURCE_MARK } from '@/lib/insert-at-caret';

export const TEXT_DRAG_TYPE = 'application/x-kisara-text';

export const INSERT_CARET_MARK = 'data-insert-caret';

export type DragTextResult = { readonly text: string } | { readonly error: string };

interface TextDragSession {
  readonly resolve: () => Promise<DragTextResult>;
  readonly onError?: ((message: string) => void) | undefined;
}

let current: TextDragSession | null = null;

export function beginTextDrag(session: TextDragSession): void {
  current = session;
}

export function takeTextDrag(): TextDragSession | null {
  const session = current;
  current = null;
  return session;
}

export function endTextDrag(): void {
  current = null;
}

export function isTextDropTarget(target: EventTarget | null): target is HTMLTextAreaElement {
  return (
    target instanceof HTMLTextAreaElement &&
    target.closest('[role="dialog"]') === null &&
    target.closest(`[${INSERT_SOURCE_MARK}]`) === null
  );
}
