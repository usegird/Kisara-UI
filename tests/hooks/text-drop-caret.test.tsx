// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useTextDropCaret } from '@/hooks/ui/use-text-drop-caret';
import {
  beginTextDrag,
  endTextDrag,
  INSERT_CARET_MARK,
  TEXT_DRAG_TYPE,
} from '@/lib/text-drag-session';

afterEach(() => {
  cleanup();
  endTextDrag();
});

function Host(): React.ReactElement {
  useTextDropCaret();
  return (
    <>
      <textarea aria-label="欄" defaultValue="ab" />
      <div role="dialog">
        <textarea aria-label="画面の中の欄" defaultValue="" />
      </div>
    </>
  );
}

function dragEvent(type: 'dragover' | 'drop', types: readonly string[]): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { types, dropEffect: 'none' } });
  return event;
}

describe('文字のドラッグの落とし先', () => {
  it('挿入位置のアイコンの上なら、その下の欄へ落とせる', () => {
    render(<Host />);
    const field = screen.getByLabelText<HTMLTextAreaElement>('欄');
    const marker = document.createElement('span');
    marker.setAttribute(INSERT_CARET_MARK, '');
    document.body.append(marker);
    Object.defineProperty(document, 'elementsFromPoint', {
      configurable: true,
      value: () => [marker, field, document.body],
    });
    beginTextDrag({ resolve: () => Promise.resolve({ text: '' }) });

    const over = dragEvent('dragover', [TEXT_DRAG_TYPE]);
    act(() => {
      marker.dispatchEvent(over);
    });
    expect(over.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(field);

    Reflect.deleteProperty(document, 'elementsFromPoint');
    marker.remove();
  });

  it('重ねると欄に焦点を当て、落ちたら文字を作ってキャレットの位置へ入れる', async () => {
    render(<Host />);
    const field = screen.getByLabelText<HTMLTextAreaElement>('欄');
    field.setSelectionRange(1, 1);
    let resolved = false;
    beginTextDrag({
      resolve: () => {
        resolved = true;
        return Promise.resolve({ text: 'X' });
      },
    });

    const over = dragEvent('dragover', [TEXT_DRAG_TYPE]);
    act(() => {
      field.dispatchEvent(over);
    });
    expect(over.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(field);
    expect(resolved).toBe(false);

    const drop = dragEvent('drop', [TEXT_DRAG_TYPE]);
    act(() => {
      field.dispatchEvent(drop);
    });
    expect(drop.defaultPrevented).toBe(true);
    await waitFor(() => expect(field.value).toBe('aXb'));
  });

  it('目印の無いドラッグと、画面の中の欄には触れない', () => {
    render(<Host />);
    beginTextDrag({ resolve: () => Promise.resolve({ text: 'X' }) });

    const plain = dragEvent('dragover', ['text/plain']);
    screen.getByLabelText('欄').dispatchEvent(plain);
    expect(plain.defaultPrevented).toBe(false);

    const inner = dragEvent('dragover', [TEXT_DRAG_TYPE]);
    screen.getByLabelText('画面の中の欄').dispatchEvent(inner);
    expect(inner.defaultPrevented).toBe(false);
  });
});
