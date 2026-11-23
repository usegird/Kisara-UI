export type TextField = HTMLInputElement | HTMLTextAreaElement;

export const INSERT_SOURCE_MARK = 'data-insert-source';

const quietFields = new WeakSet<TextField>();

export function insertQuietly(element: TextField, text: string): boolean {
  quietFields.add(element);
  try {
    return insertAtCaret(element, text);
  } finally {
    quietFields.delete(element);
  }
}

export function insertEntry(
  element: TextField,
  text: string,
): { readonly start: number; readonly text: string } | null {
  if (text.length === 0) return null;
  const start = element.selectionStart ?? element.value.length;
  if (!insertQuietly(element, text)) return null;
  return { start, text };
}

export function isQuietInput(element: TextField): boolean {
  return quietFields.has(element);
}

export function isTextField(element: Element | null): element is TextField {
  if (element instanceof HTMLTextAreaElement) return true;
  if (!(element instanceof HTMLInputElement)) return false;

  return ['text', 'search', 'url', 'tel', 'password', 'email', 'number'].includes(element.type);
}

function nativeValueSetter(element: TextField): ((value: string) => void) | null {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- 上のコメントの理由
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

  if (setter === undefined) return null;

  return (value: string): void => {
    Reflect.apply(setter, element, [value]);
  };
}

function insertAsUserEdit(element: TextField, text: string): boolean {
  const owner = element.ownerDocument;
  if (typeof owner.execCommand !== 'function') return false;

  const insertText = owner.execCommand.bind(owner);
  try {
    element.focus();
    return insertText('insertText', false, text);
  } catch {
    return false;
  }
}

export function insertAtCaret(element: TextField, text: string): boolean {
  if (text.length === 0) return false;
  if (insertAsUserEdit(element, text)) return true;

  const setValue = nativeValueSetter(element);
  if (setValue === null) return false;

  const value = element.value;
  const start = element.selectionStart ?? value.length;
  const end = element.selectionEnd ?? start;

  setValue(`${value.slice(0, start)}${text}${value.slice(end)}`);
  element.dispatchEvent(new Event('input', { bubbles: true }));

  const caret = start + text.length;
  element.setSelectionRange(caret, caret);
  element.focus();

  return true;
}

export function replaceFieldText(element: TextField, text: string): boolean {
  if (element.value === text) return true;
  element.focus();
  element.select();
  const owner = element.ownerDocument;
  if (typeof owner.execCommand === 'function') {
    const run = owner.execCommand.bind(owner);
    try {
      if (text.length === 0 ? run('delete') : run('insertText', false, text)) return true;
    } catch {
    }
  }
  const setValue = nativeValueSetter(element);
  if (setValue === null) return false;
  setValue(text);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.setSelectionRange(text.length, text.length);
  return true;
}
