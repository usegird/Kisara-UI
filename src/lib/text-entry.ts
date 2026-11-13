// ─────────────────────────────
// 文字を入れている最中か（要素・変換中のキー）。**その要素自身の取り消しやキー操作を横取りしない**ために使う。
// ─────────────────────────────

/** 変換中を示すキーの番号（Safari は確定の Enter でも `isComposing` を立てず、これだけを返す） */
const COMPOSING_KEY_CODE = 229;

/** 文字を打たない input（押す・選ぶだけのもの） */
const NON_TEXT_INPUTS = new Set([
  'button',
  'checkbox',
  'radio',
  'range',
  'color',
  'file',
  'submit',
]);

/** 文字を打てる要素（文字の欄・複数行の欄・編集できる要素）か */
export function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true;

  return target instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(target.type);
}

/** 押したキーの受け取り物（React のキーの事象と同じ形。lib は React を読まない） */
interface KeyEventLike {
  readonly keyCode: number;
  readonly nativeEvent: { readonly isComposing: boolean };
}

/** 欄の確定・取り消しのキー */
type EntryKey = 'commit' | 'cancel';

/** 取り消し・やり直しを見分けるのに使う、押したキーの受け取り物 */
interface ShortcutEventLike {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
}

/** 取り消し（Ctrl+Z）・やり直し（Ctrl+Y・Ctrl+Shift+Z）のキーか。Mac は Cmd。Alt 付きは別の操作なので外す */
export function historyKeyOf(event: ShortcutEventLike): 'undo' | 'redo' | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === 'y' && !event.shiftKey) return 'redo';
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  return null;
}

/** 変換中のキーか（変換を確定する Enter・Esc を、送信や閉じる操作として扱わない） */
export function isComposingKey(event: KeyEventLike): boolean {
  return event.nativeEvent.isComposing || event.keyCode === COMPOSING_KEY_CODE;
}

/**
 * 欄の確定（Enter）・取り消し（Esc）のキーか。どちらでもないキーと、変換中のキーは null
 * （変換を確定する Enter・Esc で欄を確定・取り消ししない）
 */
export function entryKeyOf(event: KeyEventLike & { readonly key: string }): EntryKey | null {
  if (isComposingKey(event)) return null;
  if (event.key === 'Enter') return 'commit';
  return event.key === 'Escape' ? 'cancel' : null;
}
