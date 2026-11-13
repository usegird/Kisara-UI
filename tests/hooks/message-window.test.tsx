// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useMessageWindow, type MessageWindow } from '@/hooks/chat/use-message-window';

// ─────────────────────────────
// 会話のログに一度に描く発言の範囲。
// 目印を見張る仕組みは差し替え、見えたことを試験から起こす。
// ─────────────────────────────

/** 見張っている目印ごとに、見えた・見えなくなったを試験から起こせる差し替え */
class FakeObserver {
  static latest: FakeObserver | null = null;

  private readonly callback: IntersectionObserverCallback;
  readonly targets: Element[] = [];

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    FakeObserver.latest = this;
  }

  observe(target: Element): void {
    this.targets.push(target);
  }

  disconnect(): void {}

  report(seen: ReadonlyMap<Element, boolean>): void {
    const entries = this.targets.map((target) => ({
      target,
      isIntersecting: seen.get(target) === true,
    })) as unknown as IntersectionObserverEntry[];
    this.callback(entries, this as unknown as IntersectionObserver);
  }
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  FakeObserver.latest = null;
});

const top = document.createElement('div');
const bottom = document.createElement('div');
const root = document.createElement('div');
const list = document.createElement('div');

function setup(initialTotal: number, size: number) {
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  let total = initialTotal;
  let key = 'c1';
  const hook = renderHook(() => useMessageWindow(total, { size }, key, root));
  act(() => {
    hook.result.current.attachTopMark(top);
    hook.result.current.attachBottomMark(bottom);
  });
  act(() => hook.result.current.attachList(list));
  const seeing = (onTop: boolean, onBottom: boolean, times = 1): void => {
    for (let round = 0; round < times; round += 1) {
      act(() =>
        FakeObserver.latest?.report(
          new Map([
            [top, onTop],
            [bottom, onBottom],
          ]),
        ),
      );
    }
  };
  const range = (): [number, number] => {
    const current: MessageWindow = hook.result.current;
    fillList(list, current.end - current.start, () => FAR_RECT);
    return [current.start, current.end];
  };
  return {
    range,
    seeing: (onTop: boolean, onBottom: boolean, times = 1): void => {
      for (let round = 0; round < times; round += 1) {
        range();
        seeing(onTop, onBottom);
      }
    },
    setTotal: (next: number) => {
      total = next;
      hook.rerender();
    },
    setKey: (next: string) => {
      key = next;
      hook.rerender();
    },
  };
}

/** 発言の要素を `count` 件に揃え、位置を差し替える */
function fillList(element: HTMLElement, count: number, rectOf: (at: number) => DOMRect): void {
  element.replaceChildren(
    ...Array.from({ length: count }, (_, at) => {
      const item = document.createElement('div');
      item.getBoundingClientRect = () => rectOf(at);
      return item;
    }),
  );
}

/** 先読みの遥か外の位置（`setup` では、どの発言も外してよい） */
const FAR_RECT = { top: 1e9, bottom: -1e9 } as DOMRect;

/** 欄の高さと、先読みの余白（px。`use-message-window` と同じ） */
const VIEW_HEIGHT = 800;
const NEAR = 400;

/**
 * 発言の高さを揃えた配置で、位置から目印の見え方を決める。位置は会話の先頭からの座標で持つ
 * （足し引きしてもブラウザの位置の保持で見ている所は動かない）
 */
function setupLayout({ total, size, height }: { total: number; size: number; height: number }) {
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  let count = total;
  let viewTop = Math.max(0, total * height - VIEW_HEIGHT);
  const hook = renderHook(() => useMessageWindow(count, { size }, 'c1', root));
  root.getBoundingClientRect = () => ({ top: viewTop, bottom: viewTop + VIEW_HEIGHT }) as DOMRect;
  act(() => {
    hook.result.current.attachTopMark(top);
    hook.result.current.attachBottomMark(bottom);
    hook.result.current.attachList(list);
  });
  const range = (): [number, number] => [hook.result.current.start, hook.result.current.end];
  const near = (y: number): boolean => y >= viewTop - NEAR && y <= viewTop + VIEW_HEIGHT + NEAR;
  /** 範囲が動かなくなるまで見え方を知らせ、動いた回数を返す */
  const settle = (): number => {
    for (let moves = 0; moves < 500; moves += 1) {
      const [start, end] = range();
      fillList(list, end - start, (at) => {
        const y = (start + at) * height;
        return { top: y, bottom: y + height } as DOMRect;
      });
      const seen = new Map([
        [top, near(start * height)],
        [bottom, near(end * height)],
      ]);
      act(() => FakeObserver.latest?.report(seen));
      const [nextStart, nextEnd] = range();
      if (nextStart === start && nextEnd === end) return moves;
    }
    return Number.POSITIVE_INFINITY;
  };
  return {
    range,
    settle,
    viewTop: () => viewTop,
    scrollBy: (dy: number) => {
      viewTop = Math.max(0, viewTop + dy);
    },
    setTotal: (next: number) => {
      count = next;
      hook.rerender();
    },
  };
}

