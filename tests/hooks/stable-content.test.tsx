// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useStableContent } from '@/hooks/ui/use-stable-content';

// 中身が同じなら前回の値を返す

describe('中身が同じなら前回の値', () => {
  it('中身が同じ間は最初の値を返し、変わったら新しい値を返す', () => {
    const first = [{ id: 1 }];
    const { result, rerender } = renderHook(({ value }) => useStableContent(value), {
      initialProps: { value: first },
    });

    rerender({ value: [{ id: 1 }] });
    expect(result.current).toBe(first);

    const changed = [{ id: 2 }];
    rerender({ value: changed });
    expect(result.current).toBe(changed);
  });
});
