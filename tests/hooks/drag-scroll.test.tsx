// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { useDragScroll } from '@/hooks/ui/use-drag-scroll';

beforeAll(() => {
  HTMLElement.prototype.setPointerCapture = () => undefined;
  HTMLElement.prototype.hasPointerCapture = () => false;
});
afterEach(cleanup);

function Frame({
  enabled,
  onPick,
}: {
  readonly enabled: boolean;
  readonly onPick: () => void;
}): React.ReactElement {
  const { handlers, wasDragged } = useDragScroll(enabled);
  return (
    <div
      data-testid="frame"
      {...handlers}
      onClick={() => {
        if (!wasDragged()) onPick();
      }}
    />
  );
}

function drag(target: Element, dx: number, dy: number, pointerType = 'mouse'): void {
  fireEvent.pointerDown(target, { button: 0, clientX: 100, clientY: 100, pointerType });
  fireEvent.pointerMove(target, { clientX: 100 + dx, clientY: 100 + dy, pointerType });
  fireEvent.pointerUp(target, { pointerType });
  fireEvent.click(target);
}

describe('掴んで送る', () => {
  it('掴んだ所が付いてくる向きに送り、離しても押したことにしない', () => {
    const onPick = vi.fn();
    render(<Frame enabled onPick={onPick} />);
    const frame = screen.getByTestId('frame');
    frame.scrollLeft = 50;
    frame.scrollTop = 50;

    drag(frame, -30, -20);

    expect(frame.scrollLeft).toBe(80);
    expect(frame.scrollTop).toBe(70);
    expect(onPick).not.toHaveBeenCalled();
  });

  it('動かさずに離したら押したことにする', () => {
    const onPick = vi.fn();
    render(<Frame enabled onPick={onPick} />);

    drag(screen.getByTestId('frame'), 1, 0);

    expect(onPick).toHaveBeenCalledOnce();
  });

  it('切っている間と指で触れたときは掴まない', () => {
    const { rerender } = render(<Frame enabled={false} onPick={() => undefined} />);
    const frame = screen.getByTestId('frame');
    frame.scrollLeft = 50;
    drag(frame, -30, 0);
    expect(frame.scrollLeft).toBe(50);

    rerender(<Frame enabled onPick={() => undefined} />);
    drag(frame, -30, 0, 'touch');
    expect(frame.scrollLeft).toBe(50);
  });
});
