// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { textDragProps } from '@/components/ui/text-drag';

// ─────────────────────────────
// 文字のドラッグ。指先に付いてくる絵は載せる文字だけの小さな札にする
// （掴んだ要素が付いてくると、落とし先のキャレットを覆い隠すため）。
// ─────────────────────────────

afterEach(cleanup);

describe('文字のドラッグ', () => {
  it('文字を載せ、札を指先の右下に出す', () => {
    render(<div {...textDragProps('<lora:b:1>')}>b</div>);
    const setData = vi.fn();
    const setDragImage = vi.fn();

    fireEvent.dragStart(screen.getByText('b'), {
      dataTransfer: { setData, setDragImage, effectAllowed: '' },
    });

    expect(setData).toHaveBeenCalledWith('text/plain', '<lora:b:1>');
    const [label, x, y] = setDragImage.mock.calls[0] as [HTMLElement, number, number];
    expect(label.textContent).toBe('<lora:b:1>');
    expect(x).toBeLessThan(0);
    expect(y).toBeLessThan(0);
  });

  it('長い文面は札で末尾を省く（載せる文字は全部）', () => {
    const text = 'a'.repeat(60);
    render(<div {...textDragProps(text)}>long</div>);
    const setData = vi.fn();
    const setDragImage = vi.fn();

    fireEvent.dragStart(screen.getByText('long'), {
      dataTransfer: { setData, setDragImage, effectAllowed: '' },
    });

    expect(setData).toHaveBeenCalledWith('text/plain', text);
    expect((setDragImage.mock.calls[0]?.[0] as HTMLElement).textContent).toHaveLength(41);
  });

  it('文字が空なら掴ませない', () => {
    expect(textDragProps('').draggable).toBe(false);
  });
});
