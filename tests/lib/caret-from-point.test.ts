// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { caretOffsetAt } from '@/lib/caret-from-point';

// ─────────────────────────────
// カードのコメントで、押した位置の文字の位置
// ─────────────────────────────

function pointAt(node: Node, offset: number): void {
  Object.defineProperty(document, 'caretPositionFromPoint', {
    configurable: true,
    value: () => ({ offsetNode: node, offset }),
  });
}

afterEach(() => {
  Reflect.deleteProperty(document, 'caretPositionFromPoint');
  document.body.replaceChildren();
});

describe('押した位置の文字の位置', () => {
  it('文字が塊に分かれていても、手前の文字を数えて通しの位置にする', () => {
    const span = document.createElement('span');
    span.append('ab', document.createElement('b'), 'cde');
    document.body.append(span);
    pointAt(span.lastChild as Node, 2);
    expect(caretOffsetAt(span, 0, 0)).toBe(4);
  });

  it('外を指したとき・引けない環境では null', () => {
    const span = document.createElement('span');
    span.textContent = 'abc';
    document.body.append(span);
    expect(caretOffsetAt(span, 0, 0)).toBeNull();
    pointAt(document.body, 0);
    expect(caretOffsetAt(span, 0, 0)).toBeNull();
  });
});