describe('一度に描く発言の範囲', () => {
  it('開いたら新しい 20 件から', () => {
    const { range } = setup(300, 100);
    expect(range()).toEqual([280, 300]);
  });

  it('上へ読みに行くと古い側へ足し、上限を超えた分は最新の側から外す', () => {
    const { range, seeing } = setup(300, 100);
    seeing(true, false, 4);
    expect(range()).toEqual([200, 300]);
    seeing(true, false, 2);
    expect(range()).toEqual([160, 260]);
  });

  it('下へ戻ると最新の側を描き直し、古い側を外す。末尾まで来たら届いた発言も描く', () => {
    const { range, seeing, setTotal } = setup(300, 100);
    seeing(true, false, 6);
    seeing(false, true, 2);
    expect(range()).toEqual([200, 300]);

    setTotal(302);
    expect(range()).toEqual([200, 302]);
    seeing(false, false);
    expect(range()).toEqual([202, 302]);
  });

  it('最新を描いていない間に届いた発言は描き足さない', () => {
    const { range, seeing, setTotal } = setup(300, 100);
    seeing(true, false, 6);
    setTotal(302);
    expect(range()).toEqual([160, 260]);
  });

  it('目印が先読みに入る発言は外さず、件数を超えて描く', () => {
    // 高さ 10px なので、描いた分が全部先読みの中に入る（外すと古い発言へ戻れなくなる）
    const { range, settle } = setupLayout({ total: 300, size: 30, height: 10 });
    settle();
    expect(range()[0]).toBeLessThan(270);
    expect(range()[1]).toBe(300);
  });

  it.each([
    { size: 25, height: 200 },
    { size: 30, height: 60 },
    { size: 40, height: 60 },
    { size: 100, height: 60 },
  ])('上へ送っても範囲は往復しない（$size 件・高さ $height）', ({ size, height }) => {
    const { range, settle, scrollBy } = setupLayout({ total: 400, size, height });
    settle();
    for (let round = 0; round < 40; round += 1) {
      scrollBy(-250);
      // 落ち着くまでの動きは、向きを変えない
      expect(settle()).toBeLessThan(20);
    }
    expect(range()[0]).toBeLessThan(380);
  });

  it('読みに行ってから下へ戻ると、往復せずに最新まで描き直す', () => {
    const { range, settle, scrollBy } = setupLayout({ total: 400, size: 30, height: 60 });
    settle();
    for (let round = 0; round < 40; round += 1) {
      scrollBy(-250);
      settle();
    }
    expect(range()[1]).toBeLessThan(400);
    for (let round = 0; round < 60; round += 1) {
      scrollBy(250);
      expect(settle()).toBeLessThan(20);
    }
    expect(range()[1]).toBe(400);
  });

  it('見えている発言は外さず、先頭まで読みに行ける', () => {
    const { range, settle, scrollBy, viewTop } = setupLayout({ total: 200, size: 20, height: 120 });
    settle();
    for (let round = 0; round < 200 && viewTop() > 0; round += 1) {
      scrollBy(-250);
      settle();
    }
    expect(range()[0]).toBe(0);
    expect(viewTop()).toBe(0);
  });

  it('届いた発言で超えた分は、先読みの外なら古い側から外す', () => {
    const { range, settle, setTotal } = setupLayout({ total: 300, size: 20, height: 120 });
    settle();
    expect(range()).toEqual([280, 300]);
    setTotal(301);
    expect(range()).toEqual([280, 301]);
    settle();
    expect(range()).toEqual([281, 301]);
  });

  it('会話を替えたら新しい 20 件からやり直す', () => {
    const { range, seeing, setKey } = setup(300, 100);
    seeing(true, false, 6);
    setKey('c2');
    expect(range()).toEqual([280, 300]);
  });

  it('発言がまだ無い間は決めず、入ったら新しい 20 件から', () => {
    const { range, setTotal } = setup(0, 100);
    setTotal(50);
    expect(range()).toEqual([30, 50]);
  });

  it('目印を見張れない環境では全部描く', () => {
    const { result } = renderHook(() => useMessageWindow(300, { size: 100 }, 'c1', root));
    expect([result.current.start, result.current.end]).toEqual([0, 300]);
  });
});
