import { describe, expect, it, vi } from 'vitest';

import { createSlotQueue } from '@/lib/slot-queue';

// ─────────────────────────────
// 同時に走らせる数を絞る順番待ち。空いた順に、頼んだ順で知らせる。
// ─────────────────────────────

describe('createSlotQueue', () => {
  it('上限までその場で渡し、返されたら待っている先頭へ渡す', () => {
    const queue = createSlotQueue(2);
    const grants = [vi.fn(), vi.fn(), vi.fn()];
    const [first] = grants.map((grant) => queue.request(grant));

    expect(grants.map((grant) => grant.mock.calls.length)).toEqual([1, 1, 0]);
    first?.();
    expect(grants[2]).toHaveBeenCalledTimes(1);
  });

  it('待っている間にやめたら渡さない。何度返しても枠は 1 つぶんだけ空く', () => {
    const queue = createSlotQueue(1);
    const running = queue.request(vi.fn());
    const dropped = vi.fn();
    const cancel = queue.request(dropped);
    const later = [vi.fn(), vi.fn()];
    later.forEach((grant) => queue.request(grant));

    cancel();
    running();
    running();
    expect(dropped).not.toHaveBeenCalled();
    expect(later[0]).toHaveBeenCalledTimes(1);
    expect(later[1]).not.toHaveBeenCalled();
  });
});
