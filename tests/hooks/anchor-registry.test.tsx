// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { useAnchorRegistry, type AnchorRegistry } from '@/hooks/ui/use-anchor-registry';

import { stubMissingDom } from '../helpers/dom';

let shift = 0;

beforeAll(() => {
  stubMissingDom();
  Element.prototype.getBoundingClientRect = function getBoundingClientRect(): DOMRect {
    const moves = this.hasAttribute('data-moves');
    const top = moves ? 100 - shift : 0;
    const rect = { x: 0, y: top, left: 0, top, width: 100, height: 100, right: 100 };
    return { ...rect, bottom: top + 100 } as DOMRect;
  };
});

afterEach(() => {
  cleanup();
  shift = 0;
});

type Positions = AnchorRegistry['positions'];

interface SheetProps {
  readonly onReady: (positions: Positions) => void;
}

function Sheet({ onReady }: SheetProps): React.ReactElement {
  const { attachContainer, register, positions } = useAnchorRegistry();
  useEffect(() => {
    onReady(positions);
  }, [onReady, positions]);
  return (
    <div data-testid="scroller" ref={(element) => register('viewport')(element)}>
      <div data-moves ref={attachContainer}>
        <div data-moves ref={(element) => register('row')(element)} />
      </div>
    </div>
  );
}

describe('位置の台帳', () => {
  it('測っている送りの枠を送ると、原点との位置を測り直す', async () => {
    let positions: Positions | null = null;
    const viewportTop = (): number | undefined => positions?.getState().rects.get('viewport')?.top;
    const { getByTestId } = render(
      <Sheet
        onReady={(ready) => {
          positions = ready;
        }}
      />,
    );
    await waitFor(() => expect(viewportTop()).toBe(-100));

    shift = 40;
    fireEvent.scroll(getByTestId('scroller'));

    await waitFor(() => expect(viewportTop()).toBe(-60));
  });
});
