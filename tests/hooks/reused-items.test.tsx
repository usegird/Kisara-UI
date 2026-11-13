// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useReusedItems } from '@/hooks/ui/use-reused-items';

// 組み直した並びでも、中身が同じ要素は前回のものを返す

const keyOf = (item: { readonly id: number }): number => item.id;

describe('中身が同じ要素は前回のもの', () => {
  it('変わった要素だけを新しくし、ほかは前回の参照を返す', () => {
    const a = { id: 1, value: 'a' };
    const b = { id: 2, value: 'b' };
    const { result, rerender } = renderHook(({ items }) => useReusedItems(items, keyOf), {
      initialProps: { items: [a, b] },
    });

    const changed = { id: 2, value: 'B' };
    rerender({ items: [{ id: 1, value: 'a' }, changed] });

    expect(result.current[0]).toBe(a);
    expect(result.current[1]).toBe(changed);
  });

  it('全部が前回と同じなら、並びも前回のものを返す', () => {
    const { result, rerender } = renderHook(({ items }) => useReusedItems(items, keyOf), {
      initialProps: { items: [{ id: 1 }, { id: 2 }] },
    });
    const first = result.current;

    rerender({ items: [{ id: 1 }, { id: 2 }] });

    expect(result.current).toBe(first);
  });
});
