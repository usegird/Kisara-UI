import { afterEach, describe, expect, it, vi } from 'vitest';

import { createPressGuard, guardPress, PRESS_GUARD_MS } from '@/lib/press-guard';

// ─────────────────────────────
// 押下の見張り。受け付けてから少しの間だけ同じ鍵の押下を捨て、完了は待たない
// ─────────────────────────────

afterEach(() => {
  vi.useRealTimers();
});

describe('createPressGuard', () => {
  it('間の中の重ね押しを捨て、間が過ぎたらまた受け付ける', () => {
    const accept = createPressGuard(300);
    expect(accept('run', 1000)).toBe(true);
    expect(accept('run', 1010)).toBe(false);
    expect(accept('run', 1299)).toBe(false);
    expect(accept('run', 1300)).toBe(true);
  });

  it('捨てた押下では間を延ばさない（押し続けても一定の間隔で受け付ける）', () => {
    const accept = createPressGuard(300);
    const taken = [0, 100, 200, 300, 400, 500, 600].filter((t) => accept('run', t));
    expect(taken).toEqual([0, 300, 600]);
  });

  it('鍵が違えば互いに止めない', () => {
    const accept = createPressGuard(300);
    expect(accept('run', 0)).toBe(true);
    expect(accept('workflow-save', 10)).toBe(true);
    expect(accept('queue:a', 20)).toBe(true);
    expect(accept('queue:b', 30)).toBe(true);
  });

  it('時計が戻っても止まったままにしない', () => {
    const accept = createPressGuard(300);
    expect(accept('run', 5000)).toBe(true);
    expect(accept('run', 100)).toBe(true);
  });
});

describe('guardPress', () => {
  it('不意の連打は 1 回だけ通し、間を空けた押下は押した数だけ通す', () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const press = guardPress('test-burst', run);
    for (let k = 0; k < 20; k++) press();
    expect(run).toHaveBeenCalledOnce();
    for (let k = 0; k < 3; k++) {
      vi.advanceTimersByTime(PRESS_GUARD_MS);
      press();
    }
    expect(run).toHaveBeenCalledTimes(4);
  });

  it('引数をそのまま渡す', () => {
    const open = vi.fn();
    guardPress('test-args', open)('a', 1);
    expect(open).toHaveBeenCalledWith('a', 1);
  });
});
