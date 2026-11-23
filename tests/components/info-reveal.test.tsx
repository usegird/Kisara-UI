// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useInfoReveal } from '@/components/comfy/flow/dialogs/use-info-reveal';

afterEach(cleanup);

function area(): React.RefObject<HTMLElement> {
  const element = document.createElement('div');
  element.getBoundingClientRect = () => DOMRect.fromRect({ x: 0, y: 0, width: 1000, height: 800 });
  return { current: element };
}

function card(right: number): DOMRect {
  return DOMRect.fromRect({ x: right - 100, y: 0, width: 100, height: 100 });
}

describe('情報が重なったカード', () => {
  it('右に幅 300 の情報なら、右端が 700 を越えるカードを重なったとする', () => {
    const { result } = renderHook(() => useInfoReveal(area(), 'right', 300, true));

    act(() => result.current.reveal('a', { x: 650, y: 50 }, card(750)));
    expect(result.current.coveredCard).toBe('a');

    act(() => result.current.reveal('b', { x: 50, y: 50 }, card(100)));
    expect(result.current.coveredCard).toBeNull();
  });

  it('開け閉てで戻すと、重なったカードを忘れる', () => {
    const { result } = renderHook(() => useInfoReveal(area(), 'right', 300, false));

    act(() => result.current.reveal('a', { x: 50, y: 50 }, card(750)));
    expect(result.current.shown).toBe(true);
    act(() => result.current.reset(true));
    expect(result.current.coveredCard).toBeNull();
  });
});
