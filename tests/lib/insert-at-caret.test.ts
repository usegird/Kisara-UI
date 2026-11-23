// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { insertAtCaret, insertEntry, isTextField, replaceFieldText } from '@/lib/insert-at-caret';

function textarea(value: string, start: number, end = start): HTMLTextAreaElement {
  const element = document.createElement('textarea');
  element.value = value;
  document.body.append(element);
  element.setSelectionRange(start, end);

  return element;
}

describe('差し込み', () => {
  it('キャレット位置に入れ、その末尾へキャレットを移す', () => {
    const element = textarea('1girl, solo', 7);

    expect(insertAtCaret(element, 'masterpiece, ')).toBe(true);
    expect(element.value).toBe('1girl, masterpiece, solo');
    expect(element.selectionStart).toBe(20);
  });

  it('選んでいる範囲は置き換える', () => {
    const element = textarea('1girl, solo', 7, 11);

    insertAtCaret(element, 'duo');

    expect(element.value).toBe('1girl, duo');
  });

  it('値が変わったことを input で知らせる', () => {
    const element = textarea('a', 1);
    const listener = vi.fn();
    element.addEventListener('input', listener);

    insertAtCaret(element, 'b');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0]).toBeInstanceOf(Event);
  });

  it('空文字は入れない', () => {
    const element = textarea('a', 1);

    expect(insertAtCaret(element, '')).toBe(false);
    expect(element.value).toBe('a');
  });
});

describe('取り消し履歴', () => {
  it('人が打ったのと同じ編集として入れる（Ctrl+Z で戻せる道）', () => {
    const element = textarea('ab', 1);
    const insertText = vi.fn((command: string, _ui: boolean, value?: string) => {
      element.value = `${element.value.slice(0, 1)}${value ?? ''}${element.value.slice(1)}`;
      return command === 'insertText';
    });
    Object.defineProperty(document, 'execCommand', { value: insertText, configurable: true });

    expect(insertAtCaret(element, 'X')).toBe(true);
    expect(insertText).toHaveBeenCalledWith('insertText', false, 'X');
    expect(element.value).toBe('aXb');

    Reflect.deleteProperty(document, 'execCommand');
  });

  it('使えない環境では素の setter の道へ落ちる', () => {
    Object.defineProperty(document, 'execCommand', {
      value: () => false,
      configurable: true,
    });
    const element = textarea('ab', 1);

    expect(insertAtCaret(element, 'X')).toBe(true);
    expect(element.value).toBe('aXb');

    Reflect.deleteProperty(document, 'execCommand');
  });
});

describe('まるごと置き換える', () => {
  it('選び直して人が打ったのと同じ編集で置き換え、空にするときは delete で消す（Ctrl+Z で戻せる道）', () => {
    const element = textarea('old', 0);
    const run = vi.fn((command: string, _ui: boolean, value?: string) => {
      element.value = command === 'delete' ? '' : (value ?? '');
      return true;
    });
    Object.defineProperty(document, 'execCommand', { value: run, configurable: true });

    expect(replaceFieldText(element, 'new')).toBe(true);
    expect(run).toHaveBeenCalledWith('insertText', false, 'new');
    expect(replaceFieldText(element, '')).toBe(true);
    expect(run).toHaveBeenLastCalledWith('delete');
    expect(element.value).toBe('');

    Reflect.deleteProperty(document, 'execCommand');
  });

  it('使えない環境では素の setter で置き換え、input で知らせる', () => {
    Object.defineProperty(document, 'execCommand', { value: () => false, configurable: true });
    const element = textarea('old', 0);
    const onInput = vi.fn();
    element.addEventListener('input', onInput);

    expect(replaceFieldText(element, 'new')).toBe(true);
    expect(element.value).toBe('new');
    expect(onInput).toHaveBeenCalledTimes(1);

    Reflect.deleteProperty(document, 'execCommand');
  });
});

describe('差し込み先の判別', () => {
  it('文字を打てる欄だけを受ける', () => {
    expect(isTextField(document.createElement('textarea'))).toBe(true);

    const text = document.createElement('input');
    text.type = 'text';
    expect(isTextField(text)).toBe(true);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    expect(isTextField(checkbox)).toBe(false);
    expect(isTextField(document.createElement('button'))).toBe(false);
    expect(isTextField(null)).toBe(false);
  });
});

describe('差し込みの画面からの 1 件', () => {
  it('改行を足さずにそのまま入れ、キャレットを後ろに置く', () => {
    const element = textarea('ab', 1);

    expect(insertEntry(element, '__w__')?.text).toBe('__w__');
    expect(element.value).toBe('a__w__b');
    expect(element.selectionStart).toBe(6);
  });

  it('改行で終わる文字（Lora の既定の書式）も、そのまま入れてキャレットを後ろに置く', () => {
    const element = textarea('ab', 1);

    expect(insertEntry(element, 'X\n')?.text).toBe('X\n');
    expect(element.value).toBe('aX\nb');
    expect(element.selectionStart).toBe(3);
  });
});
