// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { useDragPan } from '@/hooks/ui/use-drag-pan';

beforeAll(() => {
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.hasPointerCapture = () => false;
});
afterEach(cleanup);

const surface = (target: Element): boolean => target.closest('li') === null;

function Flow(): React.ReactElement {
  const scroller = useRef<HTMLDivElement | null>(null);
  const left = useRef<HTMLDivElement | null>(null);
  const right = useRef<HTMLDivElement | null>(null);
  const pan = useDragPan(
    () => scroller.current,
    (target) => (target.closest('[data-testid="left"]') ? left.current : right.current),
    surface,
  );
  return (
    <div ref={scroller} data-testid="flow" {...pan}>
      <div ref={left} data-testid="left">
        <ul>
          <li>カード</li>
        </ul>
      </div>
      <div ref={right} data-testid="right" />
    </div>
  );
}

const drag = (target: Element, pointerType = 'mouse'): void => {
  fireEvent.pointerDown(target, { button: 0, clientX: 100, clientY: 100, pointerType });
  fireEvent.pointerMove(target, { clientX: 70, clientY: 60, pointerType });
  fireEvent.pointerUp(target, { pointerType });
};

describe('何も無い所を掴んで送る', () => {
  it('横は全体、縦は掴んだ列だけを送る（掴んだ所に中身が付いてくる向き）', () => {
    render(<Flow />);
    const flow = screen.getByTestId('flow');
    flow.scrollLeft = 50;
    screen.getByTestId('right').scrollTop = 10;

    drag(screen.getByTestId('right'));

    expect(flow.scrollLeft).toBe(80);
    expect(screen.getByTestId('right').scrollTop).toBe(50);
    expect(screen.getByTestId('left').scrollTop).toBe(0);
  });

  it('掴んでいる間に Esc を押すと掴んだ位置へ戻してやめる。Esc はほかへ渡さない', () => {
    render(<Flow />);
    const flow = screen.getByTestId('flow');
    flow.scrollLeft = 50;
    const right = screen.getByTestId('right');
    const outside = vi.fn();
    document.body.addEventListener('keydown', outside);

    fireEvent.pointerDown(right, { button: 0, clientX: 100, clientY: 100, pointerType: 'mouse' });
    fireEvent.pointerMove(right, { clientX: 70, clientY: 60, pointerType: 'mouse' });
    expect(flow.scrollLeft).toBe(80);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(flow.scrollLeft).toBe(50);
    expect(outside).not.toHaveBeenCalled();

    fireEvent.pointerMove(right, { clientX: 40, clientY: 60, pointerType: 'mouse' });
    expect(flow.scrollLeft).toBe(50);
    document.body.removeEventListener('keydown', outside);
  });

  it('中身の上と、指で触れたときは掴まない', () => {
    render(<Flow />);
    const flow = screen.getByTestId('flow');

    drag(screen.getByText('カード'));
    drag(screen.getByTestId('right'), 'touch');

    expect(flow.scrollLeft).toBe(0);
    expect(screen.getByTestId('right').scrollTop).toBe(0);
  });
});
