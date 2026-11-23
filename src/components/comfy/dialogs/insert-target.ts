import { INSERT_SOURCE_MARK, type TextField } from '@/lib/insert-at-caret';

export { INSERT_SOURCE_MARK };

export function acceptInsertTarget(field: TextField): boolean {
  return field instanceof HTMLTextAreaElement && field.closest(`[${INSERT_SOURCE_MARK}]`) === null;
}

export function textAreaOf(field: TextField | null): HTMLTextAreaElement | null {
  return field instanceof HTMLTextAreaElement ? field : null;
}
