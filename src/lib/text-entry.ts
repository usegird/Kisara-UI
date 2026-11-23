const COMPOSING_KEY_CODE = 229;

const NON_TEXT_INPUTS = new Set([
  'button',
  'checkbox',
  'radio',
  'range',
  'color',
  'file',
  'submit',
]);

export function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true;

  return target instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(target.type);
}

interface KeyEventLike {
  readonly keyCode: number;
  readonly nativeEvent: { readonly isComposing: boolean };
}

type EntryKey = 'commit' | 'cancel';

interface ShortcutEventLike {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

export function historyKeyOf(event: ShortcutEventLike): 'undo' | 'redo' | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === 'y' && !event.shiftKey) return 'redo';
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  return null;
}

export function isComposingKey(event: KeyEventLike): boolean {
  return event.nativeEvent.isComposing || event.keyCode === COMPOSING_KEY_CODE;
}

export function entryKeyOf(event: KeyEventLike & { readonly key: string }): EntryKey | null {
  if (isComposingKey(event)) return null;
  if (event.key === 'Enter') return 'commit';
  return event.key === 'Escape' ? 'cancel' : null;
}
