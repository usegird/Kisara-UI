// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { createTextMirror } from '@/lib/caret-rect';

// ─────────────────────────────
// 欄と同じ字の組み方の写し。欄の送りのバーが字を組む幅を狭めるぶん、写しの右の余白を広げる。
// ─────────────────────────────

/** 外寸と中身の幅を決めた欄（jsdom は組まないので、幅は手で与える） */
function fieldSized(offsetWidth: number, clientWidth: number): HTMLTextAreaElement {
  const field = document.createElement('textarea');
  field.style.paddingRight = '4px';
  field.style.borderLeftWidth = '1px';
  field.style.borderRightWidth = '1px';
  field.style.borderStyle = 'solid';
  Object.defineProperty(field, 'offsetWidth', { value: offsetWidth });
  Object.defineProperty(field, 'clientWidth', { value: clientWidth });
  document.body.append(field);
  return field;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('欄の写し', () => {
  it('送りのバーが出ていれば、その幅を右の余白に足す', () => {
    // 外寸 200 = 枠 2 + バー 15 + 中身 183
    expect(createTextMirror(fieldSized(200, 183)).style.paddingRight).toBe('19px');
  });

  it('送りのバーが無ければ、欄の余白のまま', () => {
    expect(createTextMirror(fieldSized(200, 198)).style.paddingRight).toBe('4px');
  });
});
