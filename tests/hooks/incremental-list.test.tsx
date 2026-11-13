// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useIncrementalList } from '@/hooks/ui/use-incremental-list';

// ─────────────────────────────
// 長い一覧を少しずつ描く。目印を見張る仕組みは差し替えて、見えたことにして進める。
// jsdom は IntersectionObserver を持たないので、**持たない環境の道**も確かめる。
// ─────────────────────────────

/** 目印が見えたことを試験から起こせる差し替え */
class FakeObserver {
  static latest: FakeObserver | null = null;

  private readonly callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    FakeObserver.latest = this;
  }

  observe(): void {}

  disconnect(): void {}

  /** 見えたことにして呼び戻す。フックは `isIntersecting` しか見ない */
  fire(): void {
    const entries = [{ isIntersecting: true }] as unknown as IntersectionObserverEntry[];
    this.callback(entries, this as unknown as IntersectionObserver);
  }
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  FakeObserver.latest = null;
});

function attach(sentinelRef: (element: HTMLElement | null) => void): void {
  act(() => {
    sentinelRef(document.createElement('div'));
  });
}

describe('少しずつ描く', () => {
  it('はじめは 1 まとまりだけ', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const { result } = renderHook(() => useIncrementalList(100, 40, 'a'));

    expect(result.current.count).toBe(40);
    expect(result.current.done).toBe(false);
  });

  it('総数がまとまりより少なければ描き終わり', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const { result } = renderHook(() => useIncrementalList(10, 40, 'a'));

    expect(result.current.count).toBe(10);
    expect(result.current.done).toBe(true);
  });

  it('目印が見えたら次のまとまりを足す', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const { result } = renderHook(() => useIncrementalList(100, 40, 'a'));
    attach(result.current.sentinelRef);

    act(() => FakeObserver.latest?.fire());

    expect(result.current.count).toBe(80);
  });

  it('絞り込みが変わったら先頭から数え直す', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => useIncrementalList(100, 40, key),
      { initialProps: { key: 'a' } },
    );
    attach(result.current.sentinelRef);
    act(() => FakeObserver.latest?.fire());

    rerender({ key: 'b' });

    expect(result.current.count).toBe(40);
  });

  it('目印を見張れない環境では全部描く', () => {
    const { result } = renderHook(() => useIncrementalList(100, 40, 'a'));
    attach(result.current.sentinelRef);

    expect(result.current.count).toBe(100);
    expect(result.current.done).toBe(true);
  });
});
