// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { onStorageWriteFailure, safeStorage } from '@/lib/safe-storage';

// ─────────────────────────────
// 保存領域の入口。書けなかった値はページの間だけ持って読み、受けた側に伝える。
// ─────────────────────────────

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('保存領域の入口', () => {
  it('容量を超えて書けなければ、読むときに写しを返し、書けなかったことを伝える', () => {
    const failed = vi.fn();
    onStorageWriteFailure(failed);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });

    safeStorage().setItem('k', 'v');

    // 別の入口から読んでも同じ写しを見る
    expect(safeStorage().getItem('k')).toBe('v');
    expect(failed).toHaveBeenCalledWith('local');
  });

  it('書けたら写しを捨て、置き場の値を読む', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    safeStorage().setItem('k', 'old');
    vi.restoreAllMocks();

    safeStorage().setItem('k', 'new');
    expect(localStorage.getItem('k')).toBe('new');
    expect(safeStorage().getItem('k')).toBe('new');
  });
});
